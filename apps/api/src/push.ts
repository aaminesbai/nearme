import { Expo } from 'expo-server-sdk';
import { prisma } from './db';
const MAX_ATTEMPTS = 12;
const RECEIPT_DELAY_MS = 15 * 60_000;

export class PushNotificationService {
  private readonly expo = new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN });
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  start(isConversationActive: (userId: string, conversationId: string) => boolean) {
    if (this.timer) return;
    const poll = () => {
      if (this.running) return;
      this.running = true;
      void this.process(isConversationActive)
        .catch((error: unknown) => console.error('Push worker failed', this.errorMessage(error)))
        .finally(() => (this.running = false));
    };
    poll();
    this.timer = setInterval(poll, 5_000);
    this.timer.unref();
  }

  close() {
    if (this.timer) clearInterval(this.timer);
  }

  private async process(isActive: (userId: string, conversationId: string) => boolean) {
    await this.processReceipts();
    for (let i = 0; i < 10; i++) {
      const [job] = await prisma.$queryRaw<{ id: string }[]>`
        WITH candidate AS (
          SELECT id FROM push_outbox
          WHERE status = 'pending' AND available_at <= now()
            AND (locked_at IS NULL OR locked_at < now() - interval '2 minutes')
          ORDER BY available_at, created_at
          FOR UPDATE SKIP LOCKED LIMIT 1
        )
        UPDATE push_outbox AS jobs SET locked_at = now(), attempts = attempts + 1
        FROM candidate WHERE jobs.id = candidate.id RETURNING jobs.id::text AS id`;
      if (!job) return;
      await this.deliver(job.id, isActive);
    }
  }

  private async deliver(id: string, isActive: (userId: string, conversationId: string) => boolean) {
    const job = await prisma.pushOutbox.findUnique({
      where: { id },
      include: {
        recipient: { select: { id: true } },
        message: { select: { conversationId: true } },
      },
    });
    if (!job) return;
    if (isActive(job.recipientId, job.message.conversationId)) {
      await prisma.pushOutbox.update({
        where: { id },
        data: { status: 'suppressed', lockedAt: null },
      });
      return;
    }
    const tokens = (
      await prisma.pushToken.findMany({
        where: { userId: job.recipientId },
        select: { token: true },
      })
    )
      .map(({ token }) => token)
      .filter(Expo.isExpoPushToken);
    if (!tokens.length) {
      await prisma.pushOutbox.update({
        where: { id },
        data: { status: 'sent', sentAt: new Date(), lockedAt: null },
      });
      return;
    }
    try {
      const messages = tokens.map((token) => ({
        to: token,
        title: 'Nouveau message',
        body: 'Vous avez reçu un nouveau message sur NearMe.',
        sound: 'default' as const,
        channelId: 'messages',
        data: {
          conversationId: job.message.conversationId,
          url: `/chat/${job.message.conversationId}`,
        },
      }));
      for (const chunk of this.expo.chunkPushNotifications(messages)) {
        const tickets = await this.expo.sendPushNotificationsAsync(chunk);
        for (let i = 0; i < tickets.length; i++) {
          const ticket = tickets[i];
          const token = chunk[i].to as string;
          if (ticket.status === 'error') {
            if (ticket.details?.error === 'DeviceNotRegistered')
              await prisma.pushToken.deleteMany({ where: { token } });
            console.warn('Push ticket failed', ticket.details?.error ?? ticket.message);
          } else {
            await prisma.pushReceipt.create({
              data: {
                outboxId: id,
                ticketId: ticket.id,
                token,
                nextCheckAt: new Date(Date.now() + RECEIPT_DELAY_MS),
              },
            });
          }
        }
      }
      await prisma.pushOutbox.update({
        where: { id },
        data: { status: 'sent', sentAt: new Date(), lockedAt: null },
      });
    } catch (error) {
      const attempts = job.attempts;
      const terminal = attempts >= MAX_ATTEMPTS;
      await prisma.pushOutbox.update({
        where: { id },
        data: {
          status: terminal ? 'failed' : 'pending',
          lockedAt: null,
          availableAt: new Date(
            Date.now() + Math.min(60 * 60_000, 1000 * 2 ** Math.min(attempts, 12)),
          ),
          lastError: this.errorMessage(error).slice(0, 1000),
        },
      });
      console.error('Expo push attempt failed', this.errorMessage(error));
    }
  }

  private async processReceipts() {
    const due = await prisma.pushReceipt.findMany({
      where: { completedAt: null, nextCheckAt: { lte: new Date() } },
      take: 100,
      orderBy: { nextCheckAt: 'asc' },
    });
    for (let offset = 0; offset < due.length; offset += 300) {
      const batch = due.slice(offset, offset + 300);
      try {
        const receipts = await this.expo.getPushNotificationReceiptsAsync(
          batch.map((r) => r.ticketId),
        );
        for (const row of batch) {
          const receipt = receipts[row.ticketId];
          if (!receipt) {
            await prisma.pushReceipt.update({
              where: { id: row.id },
              data: {
                attempts: { increment: 1 },
                nextCheckAt: new Date(Date.now() + RECEIPT_DELAY_MS),
              },
            });
            continue;
          }
          await prisma.pushReceipt.update({
            where: { id: row.id },
            data: {
              completedAt: new Date(),
              attempts: { increment: 1 },
            },
          });
          if (receipt.status === 'error') {
            console.warn('Push receipt failed', receipt.details?.error ?? receipt.message);
            if (receipt.details?.error === 'DeviceNotRegistered')
              await prisma.pushToken.deleteMany({ where: { token: row.token } });
          }
        }
      } catch (error) {
        console.warn('Push receipt lookup failed', this.errorMessage(error));
        await prisma.pushReceipt.updateMany({
          where: { id: { in: batch.map((row) => row.id) } },
          data: {
            attempts: { increment: 1 },
            nextCheckAt: new Date(Date.now() + RECEIPT_DELAY_MS),
          },
        });
      }
    }
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'unknown error';
  }
}
