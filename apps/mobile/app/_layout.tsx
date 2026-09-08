import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { queryClient } from '../src/api';
import { useApp } from '../src/state';
import { useLiveSession } from '../src/location';
import { observeNotifications, registerNotifications } from '../src/notifications';
import { colors } from '../src/ui';

export default function Root() {
  const accepted = useApp((state) => state.user?.charterAccepted);
  useEffect(() => {
    void useApp
      .getState()
      .hydrate()
      .catch(() => useApp.setState({ ready: true }));
  }, []);
  useLiveSession();
  useEffect(() => {
    if (!accepted) return;
    let remove: (() => void) | undefined;
    let cancelled = false;
    void observeNotifications((id) => router.push(`/chat/${id}`))
      .then((cleanup) => {
        if (cancelled) cleanup();
        else remove = cleanup;
      })
      .catch((error: unknown) => console.warn('Notification listener unavailable', error));
    void registerNotifications().catch((error: unknown) =>
      console.warn('Push registration unavailable', error),
    );
    return () => {
      cancelled = true;
      remove?.();
    };
  }, [accepted]);
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="charter" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="person/[id]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="chat/[id]" />
        </Stack>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
