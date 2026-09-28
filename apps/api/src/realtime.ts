import { randomUUID } from 'node:crypto';
import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { z } from 'zod';
import {
  conversationSchema,
  messageSchema,
  pointSchema,
  radiusSchema,
  type Ack,
  type User,
} from '@nearme/shared';
import { config } from './config';
import { data } from './service';
import { PushNotificationService } from './push';
import { needsPush } from './presence';

interface Session {
  user: User;
  radius?: number;
  activeConversation?: string;
  lastLocation?: number;
  count: number;
  window: number;
}
export class Realtime {
  readonly io: Server;
  private push = new PushNotificationService();
  private pending?: ReturnType<typeof setTimeout>;
  private refreshing = false;
  private timer: ReturnType<typeof setInterval>;
  constructor(server: HttpServer) {
    this.io = new Server(server, { cors: { origin: config.origins }, maxHttpBufferSize: 16_384 });
    this.io.use(async (socket, next) => {
      try {
        const user = await data.authenticate(socket.handshake.auth.token);
        if (!user.charterAccepted) throw new Error('Accepte la charte avant de continuer');
        socket.data = { user, count: 0, window: Date.now() } satisfies Session;
        next();
      } catch {
        next(new Error('Session invalide ou charte non acceptee'));
      }
    });
    this.io.on('connection', (socket) => this.connect(socket));
    this.timer = setInterval(() => this.refresh(), 15_000);
    this.timer.unref();
  }
  private connect(socket: Socket) {
    const state = socket.data as Session;
    data.online.add(state.user.id);
    void socket.join(`user:${state.user.id}`);
    this.refresh();
    this.handle(
      socket,
      'nearby:subscribe',
      z.object({ radius: radiusSchema }),
      async ({ radius }) => {
        state.radius = radius;
        const users = await data.nearby(state.user.id, radius);
        socket.emit('nearby:users', users);
        return users;
      },
    );
    this.handle(socket, 'location:update', pointSchema, async (point) => {
      if (Date.now() - (state.lastLocation ?? 0) < 3000)
        throw new Error('Localisation trop frequente');
      state.lastLocation = Date.now();
      const result = await data.location(state.user.id, point);
      this.refresh();
      return result;
    });
    this.handle(socket, 'chat:join', conversationSchema, async ({ conversationId }) => {
      const peer = await data.authorizeConversation(state.user.id, conversationId);
      if (state.activeConversation) await socket.leave(`chat:${state.activeConversation}`);
      state.activeConversation = conversationId;
      await socket.join(`chat:${conversationId}`);
      await data.read(state.user.id, conversationId);
      return { online: data.online.has(peer) || (await data.me(peer)).isDemo };
    });
    this.handle(socket, 'chat:leave', conversationSchema, async ({ conversationId }) => {
      await socket.leave(`chat:${conversationId}`);
      if (state.activeConversation === conversationId) state.activeConversation = undefined;
      return { success: true };
    });
    this.handle(
      socket,
      'typing:update',
      conversationSchema.extend({ typing: z.boolean() }),
      async ({ conversationId, typing }) => {
        await data.authorizeConversation(state.user.id, conversationId);
        socket
          .to(`chat:${conversationId}`)
          .emit('typing:update', { conversationId, userId: state.user.id, typing });
        return { success: true };
      },
    );
    this.handle(socket, 'message:send', messageSchema, async (input) => {
      const result = await data.send(state.user.id, input);
      if (result.fresh) {
        await this.deliver(result.message, result.peer, state.user);
        const peer = await data.me(result.peer);
        if (config.demo && peer.isDemo) {
          this.io.to(`chat:${input.conversationId}`).emit('typing:update', {
            conversationId: input.conversationId,
            userId: peer.id,
            typing: true,
          });
          const timer = setTimeout(() => {
            void this.demoReply(peer, state.user.id, input.conversationId).catch((e: unknown) =>
              console.warn('Demo reply skipped', e instanceof Error ? e.message : 'unknown'),
            );
          }, 1300);
          timer.unref();
        }
      }
      return result.message;
    });
    socket.on('disconnect', () => {
      if (state.activeConversation)
        this.io.to(`chat:${state.activeConversation}`).emit('typing:update', {
          conversationId: state.activeConversation,
          userId: state.user.id,
          typing: false,
        });
      const others = [...this.io.sockets.sockets.values()].some(
        (s) => (s.data as Session).user.id === state.user.id,
      );
      if (!others) data.online.delete(state.user.id);
      this.refresh();
    });
  }
  private handle<T>(
    socket: Socket,
    event: string,
    schema: z.ZodType<T>,
    handler: (value: T) => Promise<unknown>,
  ) {
    socket.on(event, (raw: unknown, ack?: (response: Ack<unknown>) => void) => {
      const respond = (value: Ack<unknown>) => {
        if (typeof ack === 'function') ack(value);
      };
      const state = socket.data as Session;
      if (Date.now() - state.window > 60_000) {
        state.window = Date.now();
        state.count = 0;
      }
      if (++state.count > 180) {
        respond({ ok: false, error: 'Trop de requetes' });
        return;
      }
      const value = schema.safeParse(raw);
      if (!value.success) {
        respond({ ok: false, error: 'Donnees invalides' });
        return;
      }
      void handler(value.data)
        .then((value) => respond({ ok: true, data: value }))
        .catch((error: unknown) =>
          respond({ ok: false, error: error instanceof Error ? error.message : 'Erreur serveur' }),
        );
    });
  }
  private async deliver(
    message: Parameters<PushNotificationService['sendMessage']>[2],
    peer: string,
    sender: User,
  ) {
    this.io.to(`user:${peer}`).to(`user:${sender.id}`).emit('message:new', message);
    const notify = needsPush(
      peer,
      message.conversationId,
      [...this.io.sockets.sockets.values()].map((socket) => {
        const s = socket.data as Session;
        return { userId: s.user.id, activeConversation: s.activeConversation };
      }),
    );
    if (!notify) await data.read(peer, message.conversationId);
    else
      void this.push
        .sendMessage(peer, sender.displayName, message)
        .catch(() => console.error('Push dispatch failed'));
  }
  private async demoReply(peer: User, recipient: string, conversationId: string) {
    const reply = await data.send(peer.id, {
      conversationId,
      clientId: randomUUID(),
      body: 'Salut ! Partant pour une balade sur les quais ?',
    });
    await this.deliver(reply.message, recipient, peer);
    this.io
      .to(`chat:${conversationId}`)
      .emit('typing:update', { conversationId, userId: peer.id, typing: false });
  }
  refresh() {
    if (this.pending) return;
    this.pending = setTimeout(() => {
      this.pending = undefined;
      void this.refreshNow();
    }, 300);
  }
  disconnectUser(userId: string) {
    for (const socket of this.io.sockets.sockets.values())
      if ((socket.data as Session).user.id === userId) socket.disconnect(true);
    data.online.delete(userId);
    this.refresh();
  }
  private async refreshNow() {
    if (this.refreshing) return;
    this.refreshing = true;
    try {
      const cache = new Map<string, Awaited<ReturnType<typeof data.nearby>>>();
      for (const socket of this.io.sockets.sockets.values()) {
        const state = socket.data as Session;
        if (state.radius) {
          const key = `${state.user.id}:${state.radius}`;
          if (!cache.has(key)) cache.set(key, await data.nearby(state.user.id, state.radius));
          socket.emit('nearby:users', cache.get(key));
        }
        if (state.activeConversation) {
          try {
            const peer = await data.authorizeConversation(state.user.id, state.activeConversation);
            socket.emit('presence:update', {
              conversationId: state.activeConversation,
              online: data.online.has(peer) || (await data.me(peer)).isDemo,
            });
          } catch {
            await socket.leave(`chat:${state.activeConversation}`);
            socket.emit('chat:unavailable', { conversationId: state.activeConversation });
            state.activeConversation = undefined;
          }
        }
      }
    } catch (error) {
      console.error('Nearby refresh failed', error instanceof Error ? error.message : 'unknown');
    } finally {
      this.refreshing = false;
    }
  }
  close() {
    clearInterval(this.timer);
    if (this.pending) clearTimeout(this.pending);
    this.io.close();
  }
}
