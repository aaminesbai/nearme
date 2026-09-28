import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  CHARTER_VERSION,
  STALE_LOCATION_MINUTES,
  offsetPoint,
  type Point,
  type ProfileInput,
  type User,
  type NearbyUser,
  type Message,
  type Conversation,
} from '@nearme/shared';
import type { PoolClient } from 'pg';
import { pool, pairTransaction } from './db';
import { config } from './config';

const columns = `u.id, u.username, u.display_name AS "displayName", u.avatar, u.bio, u.visible,
  (u.charter_accepted_at IS NOT NULL AND u.charter_version = '${CHARTER_VERSION}') AS "charterAccepted",
  u.charter_version AS "charterVersion", u.is_demo AS "isDemo"`;
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export const pairKey = (a: string, b: string) => [a, b].sort().join(':');
export const messageColumns = `id, conversation_id AS "conversationId", sender_id AS "senderId", client_id AS "clientId", body, created_at AS "createdAt"`;

function derivePassword(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, 64, (error, key) => (error ? reject(error) : resolve(key as Buffer))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await derivePassword(password, salt);
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, saltValue, hashValue, extra] = stored.split('$');
  if (algorithm !== 'scrypt' || !saltValue || !hashValue || extra !== undefined) return false;
  try {
    const salt = Buffer.from(saltValue, 'base64url');
    const expected = Buffer.from(hashValue, 'base64url');
    if (salt.length !== 16 || expected.length !== 64) return false;
    const actual = await derivePassword(password, salt);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export class DataService {
  online = new Set<string>();
  async register(input: ProfileInput & { password: string }) {
    const token = randomBytes(32).toString('base64url');
    const passwordHash = await hashPassword(input.password);
    const result = await pool.query<{ id: string }>(
      `INSERT INTO users(username,display_name,avatar,bio,token_hash,password_hash) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
      [input.username, input.displayName, input.avatar, input.bio, tokenHash(token), passwordHash],
    );
    return { user: await this.me(result.rows[0].id), token };
  }
  async login(username: string, password: string) {
    const { rows } = await pool.query<{ id: string; passwordHash: string | null }>(
      'SELECT id,password_hash AS "passwordHash" FROM users WHERE username=$1 AND NOT is_demo',
      [username],
    );
    const account = rows[0];
    if (!account?.passwordHash || !(await verifyPassword(password, account.passwordHash)))
      throw new UnauthorizedException('Pseudo ou mot de passe incorrect');
    const token = randomBytes(32).toString('base64url');
    await pool.query('UPDATE users SET token_hash=$2 WHERE id=$1', [account.id, tokenHash(token)]);
    return { user: await this.me(account.id), token };
  }
  async logout(id: string) {
    await pool.query('UPDATE users SET token_hash=NULL WHERE id=$1', [id]);
    return { success: true };
  }
  async changePassword(id: string, currentPassword: string | undefined, newPassword: string) {
    const { rows } = await pool.query<{ passwordHash: string | null }>(
      'SELECT password_hash AS "passwordHash" FROM users WHERE id=$1 AND NOT is_demo',
      [id],
    );
    if (!rows[0]) throw new NotFoundException('Profil introuvable');
    if (
      rows[0].passwordHash &&
      (!currentPassword || !(await verifyPassword(currentPassword, rows[0].passwordHash)))
    )
      throw new UnauthorizedException('Mot de passe actuel incorrect');
    await pool.query('UPDATE users SET password_hash=$2 WHERE id=$1', [
      id,
      await hashPassword(newPassword),
    ]);
    return { success: true };
  }
  async deleteAccount(id: string) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM reports WHERE reporter_id=$1 OR reported_id=$1', [id]);
      await client.query(
        'DELETE FROM conversations WHERE id IN (SELECT conversation_id FROM conversation_members WHERE user_id=$1)',
        [id],
      );
      await client.query('DELETE FROM users WHERE id=$1 AND NOT is_demo', [id]);
      await client.query('COMMIT');
      this.online.delete(id);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async authenticate(token: string | undefined): Promise<User> {
    if (!token || token.length > 200) throw new UnauthorizedException('Session manquante');
    const { rows } = await pool.query<User>(
      `SELECT ${columns} FROM users u WHERE token_hash=$1 AND NOT is_demo`,
      [tokenHash(token)],
    );
    if (!rows[0]) throw new UnauthorizedException('Session invalide');
    return rows[0];
  }
  async me(id: string): Promise<User> {
    const { rows } = await pool.query<User>(`SELECT ${columns} FROM users u WHERE id=$1`, [id]);
    if (!rows[0]) throw new NotFoundException('Profil introuvable');
    return rows[0];
  }
  async accept(id: string) {
    await pool.query('UPDATE users SET charter_accepted_at=now(), charter_version=$2 WHERE id=$1', [
      id,
      CHARTER_VERSION,
    ]);
    return this.me(id);
  }
  async updateProfile(id: string, patch: Partial<ProfileInput> & { visible?: boolean }) {
    await pool.query(
      `UPDATE users SET display_name=COALESCE($2,display_name), bio=COALESCE($3,bio), avatar=COALESCE($4,avatar), visible=COALESCE($5,visible), username=COALESCE($6,username) WHERE id=$1`,
      [id, patch.displayName, patch.bio, patch.avatar, patch.visible, patch.username],
    );
    await pool.query(
      'UPDATE user_locations SET visible=(SELECT visible FROM users WHERE id=$1) WHERE user_id=$1',
      [id],
    );
    return this.me(id);
  }
  async location(id: string, point: Point) {
    await pool.query(
      `INSERT INTO user_locations(user_id,location,visible) VALUES($1,ST_SetSRID(ST_MakePoint($2,$3),4326)::geography,(SELECT visible FROM users WHERE id=$1)) ON CONFLICT(user_id) DO UPDATE SET location=EXCLUDED.location,updated_at=now(),visible=EXCLUDED.visible`,
      [id, point.longitude, point.latitude],
    );
    return { updatedAt: new Date().toISOString() };
  }
  async nearby(id: string, radius: number): Promise<NearbyUser[]> {
    // Production must further fuzz/quantize third-party coordinates and resist triangulation.
    // Exact third-party GPS coordinates are a privacy risk. Only approximate markers leave this API.
    const { rows } = await pool.query<NearbyUser>(
      `
      SELECT ${columns}, ROUND(ST_Distance(l.location, mine.location))::int AS distance,
      ROUND(ST_Y(l.location::geometry)::numeric,3)::float8 AS latitude,
      ROUND(ST_X(l.location::geometry)::numeric,3)::float8 AS longitude, l.updated_at AS "updatedAt"
      FROM user_locations mine JOIN user_locations l ON l.user_id <> mine.user_id
      JOIN users u ON u.id=l.user_id
      WHERE mine.user_id=$1 AND l.visible AND u.visible
      AND mine.updated_at > now()-($3 * interval '1 minute')
      AND l.updated_at > now()-($3 * interval '1 minute')
      AND (NOT u.is_demo OR ($4 AND u.demo_owner=$1))
      AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=u.id) OR (b.blocked_id=$1 AND b.blocker_id=u.id))
      AND ST_DWithin(l.location,mine.location,$2)
      ORDER BY ST_Distance(l.location,mine.location) LIMIT 100`,
      [id, radius, STALE_LOCATION_MINUTES, config.demo],
    );
    return rows.map((user) => ({ ...user, online: user.isDemo || this.online.has(user.id) }));
  }
  async assertPeer(id: string, peer: string, db: Pick<PoolClient, 'query'> = pool) {
    if (id === peer) throw new BadRequestException('Choisis une autre personne');
    const result = await db.query(
      `SELECT 1 FROM users u WHERE u.id=$2 AND (NOT is_demo OR ($3 AND demo_owner=$1)) AND NOT EXISTS(SELECT 1 FROM blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1))`,
      [id, peer, config.demo],
    );
    if (!result.rowCount) throw new ForbiddenException('Conversation indisponible');
  }
  async conversation(id: string, peer: string) {
    return pairTransaction(pairKey(id, peer), async (client) => {
      await this.assertPeer(id, peer, client);
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO conversations(pair_key) VALUES($1) ON CONFLICT(pair_key) DO UPDATE SET pair_key=EXCLUDED.pair_key RETURNING id`,
        [pairKey(id, peer)],
      );
      const conversationId = rows[0].id;
      await client.query(
        'INSERT INTO conversation_members(conversation_id,user_id) VALUES($1,$2),($1,$3) ON CONFLICT DO NOTHING',
        [conversationId, id, peer],
      );
      return { id: conversationId };
    });
  }
  async authorizeConversation(id: string, conversationId: string) {
    const { rows } = await pool.query<{ user_id: string }>(
      `SELECT peer.user_id FROM conversation_members self JOIN conversation_members peer USING(conversation_id) WHERE self.user_id=$1 AND self.conversation_id=$2 AND peer.user_id<>$1`,
      [id, conversationId],
    );
    if (!rows[0]) throw new ForbiddenException('Acces refuse');
    await this.assertPeer(id, rows[0].user_id);
    return rows[0].user_id;
  }
  async conversations(id: string): Promise<Conversation[]> {
    const { rows } = await pool.query(
      `SELECT c.id, row_to_json(profile) AS peer, latest.body AS "lastMessage", COALESCE(latest.created_at,c.created_at) AS "updatedAt",
      (SELECT count(*)::int FROM messages WHERE conversation_id=c.id AND sender_id<>$1 AND created_at>self.last_read_at) AS unread
      FROM conversations c JOIN conversation_members self ON self.conversation_id=c.id AND self.user_id=$1
      JOIN conversation_members other ON other.conversation_id=c.id AND other.user_id<>$1
      JOIN LATERAL (SELECT ${columns} FROM users u WHERE u.id=other.user_id) profile ON true
      LEFT JOIN LATERAL(SELECT body,created_at FROM messages WHERE conversation_id=c.id ORDER BY created_at DESC,id DESC LIMIT 1) latest ON true
      WHERE NOT EXISTS(SELECT 1 FROM blocks WHERE (blocker_id=$1 AND blocked_id=other.user_id) OR (blocker_id=other.user_id AND blocked_id=$1))
      ORDER BY "updatedAt" DESC`,
      [id],
    );
    return rows.map((row) => ({
      ...row,
      online: row.peer.isDemo || this.online.has(row.peer.id),
    })) as Conversation[];
  }
  async history(id: string, conversationId: string, before?: string) {
    await this.authorizeConversation(id, conversationId);
    const cursor = before
      ? await pool.query(
          'SELECT created_at::text AS created_at,id FROM messages WHERE id=$1 AND conversation_id=$2',
          [before, conversationId],
        )
      : undefined;
    if (before && !cursor?.rowCount) throw new BadRequestException('Curseur invalide');
    const { rows } = await pool.query<Message>(
      `SELECT ${messageColumns} FROM messages WHERE conversation_id=$1 AND ($2::timestamptz IS NULL OR (created_at,id)<($2::timestamptz,$3::uuid)) ORDER BY created_at DESC,id DESC LIMIT 50`,
      [conversationId, cursor?.rows[0]?.created_at ?? null, before ?? null],
    );
    return { messages: rows.reverse(), nextCursor: rows.length === 50 ? rows[0].id : null };
  }
  async read(id: string, conversationId: string) {
    await this.authorizeConversation(id, conversationId);
    await pool.query(
      'UPDATE conversation_members SET last_read_at=now() WHERE conversation_id=$1 AND user_id=$2',
      [conversationId, id],
    );
  }
  async send(id: string, data: { conversationId: string; clientId: string; body: string }) {
    const peer = await this.authorizeConversation(id, data.conversationId);
    return pairTransaction(pairKey(id, peer), async (client) => {
      await this.assertPeer(id, peer, client);
      const { rows } = await client.query<Message>(
        `INSERT INTO messages(conversation_id,sender_id,client_id,body) VALUES($1,$2,$3,$4) ON CONFLICT(sender_id,client_id) DO NOTHING RETURNING ${messageColumns}`,
        [data.conversationId, id, data.clientId, data.body],
      );
      if (rows[0]) return { message: rows[0], peer, fresh: true };
      const existing = await client.query<Message>(
        `SELECT ${messageColumns} FROM messages WHERE sender_id=$1 AND client_id=$2`,
        [id, data.clientId],
      );
      if (
        existing.rows[0].conversationId !== data.conversationId ||
        existing.rows[0].body !== data.body
      )
        throw new BadRequestException('Identifiant de message deja utilise');
      return { message: existing.rows[0], peer, fresh: false };
    });
  }
  async block(id: string, peer: string) {
    if (id === peer) throw new BadRequestException('Action invalide');
    await pairTransaction(pairKey(id, peer), (client) =>
      client.query(
        'INSERT INTO blocks(blocker_id,blocked_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
        [id, peer],
      ),
    );
    return { success: true };
  }
  async seed(id: string, origin: Point) {
    if (!config.demo) throw new NotFoundException();
    const people = [
      ['Lina', 80, 35, 0],
      ['Sarah', 250, 120, 1],
      ['Yassine', 700, 230, 2],
      ['Lucas', 1400, 300, 3],
      ['Emma', 3000, 65, 4],
    ] as const;
    for (const [name, distance, bearing, avatar] of people) {
      const username = `demo_${name.toLowerCase()}_${id.replaceAll('-', '')}`;
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO users(username,display_name,avatar,bio,is_demo,demo_owner,charter_accepted_at) VALUES($1,$2,$3,$4,true,$5,now()) ON CONFLICT(username) DO UPDATE SET display_name=EXCLUDED.display_name RETURNING id`,
        [username, name, avatar, 'Balades, bons cafes et nouvelles rencontres.', id],
      );
      await this.location(rows[0].id, offsetPoint(origin, distance, bearing));
    }
    return { count: people.length };
  }
}
export const data = new DataService();
