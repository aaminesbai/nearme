import { Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { api } from './api';
import { useApp } from './state';

export async function registerNotifications(): Promise<string> {
  if (Platform.OS === 'web') return "Les notifications sont disponibles dans l'app mobile.";
  if (!Device.isDevice) return 'Utilise un appareil physique pour tester les notifications.';
  if (Constants.appOwnership === 'expo')
    return 'Les notifications distantes necessitent une development build.';
  const Notifications = await import('expo-notifications');
  if (Platform.OS === 'android')
    await Notifications.setNotificationChannelAsync('messages', {
      name: 'Messages',
      importance: Notifications.AndroidImportance.HIGH,
    });
  const permission = await Notifications.requestPermissionsAsync();
  if (permission.status !== 'granted')
    return 'Notifications desactivees. Modifie les autorisations dans les reglages.';
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  if (!projectId) return 'Projet EAS non configure pour cette build.';
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await api('/devices/push-token', { method: 'POST', body: { token, platform: Platform.OS } });
  return 'Notifications activees';
}
export async function observeNotifications(open: (id: string) => void) {
  if (Platform.OS === 'web' || Constants.appOwnership === 'expo') return () => undefined;
  const Notifications = await import('expo-notifications');
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const show =
        notification.request.content.data?.conversationId !== useApp.getState().activeConversation;
      return {
        shouldShowBanner: show,
        shouldShowList: show,
        shouldPlaySound: show,
        shouldSetBadge: false,
      };
    },
  });
  const route = (id: unknown) => {
    if (typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)) open(id);
  };
  const last = await Notifications.getLastNotificationResponseAsync();
  if (last) {
    route(last.notification.request.content.data?.conversationId);
    await Notifications.clearLastNotificationResponseAsync();
  }
  const subscription = Notifications.addNotificationResponseReceivedListener((response) =>
    route(response.notification.request.content.data?.conversationId),
  );
  return () => subscription.remove();
}
