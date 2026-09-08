import { Expo } from 'expo-server-sdk';
import { pool } from './db';
import type { Message } from '@nearme/shared';

export class PushNotificationService {
  private expo = new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN });
  async sendMessage(userId: string, senderName: string, message: Message) {
    const { rows } = await pool.query<{ token: string }>(
      'SELECT token FROM push_tokens WHERE user_id=$1',
      [userId],
    );
    for (const chunk of this.expo.chunkPushNotifications(
      rows
        .filter((r) => Expo.isExpoPushToken(r.token))
        .map(({ token }) => ({
          to: token,
          title: senderName,
          body: message.body,
          sound: 'default' as const,
          channelId: 'messages',
          data: { conversationId: message.conversationId, url: `/chat/${message.conversationId}` },
        })),
    )) {
      try {
        const tickets = await this.expo.sendPushNotificationsAsync(chunk);
        for (let i = 0; i < tickets.length; i++) {
          const ticket = tickets[i];
          if (ticket.status === 'error') {
            console.warn('Push ticket failed', ticket.details?.error);
            if (ticket.details?.error === 'DeviceNotRegistered')
              await pool.query('DELETE FROM push_tokens WHERE token=$1', [chunk[i].to]);
          } else {
            const token = chunk[i].to;
            const timer = setTimeout(() => {
              void this.checkReceipt(ticket.id, token as string);
            }, 15 * 60_000);
            timer.unref();
          }
        }
      } catch (error) {
        console.error(
          'Expo push failed; message remains persisted',
          error instanceof Error ? error.message : 'unknown',
        );
      }
    }
  }
  private async checkReceipt(id: string, token: string) {
    try {
      const receipts = await this.expo.getPushNotificationReceiptsAsync([id]);
      const receipt = receipts[id];
      if (receipt?.status === 'error') {
        console.warn('Push receipt failed', receipt.details?.error);
        if (receipt.details?.error === 'DeviceNotRegistered')
          await pool.query('DELETE FROM push_tokens WHERE token=$1', [token]);
      }
    } catch {
      console.warn('Push receipt lookup failed');
    }
  }
}
