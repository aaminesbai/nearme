import { QueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import type { Ack, Message, NearbyUser } from '@nearme/shared';
import { API_URL, useApp } from './state';

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15_000 } },
});
export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(useApp.getState().token ? { Authorization: `Bearer ${useApp.getState().token}` } : {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    signal: AbortSignal.timeout(12_000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message ?? 'Connexion impossible');
  return result as T;
}
export let socket: Socket | null = null;
export function connectSocket() {
  if (socket) return socket;
  socket = io(API_URL, {
    auth: { token: useApp.getState().token },
    transports: ['websocket'],
    autoConnect: false,
  });
  socket.on('connect', () => {
    useApp.setState({ connected: true });
    void emit('nearby:subscribe', { radius: useApp.getState().radius }).catch(() => undefined);
    void queryClient.invalidateQueries();
  });
  socket.on('disconnect', () => useApp.setState({ connected: false }));
  socket.on('connect_error', () => useApp.setState({ connected: false }));
  socket.on('nearby:users', (nearby: NearbyUser[]) => useApp.setState({ nearby }));
  socket.on('message:new', (message: Message) => {
    queryClient.setQueryData<{ messages: Message[]; nextCursor: string | null }>(
      ['messages', message.conversationId],
      (old) =>
        old
          ? {
              ...old,
              messages: [...old.messages.filter((m) => m.clientId !== message.clientId), message],
            }
          : undefined,
    );
    void queryClient.invalidateQueries({ queryKey: ['conversations'] });
  });
  socket.connect();
  return socket;
}
export function emit<T>(event: string, payload: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!socket?.connected) {
      reject(new Error('Connexion en cours. Reessaie dans un instant.'));
      return;
    }
    socket.timeout(10_000).emit(event, payload, (error: Error | null, reply: Ack<T>) => {
      if (error) reject(new Error('Aucune confirmation. Reessaie.'));
      else if (!reply?.ok) reject(new Error(reply?.error ?? 'Erreur serveur'));
      else resolve(reply.data);
    });
  });
}
export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
  useApp.setState({ connected: false });
}
