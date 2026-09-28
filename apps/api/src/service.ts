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
import { Prisma } from './generated/prisma/client';
import { prisma, pairTransaction } from './db';
import { config } from './config';

const columns = `u.id, u.username, u.display_name AS "displayName", u.avatar, u.bio, u.visible,
  (u.charter_accepted_at IS NOT NULL AND u.charter_version = '${CHARTER_VERSION}') AS "charterAccepted",
  u.charter_version AS "charterVersion", u.is_demo AS "isDemo"`;
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const tokenExpiry = () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
export const pairKey = (a: string, b: string) => [a, b].sort().join(':');
export const messageColumns = `id, conversation_id AS "conversationId", sender_id AS "senderId", client_id AS "clientId", body, created_at AS "createdAt"`;
const userSelect = {
  id: true,
  username: true,
  displayName: true,
  avatar: true,
  bio: true,
  visible: true,
  charterAcceptedAt: true,
  charterVersion: true,
  isDemo: true,
} satisfies Prisma.UserSelect;
type UserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;
const toUser = (row: UserRow): User => ({
  id: row.id,
  username: row.username,
  displayName: row.displayName,
  avatar: row.avatar,
  bio: row.bio,
  visible: row.visible,
  charterAccepted: row.charterAcceptedAt !== null && row.charterVersion === CHARTER_VERSION,
  charterVersion: row.charterVersion,
  isDemo: row.isDemo,
});

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
    const user = await prisma.user.create({
      data: {
        username: input.username,
        displayName: input.displayName,
        avatar: input.avatar,
        bio: input.bio,
        tokenHash: tokenHash(token),
        tokenExpiresAt: tokenExpiry(),
        passwordHash,
      },
      select: { id: true },
    });
    return { user: await this.me(user.id), token };
  }
  async login(username: string, password: string) {
    const account = await prisma.user.findFirst({
      where: { username, isDemo: false },
      select: { id: true, passwordHash: true },
    });
    if (!account?.passwordHash || !(await verifyPassword(password, account.passwordHash)))
      throw new UnauthorizedException('Pseudo ou mot de passe incorrect');
    const token = randomBytes(32).toString('base64url');
    await prisma.user.update({
      where: { id: account.id },
      data: { tokenHash: tokenHash(token), tokenExpiresAt: tokenExpiry() },
    });
    return { user: await this.me(account.id), token };
  }
  async logout(id: string) {
    await prisma.user.updateMany({
      where: { id },
      data: { tokenHash: null, tokenExpiresAt: null },
    });
    return { success: true };
  }
  async changePassword(id: string, currentPassword: string | undefined, newPassword: string) {
    const account = await prisma.user.findFirst({
      where: { id, isDemo: false },
      select: { passwordHash: true },
    });
    if (!account) throw new NotFoundException('Profil introuvable');
    if (
      account.passwordHash &&
      (!currentPassword || !(await verifyPassword(currentPassword, account.passwordHash)))
    )
      throw new UnauthorizedException('Mot de passe actuel incorrect');
    await prisma.user.update({
      where: { id },
      data: { passwordHash: await hashPassword(newPassword) },
    });
    return { success: true };
  }
  async deleteAccount(id: string) {
    await prisma.$transaction(async (tx) => {
      await tx.report.deleteMany({ where: { OR: [{ reporterId: id }, { reportedId: id }] } });
      await tx.conversation.deleteMany({ where: { members: { some: { userId: id } } } });
      await tx.user.deleteMany({ where: { id, isDemo: false } });
      this.online.delete(id);
    });
  }
  async authenticate(token: string | undefined): Promise<User> {
    if (!token || token.length > 200) throw new UnauthorizedException('Session manquante');
    const user = await prisma.user.findFirst({
      where: { tokenHash: tokenHash(token), tokenExpiresAt: { gt: new Date() }, isDemo: false },
      select: userSelect,
    });
    if (!user) throw new UnauthorizedException('Session invalide');
    return toUser(user);
  }
  async me(id: string): Promise<User> {
    const user = await prisma.user.findUnique({ where: { id }, select: userSelect });
    if (!user) throw new NotFoundException('Profil introuvable');
    return toUser(user);
  }
  async accept(id: string) {
    await prisma.user.update({
      where: { id },
      data: { charterAcceptedAt: new Date(), charterVersion: CHARTER_VERSION },
    });
    return this.me(id);
  }
  async updateProfile(id: string, patch: Partial<ProfileInput> & { visible?: boolean }) {
    await prisma.user.update({ where: { id }, data: patch });
    if (patch.visible !== undefined)
      await prisma.userLocation.updateMany({
        where: { userId: id },
        data: { visible: patch.visible },
      });
    return this.me(id);
  }
  async location(id: string, point: Point) {
    await prisma.$executeRaw`
      INSERT INTO user_locations(user_id,location,visible)
      VALUES(${id}::uuid,ST_SetSRID(ST_MakePoint(${point.longitude},${point.latitude}),4326)::geography,
        (SELECT visible FROM users WHERE id=${id}::uuid))
      ON CONFLICT(user_id) DO UPDATE
      SET location=EXCLUDED.location,updated_at=now(),visible=EXCLUDED.visible`;
    return { updatedAt: new Date().toISOString() };
  }
  async nearby(id: string, radius: number): Promise<NearbyUser[]> {
    // Production must further fuzz/quantize third-party coordinates and resist triangulation.
    // Exact third-party GPS coordinates are a privacy risk. Only approximate markers leave this API.
    const rows = await prisma.$queryRaw<NearbyUser[]>(Prisma.sql`
      SELECT ${Prisma.raw(columns)}, ROUND(ST_Distance(l.location, mine.location))::int AS distance,
      ROUND(ST_Y(l.location::geometry)::numeric,3)::float8 AS latitude,
      ROUND(ST_X(l.location::geometry)::numeric,3)::float8 AS longitude, l.updated_at AS "updatedAt"
      FROM user_locations mine JOIN user_locations l ON l.user_id <> mine.user_id
      JOIN users u ON u.id=l.user_id
      WHERE mine.user_id=${id}::uuid AND l.visible AND u.visible
      AND mine.updated_at > now()-(${STALE_LOCATION_MINUTES} * interval '1 minute')
      AND l.updated_at > now()-(${STALE_LOCATION_MINUTES} * interval '1 minute')
      AND (NOT u.is_demo OR (${config.demo} AND u.demo_owner=${id}::uuid))
      AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=${id}::uuid AND b.blocked_id=u.id) OR (b.blocked_id=${id}::uuid AND b.blocker_id=u.id))
      AND ST_DWithin(l.location,mine.location,${radius})
      ORDER BY ST_Distance(l.location,mine.location) LIMIT 100`);
    return rows.map((user) => ({
      ...user,
      updatedAt: new Date(user.updatedAt).toISOString(),
      online: user.isDemo || this.online.has(user.id),
    }));
  }
  async assertPeer(
    id: string,
    peer: string,
    db: typeof prisma | Prisma.TransactionClient = prisma,
  ) {
    if (id === peer) throw new BadRequestException('Choisis une autre personne');
    const result = await db.user.findFirst({
      where: {
        id: peer,
        OR: config.demo
          ? [{ isDemo: false }, { isDemo: true, demoOwnerId: id }]
          : [{ isDemo: false }],
        blocksReceived: { none: { blockerId: id } },
        blocksCreated: { none: { blockedId: id } },
      },
      select: { id: true },
    });
    if (!result) throw new ForbiddenException('Conversation indisponible');
  }
  async conversation(id: string, peer: string) {
    return pairTransaction(pairKey(id, peer), async (client) => {
      await this.assertPeer(id, peer, client);
      const conversation = await client.conversation.upsert({
        where: { pairKey: pairKey(id, peer) },
        create: { pairKey: pairKey(id, peer) },
        update: {},
        select: { id: true },
      });
      await client.conversationMember.createMany({
        data: [
          { conversationId: conversation.id, userId: id },
          { conversationId: conversation.id, userId: peer },
        ],
        skipDuplicates: true,
      });
      return conversation;
    });
  }
  async authorizeConversation(id: string, conversationId: string) {
    const membership = await prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId: id } },
      select: {
        conversation: {
          select: { members: { where: { userId: { not: id } }, select: { userId: true } } },
        },
      },
    });
    const peer = membership?.conversation.members[0]?.userId;
    if (!peer) throw new ForbiddenException('Acces refuse');
    await this.assertPeer(id, peer);
    return peer;
  }
  async conversations(id: string): Promise<Conversation[]> {
    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        peer: User;
        lastMessage: string | null;
        updatedAt: Date;
        unread: number;
      }>
    >(Prisma.sql`SELECT c.id, row_to_json(profile) AS peer, latest.body AS "lastMessage", COALESCE(latest.created_at,c.created_at) AS "updatedAt",
      (SELECT count(*)::int FROM messages WHERE conversation_id=c.id AND sender_id<>${id}::uuid AND created_at>self.last_read_at) AS unread
      FROM conversations c JOIN conversation_members self ON self.conversation_id=c.id AND self.user_id=${id}::uuid
      JOIN conversation_members other ON other.conversation_id=c.id AND other.user_id<>${id}::uuid
      JOIN LATERAL (SELECT ${Prisma.raw(columns)} FROM users u WHERE u.id=other.user_id) profile ON true
      LEFT JOIN LATERAL(SELECT body,created_at FROM messages WHERE conversation_id=c.id ORDER BY created_at DESC,id DESC LIMIT 1) latest ON true
      WHERE NOT EXISTS(SELECT 1 FROM blocks WHERE (blocker_id=${id}::uuid AND blocked_id=other.user_id) OR (blocker_id=other.user_id AND blocked_id=${id}::uuid))
      ORDER BY "updatedAt" DESC`);
    return rows.map((row) => ({
      ...row,
      updatedAt: new Date(row.updatedAt).toISOString(),
      online: row.peer.isDemo || this.online.has(row.peer.id),
    }));
  }
  async history(id: string, conversationId: string, before?: string) {
    await this.authorizeConversation(id, conversationId);
    const cursor = before
      ? await prisma.$queryRaw<Array<{ created_at: string; id: string }>>`
          SELECT created_at::text AS created_at,id FROM messages
          WHERE id=${before}::uuid AND conversation_id=${conversationId}::uuid`
      : undefined;
    if (before && !cursor?.length) throw new BadRequestException('Curseur invalide');
    const cursorTime = cursor?.[0]?.created_at ?? null;
    const rows = await prisma.$queryRaw<Array<Omit<Message, 'createdAt'> & { createdAt: Date }>>`
      SELECT ${Prisma.raw(messageColumns)} FROM messages WHERE conversation_id=${conversationId}::uuid
      AND (${cursorTime}::timestamptz IS NULL OR (created_at,id)<(${cursorTime}::timestamptz,${before}::uuid))
      ORDER BY created_at DESC,id DESC LIMIT 50`;
    const messages = rows.reverse().map((message) => ({
      ...message,
      createdAt: new Date(message.createdAt).toISOString(),
    }));
    return { messages, nextCursor: rows.length === 50 ? rows[0].id : null };
  }
  async read(id: string, conversationId: string) {
    await this.authorizeConversation(id, conversationId);
    await prisma.conversationMember.updateMany({
      where: { conversationId, userId: id },
      data: { lastReadAt: new Date() },
    });
  }
  async send(id: string, data: { conversationId: string; clientId: string; body: string }) {
    const peer = await this.authorizeConversation(id, data.conversationId);
    return pairTransaction(pairKey(id, peer), async (tx) => {
      await this.assertPeer(id, peer, tx);
      const inserted = await tx.message.createMany({
        data: [
          {
            conversationId: data.conversationId,
            senderId: id,
            clientId: data.clientId,
            body: data.body,
          },
        ],
        skipDuplicates: true,
      });
      const existing = await tx.message.findUnique({
        where: { senderId_clientId: { senderId: id, clientId: data.clientId } },
      });
      if (
        !existing ||
        existing.conversationId !== data.conversationId ||
        existing.body !== data.body
      )
        throw new BadRequestException('Identifiant de message deja utilise');
      if (inserted.count === 1)
        await tx.pushOutbox.create({
          data: { recipientId: peer, messageId: existing.id },
        });
      return {
        message: { ...existing, createdAt: existing.createdAt.toISOString() },
        peer,
        fresh: inserted.count === 1,
      };
    });
  }
  async block(id: string, peer: string) {
    if (id === peer) throw new BadRequestException('Action invalide');
    await pairTransaction(pairKey(id, peer), async (tx) =>
      tx.block.upsert({
        where: { blockerId_blockedId: { blockerId: id, blockedId: peer } },
        create: { blockerId: id, blockedId: peer },
        update: {},
      }),
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
      const person = await prisma.user.upsert({
        where: { username },
        create: {
          username,
          displayName: name,
          avatar,
          bio: 'Balades, bons cafes et nouvelles rencontres.',
          isDemo: true,
          demoOwnerId: id,
          charterAcceptedAt: new Date(),
        },
        update: { displayName: name },
        select: { id: true },
      });
      await this.location(person.id, offsetPoint(origin, distance, bearing));
    }
    return { count: people.length };
  }
}
export const data = new DataService();
