import { create } from 'zustand';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NearbyUser, Point, User } from '@nearme/shared';

export const DEMO = process.env.EXPO_PUBLIC_DEMO_MODE === 'true';
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
const storage = {
  get: () =>
    Platform.OS === 'web'
      ? AsyncStorage.getItem('nearme.session')
      : SecureStore.getItemAsync('nearme.session'),
  set: (value: string) =>
    Platform.OS === 'web'
      ? AsyncStorage.setItem('nearme.session', value)
      : SecureStore.setItemAsync('nearme.session', value),
};
interface State {
  ready: boolean;
  token: string | null;
  user: User | null;
  radius: number;
  point: Point | null;
  nearby: NearbyUser[];
  connected: boolean;
  locationState: 'idle' | 'loading' | 'ready' | 'denied' | 'error' | 'demo' | 'stale';
  locationTime: number;
  locationError: string | null;
  activeConversation: string | null;
  hydrate: () => Promise<void>;
  session: (token: string, user: User) => Promise<void>;
  setUser: (user: User) => Promise<void>;
}
export const useApp = create<State>((set, get) => ({
  ready: false,
  token: null,
  user: null,
  radius: 500,
  point: null,
  nearby: [],
  connected: false,
  locationState: 'idle',
  locationTime: 0,
  locationError: null,
  activeConversation: null,
  hydrate: async () => {
    try {
      const saved = await storage.get();
      if (saved) set(JSON.parse(saved) as Pick<State, 'token' | 'user'>);
    } finally {
      set({ ready: true });
    }
  },
  session: async (token, user) => {
    await storage.set(JSON.stringify({ token, user }));
    set({ token, user });
  },
  setUser: async (user) => {
    await storage.set(JSON.stringify({ token: get().token, user }));
    set({ user });
  },
}));
