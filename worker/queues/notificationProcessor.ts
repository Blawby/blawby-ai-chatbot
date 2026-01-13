import type { MessageBatch } from '@cloudflare/workers-types';
import type { Env, NotificationQueueMessage, NotificationRecipientSnapshot } from '../types.js';
import { Logger } from '../utils/logger.js';
import { NotificationStore } from '../services/NotificationStore.js';
import { OneSignalService } from '../services/OneSignalService.js';

function shouldSendEmail(recipient: NotificationRecipientSnapshot): boolean {
  if (recipient.preferences?.emailEnabled === false) {
    return false;
  }
  return Boolean(recipient.email);
}

function shouldSendPush(recipient: NotificationRecipientSnapshot): boolean {
  if (recipient.preferences?.desktopPushEnabled === false) {
    return false;
  }
  if (recipient.preferences?.pushEnabled === false) {
    return false;
  }
  return true;
}

async function sendEmailNotification(
  oneSignal: OneSignalService,
  recipient: NotificationRecipientSnapshot,
  message: NotificationQueueMessage
): Promise<void> {
  if (!recipient.email) return;
  await oneSignal.sendEmail(recipient.email, {
    title: message.title,
    body: message.body ?? '',
    url: message.link ?? null,
    data: {
      link: message.link ?? null,
      category: message.category,
      entityType: message.entityType ?? null,
      entityId: message.entityId ?? null
    }
  });
}

async function sendPushNotification(
  oneSignal: OneSignalService,
  recipient: NotificationRecipientSnapshot,
  message: NotificationQueueMessage
): Promise<void> {
  await oneSignal.sendPush(recipient.userId, {
    title: message.title,
    body: message.body ?? '',
    url: message.link ?? null,
    data: {
      link: message.link ?? null,
      category: message.category,
      entityType: message.entityType ?? null,
      entityId: message.entityId ?? null
    }
  });
}

async function publishSse(env: Env, userId: string, payload: Record<string, unknown>): Promise<void> {
  const id = env.NOTIFICATION_HUB.idFromName(userId);
  const stub = env.NOTIFICATION_HUB.get(id);
  await stub.fetch('https://notification-hub/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export async function handleNotificationQueue(
  batch: MessageBatch<NotificationQueueMessage>,
  env: Env
): Promise<void> {
  Logger.initialize({
    DEBUG: env.DEBUG,
    NODE_ENV: env.NODE_ENV
  });

  const store = new NotificationStore(env);
  const oneSignal = OneSignalService.isConfigured(env) ? new OneSignalService(env) : null;
  if (!oneSignal) {
    Logger.warn('OneSignal delivery disabled - missing credentials');
  }

  for (const msg of batch.messages) {
    const payload = msg.body;

    for (const recipient of payload.recipients) {
      try {
        const insertResult = await store.createNotification({
          userId: recipient.userId,
          practiceId: payload.practiceId ?? null,
          category: payload.category,
          entityType: payload.entityType ?? null,
          entityId: payload.entityId ?? null,
          title: payload.title,
          body: payload.body ?? null,
          link: payload.link ?? null,
          senderName: payload.senderName ?? null,
          senderAvatarUrl: payload.senderAvatarUrl ?? null,
          severity: payload.severity ?? null,
          metadata: payload.metadata ?? null,
          dedupeKey: payload.dedupeKey ?? null,
          createdAt: payload.createdAt
        });

        if (!insertResult.inserted) {
          continue;
        }

        await publishSse(env, recipient.userId, {
          type: 'notification',
          notificationId: insertResult.id,
          category: payload.category,
          createdAt: insertResult.createdAt,
          title: payload.title
        });

        if (shouldSendEmail(recipient) && oneSignal) {
          await sendEmailNotification(oneSignal, recipient, payload);
        }

        if (shouldSendPush(recipient) && oneSignal) {
          await sendPushNotification(oneSignal, recipient, payload);
        }
      } catch (error) {
        Logger.warn('Failed to process notification message', {
          eventId: payload.eventId,
          recipient: recipient.userId,
          error: error instanceof Error ? error.message : String(error)
        });
        throw error;
      }
    }
  }
}
