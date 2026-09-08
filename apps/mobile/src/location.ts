import { useEffect } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { BORDEAUX, type Point } from '@nearme/shared';
import { api, connectSocket, disconnectSocket, emit } from './api';
import { DEMO, useApp } from './state';

let busy = false;
async function publish(point: Point, fallback = false) {
  useApp.setState({
    point,
    locationState: fallback ? 'demo' : 'ready',
    locationTime: Date.now(),
    locationError: null,
  });
  await api('/location', { method: 'POST', body: point });
  if (DEMO) await api('/demo/seed', { method: 'POST', body: point });
  const users = await api<import('@nearme/shared').NearbyUser[]>(
    `/nearby?radius=${useApp.getState().radius}`,
  );
  useApp.setState({ nearby: users });
}
export async function locate(fallback = false) {
  if (busy) return;
  busy = true;
  try {
    if (fallback && DEMO) {
      await publish(BORDEAUX, true);
      return;
    }
    useApp.setState({ locationState: 'loading', locationError: null });
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      useApp.setState({ locationState: 'denied' });
      return;
    }
    const position = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Position indisponible')), 15_000),
      ),
    ]);
    await publish(position.coords);
  } catch (error) {
    useApp.setState({
      locationState: 'error',
      locationError: error instanceof Error ? error.message : 'Position indisponible',
    });
  } finally {
    busy = false;
  }
}
export function useLiveSession() {
  const enabled = useApp((s) => s.user?.charterAccepted);
  const radius = useApp((s) => s.radius);
  useEffect(() => {
    if (!enabled) return;
    connectSocket();
    void locate();
    const timer = setInterval(() => {
      if (AppState.currentState !== 'active') return;
      const state = useApp.getState();
      if (state.locationState === 'demo' && state.point)
        void publish(state.point, true).catch(() =>
          useApp.setState({ locationError: 'Synchronisation impossible' }),
        );
      else if (state.locationState === 'ready' || state.locationState === 'stale') void locate();
      if (Date.now() - state.locationTime > 120_000 && state.point)
        useApp.setState({ locationState: 'stale', nearby: [] });
    }, 45_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        connectSocket();
        if (useApp.getState().locationState !== 'demo') void locate();
      } else disconnectSocket();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
      disconnectSocket();
    };
  }, [enabled]);
  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => {
      void emit('nearby:subscribe', { radius }).catch(async () => {
        try {
          useApp.setState({ nearby: await api(`/nearby?radius=${radius}`) });
        } catch {
          /* Connection banner remains visible. */
        }
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [radius, enabled]);
}
