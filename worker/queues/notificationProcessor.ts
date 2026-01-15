import type { MessageBatch } from '@cloudflare/workers-types';
import type { Env, NotificationQueueMessage, NotificationRecipientSnapshot } from '../types.js';
import { Logger } from '../utils/logger.js';
import { NotificationStore } from '../services/NotificationStore.js';
import { NotificationDeliveryStore } from '../services/NotificationDeliveryStore.js';
import { NotificationDestinationStore } from '../services/NotificationDestinationStore.js';
import { OneSignalService, type OneSignalSendResult } from '../services/OneSignalService.js';

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

function extractMentionedUserIds(metadata: Record<string, unknown> | null | undefined): string[] {
  if (!metadata) return [];
  const candidates = [
    metadata.mentionedUserIds,
    metadata.mentionUserIds,
    metadata.mentions
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter((value) => typeof value === 'string') as string[];
    }
  }
  return [];
}

function shouldProcessRecipient(
  recipient: NotificationRecipientSnapshot,
  message: NotificationQueueMessage
): boolean {
  if (message.category !== 'message') return true;
  if (!recipient.preferences?.mentionsOnly) return true;
  const mentionIds = extractMentionedUserIds(message.metadata ?? null);
  return mentionIds.includes(recipient.userId);
}

async function sendEmailNotification(
  oneSignal: OneSignalService,
  recipient: NotificationRecipientSnapshot,
  message: NotificationQueueMessage
): Promise<OneSignalSendResult | null> {
  if (!recipient.email) return null;
  return await oneSignal.sendEmail(recipient.email, {
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
): Promise<OneSignalSendResult> {
  return await oneSignal.sendPush(recipient.userId, {
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

function isInvalidRecipientError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const lowered = message.toLowerCase();
  return lowered.includes('no recipients')
    || lowered.includes('no users with this external user id')
    || lowered.includes('not subscribed')
    || lowered.includes('invalid_player_ids');
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
  const deliveryStore = new NotificationDeliveryStore(env);
  const destinationStore = new NotificationDestinationStore(env);
  const oneSignal = OneSignalService.isConfigured(env) ? new OneSignalService(env) : null;
  if (!oneSignal) {
    Logger.warn('OneSignal delivery disabled - missing credentials');
  }

  for (const msg of batch.messages) {
    const payload = msg.body;
    let hadFailure = false;

    for (const recipient of payload.recipients) {
      try {
        if (!shouldProcessRecipient(recipient, payload)) {
          continue;
        }
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
          try {
            await sendEmailNotification(oneSignal, recipient, payload);
            await deliveryStore.recordResult({
              notificationId: insertResult.id,
              userId: recipient.userId,
              channel: 'email',
              provider: 'onesignal',
              status: 'success'
            });
          } catch (error) {
            hadFailure = true;
            await deliveryStore.recordResult({
              notificationId: insertResult.id,
              userId: recipient.userId,
              channel: 'email',
              provider: 'onesignal',
              status: 'failure',
              errorMessage: error instanceof Error ? error.message : String(error)
            });
            Logger.warn('Failed to send email notification', {
              eventId: payload.eventId,
              recipient: recipient.userId,
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }

        if (shouldSendPush(recipient) && oneSignal) {
          try {
            await sendPushNotification(oneSignal, recipient, payload);
            await deliveryStore.recordResult({
              notificationId: insertResult.id,
              userId: recipient.userId,
              channel: 'push',
              provider: 'onesignal',
              status: 'success',
              externalUserId: recipient.userId
            });
          } catch (error) {
            await deliveryStore.recordResult({
              notificationId: insertResult.id,
              userId: recipient.userId,
              channel: 'push',
              provider: 'onesignal',
              status: 'failure',
              errorMessage: error instanceof Error ? error.message : String(error),
              externalUserId: recipient.userId
            });
            if (isInvalidRecipientError(error)) {
              await destinationStore.disableDestinationsForUser(recipient.userId);
            }
            throw error;
          }
        }
      } catch (error) {
        Logger.warn('Failed to process notification message', {
          eventId: payload.eventId,
          recipient: recipient.userId,
          error: error instanceof Error ? error.message : String(error)
        });
        hadFailure = true;
      }
    }

    if (hadFailure) {
      Logger.warn('Notification message partially failed; skipping retry to avoid duplicates', {
        eventId: payload.eventId
      });
    }

    msg.ack();
  }
}
