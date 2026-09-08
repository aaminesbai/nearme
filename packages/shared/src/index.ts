import { z } from 'zod';
export const MIN_RADIUS = 50;
export const MAX_RADIUS = 5000;
export const STALE_LOCATION_MINUTES = 12;
export const CHARTER_VERSION = '2026-09-v1';
export const BORDEAUX = { latitude: 44.8378, longitude: -0.5792 };
export const radiusSchema = z.coerce.number().finite().min(MIN_RADIUS).max(MAX_RADIUS);
export const pointSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});
export const profileSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,24}$/),
  displayName: z.string().trim().min(2).max(40),
  avatar: z.number().int().min(0).max(7).default(0),
  bio: z.string().trim().max(160).default(''),
});
export const messageSchema = z.object({
  conversationId: z.uuid(),
  clientId: z.uuid(),
  body: z.string().trim().min(1).max(2000),
});
export const conversationSchema = z.object({ conversationId: z.uuid() });
export const pushSchema = z.object({
  token: z.string().regex(/^(ExponentPushToken|ExpoPushToken)\[[a-zA-Z0-9_-]+\]$/),
  platform: z.enum(['ios', 'android']),
});
export type Point = z.infer<typeof pointSchema>;
export type ProfileInput = z.infer<typeof profileSchema>;
export interface User extends ProfileInput {
  id: string;
  visible: boolean;
  charterAccepted: boolean;
  isDemo: boolean;
}
export interface NearbyUser extends User {
  distance: number;
  latitude: number;
  longitude: number;
  online: boolean;
  updatedAt: string;
}
export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  clientId: string;
  body: string;
  createdAt: string;
}
export interface Conversation {
  id: string;
  peer: User;
  lastMessage: string | null;
  updatedAt: string;
  online: boolean;
  unread: number;
}
export type Ack<T> = { ok: true; data: T } | { ok: false; error: string };
export const avatarUrls = [
  'https://i.pravatar.cc/160?img=47',
  'https://i.pravatar.cc/160?img=49',
  'https://i.pravatar.cc/160?img=12',
  'https://i.pravatar.cc/160?img=13',
  'https://i.pravatar.cc/160?img=44',
  'https://i.pravatar.cc/160?img=5',
  'https://i.pravatar.cc/160?img=11',
  'https://i.pravatar.cc/160?img=9',
];
export function formatDistance(meters: number): string {
  return meters < 1000
    ? `${Math.round(meters / 10) * 10} m`
    : `${Number((meters / 1000).toFixed(1))} km`;
}
export function offsetPoint(origin: Point, meters: number, bearing: number): Point {
  const a = (bearing * Math.PI) / 180;
  return {
    latitude: origin.latitude + (Math.cos(a) * meters) / 111320,
    longitude:
      origin.longitude +
      (Math.sin(a) * meters) / (111320 * Math.cos((origin.latitude * Math.PI) / 180)),
  };
}
