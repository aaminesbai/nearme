import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import type { Ack, Message, NearbyUser, User } from '@nearme/shared';
import { BORDEAUX } from '@nearme/shared';
import { pool } from '../src/db';

const base = process.env.TEST_API_URL ?? 'http://localhost:3000';
async function request<T>(
  path: string,
  token?: string,
  body?: unknown,
  method = body === undefined ? 'GET' : 'POST',
): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${result.message}`);
  return result as T;
}
async function connect(token: string) {
  const socket = io(base, { auth: { token }, transports: ['websocket'], reconnection: false });
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  return socket;
}
function event<T>(socket: Socket, name: string, body: unknown): Promise<T> {
  return new Promise((resolve, reject) =>
    socket
      .timeout(5000)
      .emit(name, body, (err: Error | null, reply: Ack<T>) =>
        err ? reject(err) : reply.ok ? resolve(reply.data) : reject(new Error(reply.error)),
      ),
  );
}
function next<T>(
  socket: Socket,
  name: string,
  filter: (value: T) => boolean = () => true,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(name, handler);
      reject(new Error(`Timeout: ${name}`));
    }, 6000);
    const handler = (value: T) => {
      if (!filter(value)) return;
      clearTimeout(timer);
      socket.off(name, handler);
      resolve(value);
    };
    socket.on(name, handler);
  });
}
test('real PostGIS + REST + Socket.IO acceptance and safety', { timeout: 45_000 }, async (t) => {
  const users: { user: User; token: string }[] = [];
  const sockets: Socket[] = [];
  const conversations: string[] = [];
  try {
    await t.test('health, migration, auth and charter gate', async () => {
      assert.equal((await request<{ database: string }>('/health')).database, 'postgis');
      for (const displayName of ['Alice', 'Bob', 'Carol'])
        users.push(
          await request('/users', undefined, {
            username: `test_${randomUUID().slice(0, 8)}`,
            displayName,
          }),
        );
      await assert.rejects(request('/nearby?radius=500', users[0].token), /403/);
      await assert.rejects(request('/users/me', 'invalid'), /401/);
      for (const user of users) await request('/users/me/charter', user.token, {});
      assert.equal((await request<User>('/users/me', users[0].token)).charterAccepted, true);
    });
    const [a, b, c] = users;
    await t.test(
      'real spatial radius filtering, sorting, precision, stale and invisible users',
      async () => {
        await request('/location', a.token, BORDEAUX);
        await request('/demo/seed', a.token, BORDEAUX);
        for (const [radius, count] of [
          [50, 0],
          [200, 1],
          [1000, 3],
          [5000, 5],
        ]) {
          const nearby = await request<NearbyUser[]>(`/nearby?radius=${radius}`, a.token);
          assert.equal(nearby.length, count);
          assert.ok(nearby.every((u) => u.distance <= radius));
          assert.deepEqual(
            nearby.map((u) => u.distance),
            [...nearby.map((u) => u.distance)].sort((a, b) => a - b),
          );
          assert.ok(
            nearby.every((u) => Math.abs(u.latitude * 1000 - Math.round(u.latitude * 1000)) < 1e-7),
          );
        }
        await assert.rejects(request('/nearby?radius=5001', a.token), /400/);
        await request('/location', b.token, BORDEAUX);
        assert.ok(
          (await request<NearbyUser[]>('/nearby?radius=200', a.token)).some(
            (u) => u.id === b.user.id,
          ),
        );
        await request('/users/me', b.token, { visible: false }, 'PATCH');
        assert.ok(
          !(await request<NearbyUser[]>('/nearby?radius=200', a.token)).some(
            (u) => u.id === b.user.id,
          ),
        );
        await request('/users/me', b.token, { visible: true }, 'PATCH');
        await pool.query(
          "UPDATE user_locations SET updated_at=now()-interval '13 minutes' WHERE user_id=$1",
          [b.user.id],
        );
        assert.ok(
          !(await request<NearbyUser[]>('/nearby?radius=200', a.token)).some(
            (u) => u.id === b.user.id,
          ),
        );
        await request('/location', b.token, BORDEAUX);
        assert.equal(
          (await request<NearbyUser[]>('/nearby?radius=5000', b.token)).filter((u) => u.isDemo)
            .length,
          0,
        );
      },
    );
    let conversationId = '';
    await t.test('concurrent conversation creation deduplicates both directions', async () => {
      const result = await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          request<{ id: string }>(
            `/conversations/with/${i % 2 ? a.user.id : b.user.id}`,
            i % 2 ? b.token : a.token,
            {},
          ),
        ),
      );
      assert.equal(new Set(result.map((r) => r.id)).size, 1);
      conversationId = result[0].id;
      conversations.push(conversationId);
      await assert.rejects(request(`/conversations/${conversationId}/messages`, c.token), /403/);
    });
    const sa = await connect(a.token);
    const sb = await connect(b.token);
    const sc = await connect(c.token);
    sockets.push(sa, sb, sc);
    await t.test('socket handshake rejects forged bearer token', async () => {
      await assert.rejects(connect('forged'), /Session/);
    });
    await t.test(
      'radius subscription, live enter/leave, typing, authorization and persisted messages',
      async () => {
        await event(sa, 'nearby:subscribe', { radius: 200 });
        const left = next<NearbyUser[]>(
          sa,
          'nearby:users',
          (users) => !users.some((u) => u.id === b.user.id),
        );
        await request('/location', b.token, { latitude: 45, longitude: 1 });
        await left;
        const entered = next<NearbyUser[]>(sa, 'nearby:users', (users) =>
          users.some((u) => u.id === b.user.id),
        );
        await request('/location', b.token, BORDEAUX);
        await entered;
        await event(sa, 'chat:join', { conversationId });
        await event(sb, 'chat:join', { conversationId });
        await assert.rejects(event(sc, 'chat:join', { conversationId }), /Acces/);
        const typing = next<{ typing: boolean }>(sb, 'typing:update');
        await event(sa, 'typing:update', { conversationId, typing: true });
        assert.equal((await typing).typing, true);
        const payload = {
          conversationId,
          clientId: randomUUID(),
          body: 'Bonjour depuis le test reel !',
        };
        const received = next<Message>(sb, 'message:new');
        const saved = await event<Message>(sa, 'message:send', payload);
        assert.equal((await received).id, saved.id);
        assert.equal(saved.senderId, a.user.id);
        assert.equal((await event<Message>(sa, 'message:send', payload)).id, saved.id);
        await assert.rejects(
          event(sc, 'message:send', { ...payload, clientId: randomUUID() }),
          /Acces/,
        );
        const history = await request<{ messages: Message[] }>(
          `/conversations/${conversationId}/messages`,
          b.token,
        );
        assert.equal(history.messages.length, 1);
        assert.equal(history.messages[0].body, payload.body);
        await event(sb, 'chat:leave', { conversationId });
      },
    );
    await t.test('demo chat replies through persisted server message path', async () => {
      const lina = (await request<NearbyUser[]>('/nearby?radius=200', a.token)).find(
        (u) => u.isDemo,
      )!;
      const chat = await request<{ id: string }>(`/conversations/with/${lina.id}`, a.token, {});
      conversations.push(chat.id);
      await event(sa, 'chat:join', { conversationId: chat.id });
      const reply = next<Message>(sa, 'message:new', (m) => m.senderId === lina.id);
      await event(sa, 'message:send', {
        conversationId: chat.id,
        clientId: randomUUID(),
        body: 'Salut Lina',
      });
      assert.equal((await reply).conversationId, chat.id);
      assert.equal(
        (await request<{ messages: Message[] }>(`/conversations/${chat.id}/messages`, a.token))
          .messages.length,
        2,
      );
    });
    await t.test(
      'history pagination preserves microsecond timestamps and has no gaps',
      async () => {
        const chat = await request<{ id: string }>(`/conversations/with/${c.user.id}`, a.token, {});
        conversations.push(chat.id);
        await pool.query(
          `INSERT INTO messages(conversation_id,sender_id,client_id,body,created_at) SELECT $1,$2,gen_random_uuid(),'pagination test','2026-09-08 12:00:00.000123+00' FROM generate_series(1,101)`,
          [chat.id, a.user.id],
        );
        let cursor: string | null = null;
        const found: string[] = [];
        do {
          const result: { messages: Message[]; nextCursor: string | null } = await request(
            `/conversations/${chat.id}/messages${cursor ? `?before=${cursor}` : ''}`,
            a.token,
          );
          found.push(...result.messages.map((message) => message.id));
          cursor = result.nextCursor;
        } while (cursor);
        assert.equal(found.length, 101);
        assert.equal(new Set(found).size, 101);
      },
    );
    await t.test(
      'push token registration authenticates and validates device payloads',
      async () => {
        await assert.rejects(
          request('/devices/push-token', 'invalid', {
            token: 'ExpoPushToken[test_device]',
            platform: 'android',
          }),
          /401/,
        );
        await assert.rejects(
          request('/devices/push-token', a.token, { token: 'invalid', platform: 'android' }),
          /400/,
        );
        await request('/devices/push-token', a.token, {
          token: 'ExpoPushToken[test_device]',
          platform: 'android',
        });
        await request('/devices/push-token', a.token, {
          token: 'ExpoPushToken[test_device]',
          platform: 'ios',
        });
        const tokens = await pool.query('SELECT platform FROM push_tokens WHERE user_id=$1', [
          a.user.id,
        ]);
        assert.equal(tokens.rows.length, 1);
        assert.equal(tokens.rows[0].platform, 'ios');
        await pool.query('DELETE FROM push_tokens WHERE user_id=$1', [a.user.id]);
      },
    );
    await t.test('report persists; block removes discovery and prevents messages', async () => {
      await request(`/users/${b.user.id}/report`, a.token, { reason: 'Test du signalement' });
      await request(`/users/${b.user.id}/block`, a.token, {});
      assert.ok(
        !(await request<NearbyUser[]>('/nearby?radius=200', a.token)).some(
          (u) => u.id === b.user.id,
        ),
      );
      await assert.rejects(
        event(sb, 'message:send', { conversationId, clientId: randomUUID(), body: 'blocked' }),
        /indisponible/,
      );
      await assert.rejects(request(`/conversations/with/${a.user.id}`, b.token, {}), /403/);
    });
  } finally {
    sockets.forEach((s) => s.disconnect());
    await pool.query('DELETE FROM conversations WHERE id=ANY($1::uuid[])', [conversations]);
    const ids = users.map((u) => u.user.id);
    await pool.query(
      'DELETE FROM reports WHERE reporter_id=ANY($1::uuid[]) OR reported_id=ANY($1::uuid[])',
      [ids],
    );
    await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [ids]);
    await pool.end();
  }
});
