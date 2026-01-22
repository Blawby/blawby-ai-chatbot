import type { MessageBatch } from '@cloudflare/workers-types';
import type { Env, NotificationQueueMessage, NotificationRecipientSnapshot } from '../types.js';
import { Logger } from '../utils/logger.js';
import { NotificationDeliveryStore } from '../services/NotificationDeliveryStore.js';
import { NotificationDestinationStore } from '../services/NotificationDestinationStore.js';
import { OneSignalService, type OneSignalSendResult } from '../services/OneSignalService.js';
import { parseEnvBool } from '../utils/safeStringUtils.js';
import { ConversationService } from '../services/ConversationService.js';

const RATE_WINDOW_MS = 5 * 60 * 1000;
const USER_WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_CONVERSATION = 5;
const MAX_PER_SYSTEM = 3;
const MAX_PER_USER = 20;
const MAX_SAMPLE_LINKS = 3;
const SYSTEM_RETENTION_DAYS = 180;
const SYSTEM_MAX_MESSAGES = 1000;

interface SummaryState {
  totalCount: number;
  byType: Record<string, number>;
  sampleLinks: string[];
  lastLink: string | null;
}

interface RateLimitState {
  windowStart: number;
  windowEnd: number;
  messageCount: number;
  summarySent: boolean;
  summary: SummaryState;
}

interface GlobalRateLimitState {
  windowStart: number;
  windowEnd: number;
  messageCount: number;
}

const readEnvToggle = (value: string | boolean | undefined, defaultValue: boolean) => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return parseEnvBool(value, defaultValue);
  }
  return defaultValue;
};

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

function shouldSendInApp(recipient: NotificationRecipientSnapshot): boolean {
  return recipient.preferences?.inAppEnabled !== false;
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

function resolveConversationId(payload: NotificationQueueMessage): string | null {
  if (typeof payload.conversationId === 'string' && payload.conversationId.trim()) {
    return payload.conversationId.trim();
  }
  const metadata = payload.metadata as Record<string, unknown> | null | undefined;
  if (metadata && typeof metadata.conversationId === 'string' && metadata.conversationId.trim()) {
    return metadata.conversationId.trim();
  }
  return null;
}

function resolveNotificationType(payload: NotificationQueueMessage): string {
  const metadata = payload.metadata as Record<string, unknown> | null | undefined;
  const raw = metadata?.notificationType;
  if (typeof raw === 'string' && raw.trim()) {
    return raw.trim();
  }
  return payload.category;
}

function buildMessageContent(payload: NotificationQueueMessage): string {
  const title = typeof payload.title === 'string' ? payload.title.trim() : '';
  const body = typeof payload.body === 'string' ? payload.body.trim() : '';
  if (title && body) {
    return `${title}\n${body}`;
  }
  if (title) {
    return title;
  }
  return body || 'Update';
}

function buildMessageMetadata(payload: NotificationQueueMessage, notificationType: string): Record<string, unknown> {
  return {
    notificationType,
    severity: payload.severity ?? null,
    link: payload.link ?? null,
    dedupeKey: payload.dedupeKey ?? null,
    context: payload.metadata ?? null
  };
}

const buildSummaryMetadata = (options: {
  reason: 'rate_limit' | 'preference' | 'both';
  summary: SummaryState;
  windowStart: number;
  windowEnd: number;
}): Record<string, unknown> => ({
  notificationType: 'summary',
  link: options.summary.lastLink ?? null,
  context: {
    windowStart: new Date(options.windowStart).toISOString(),
    windowEnd: new Date(options.windowEnd).toISOString(),
    totalCount: options.summary.totalCount,
    byType: options.summary.byType,
    sampleLinks: options.summary.sampleLinks,
    reason: options.reason
  }
});

function updateSummaryState(
  summary: SummaryState,
  notificationType: string,
  link: string | null
): SummaryState {
  const next = {
    totalCount: summary.totalCount + 1,
    byType: { ...summary.byType },
    sampleLinks: [...summary.sampleLinks],
    lastLink: summary.lastLink ?? null
  };
  next.byType[notificationType] = (next.byType[notificationType] ?? 0) + 1;
  if (link && !next.sampleLinks.includes(link) && next.sampleLinks.length < MAX_SAMPLE_LINKS) {
    next.sampleLinks.push(link);
  }
  if (link) {
    next.lastLink = link;
  }
  return next;
}

function buildSummaryContent(summary: SummaryState): string {
  const entries = Object.entries(summary.byType)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key, count]) => `${key} (${count})`);
  const windowMinutes = Math.max(1, Math.round(RATE_WINDOW_MS / 60_000));
  const title = `${summary.totalCount} updates in the last ${windowMinutes} minute${windowMinutes === 1 ? '' : 's'}`;
  const body = entries.length > 0
    ? `${entries.join(', ')}. View conversation for details.`
    : 'View conversation for details.';
  return `${title}\n${body}`;
}

function getWindowBounds(nowMs: number, windowMs: number): { windowStart: number; windowEnd: number } {
  const windowStart = Math.floor(nowMs / windowMs) * windowMs;
  return { windowStart, windowEnd: windowStart + windowMs };
}

function createEmptySummary(): SummaryState {
  return { totalCount: 0, byType: {}, sampleLinks: [], lastLink: null };
}

function createRateLimitState(windowStart: number, windowEnd: number): RateLimitState {
  return {
    windowStart,
    windowEnd,
    messageCount: 0,
    summarySent: false,
    summary: createEmptySummary()
  };
}

async function loadRateLimitState(
  env: Env,
  key: string,
  windowStart: number,
  windowEnd: number
): Promise<RateLimitState> {
  if (!env.CHAT_SESSIONS) {
    return createRateLimitState(windowStart, windowEnd);
  }
  const raw = await env.CHAT_SESSIONS.get(key);
  if (!raw) {
    return createRateLimitState(windowStart, windowEnd);
  }
  try {
    const parsed = JSON.parse(raw) as RateLimitState;
    if (parsed.windowStart !== windowStart) {
      return createRateLimitState(windowStart, windowEnd);
    }
    return parsed;
  } catch {
    return createRateLimitState(windowStart, windowEnd);
  }
}

async function saveRateLimitState(env: Env, key: string, state: RateLimitState, windowMs: number): Promise<void> {
  if (!env.CHAT_SESSIONS) return;
  const ttlSeconds = Math.ceil((windowMs / 1000) * 2);
  await env.CHAT_SESSIONS.put(key, JSON.stringify(state), { expirationTtl: ttlSeconds });
}

function createGlobalRateLimitState(windowStart: number, windowEnd: number): GlobalRateLimitState {
  return { windowStart, windowEnd, messageCount: 0 };
}

async function loadGlobalRateLimitState(
  env: Env,
  key: string,
  windowStart: number,
  windowEnd: number
): Promise<GlobalRateLimitState> {
  if (!env.CHAT_SESSIONS) {
    return createGlobalRateLimitState(windowStart, windowEnd);
  }
  const raw = await env.CHAT_SESSIONS.get(key);
  if (!raw) {
    return createGlobalRateLimitState(windowStart, windowEnd);
  }
  try {
    const parsed = JSON.parse(raw) as GlobalRateLimitState;
    if (parsed.windowStart !== windowStart) {
      return createGlobalRateLimitState(windowStart, windowEnd);
    }
    return parsed;
  } catch {
    return createGlobalRateLimitState(windowStart, windowEnd);
  }
}

async function saveGlobalRateLimitState(
  env: Env,
  key: string,
  state: GlobalRateLimitState,
  windowMs: number
): Promise<void> {
  if (!env.CHAT_SESSIONS) return;
  const ttlSeconds = Math.ceil((windowMs / 1000) * 2);
  await env.CHAT_SESSIONS.put(key, JSON.stringify(state), { expirationTtl: ttlSeconds });
}

async function maybePruneSystemConversation(
  env: Env,
  conversationService: ConversationService,
  conversationId: string
): Promise<void> {
  if (!env.CHAT_SESSIONS) return;
  const key = `notif:prune:${conversationId}`;
  const alreadyPruned = await env.CHAT_SESSIONS.get(key);
  if (alreadyPruned) return;
  await env.CHAT_SESSIONS.put(key, '1', { expirationTtl: 60 * 60 });
  await conversationService.pruneConversationMessages({
    conversationId,
    retentionDays: SYSTEM_RETENTION_DAYS,
    maxMessages: SYSTEM_MAX_MESSAGES
  });
}

async function hasDedupeMessage(options: {
  env: Env;
  conversationId: string;
  dedupeKey: string;
  dedupeWindow?: 'permanent' | '24h' | null;
  nowMs: number;
}): Promise<boolean> {
  const { env, conversationId, dedupeKey, dedupeWindow, nowMs } = options;
  if (!dedupeKey) return false;

  const bindings: unknown[] = [conversationId, dedupeKey];
  let query = `
    SELECT id
    FROM chat_messages
    WHERE conversation_id = ?
      AND role = 'system'
      AND json_extract(metadata, '$.dedupeKey') = ?
  `;

  if (dedupeWindow === '24h') {
    const since = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString();
    query += ' AND created_at >= ?';
    bindings.push(since);
  }

  query += ' LIMIT 1';

  const existing = await env.DB.prepare(query).bind(...bindings).first<{ id: string } | null>();
  return Boolean(existing?.id);
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

function isInvalidRecipientError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const lowered = message.toLowerCase();
  return lowered.includes('no recipients')
    || lowered.includes('no users with this external user id')
    || lowered.includes('not subscribed')
    || lowered.includes('invalid_player_ids');
}

async function sendConversationBotMessage(options: {
  env: Env;
  conversationService: ConversationService;
  payload: NotificationQueueMessage;
  conversationId: string;
  participantUserId: string;
  nowMs: number;
}): Promise<string | null> {
  const { env, conversationService, payload, conversationId, participantUserId, nowMs } = options;
  if (!payload.practiceId) return null;

  if (payload.dedupeKey) {
    const isDuplicate = await hasDedupeMessage({
      env,
      conversationId,
      dedupeKey: payload.dedupeKey,
      dedupeWindow: payload.dedupeWindow ?? '24h',
      nowMs
    });
    if (isDuplicate) return null;
  }

  const notificationType = resolveNotificationType(payload);
  const link = payload.link ?? null;
  const { windowStart, windowEnd } = getWindowBounds(nowMs, RATE_WINDOW_MS);
  const rateKey = `notif:rate:conversation:${conversationId}:${windowStart}`;
  const state = await loadRateLimitState(env, rateKey, windowStart, windowEnd);
  const nextSummary = updateSummaryState(state.summary, notificationType, link);
  state.summary = nextSummary;

  let action: 'individual' | 'summary' | 'skip' = 'individual';
  let reason: 'rate_limit' | 'preference' | 'both' | null = null;
  if (state.messageCount >= MAX_PER_CONVERSATION) {
    reason = 'rate_limit';
    if (!state.summarySent) {
      action = 'summary';
      state.summarySent = true;
      state.messageCount += 1;
    } else {
      action = 'skip';
    }
  } else {
    state.messageCount += 1;
  }

  if (action === 'skip') {
    await saveRateLimitState(env, rateKey, state, RATE_WINDOW_MS);
    return null;
  }

  const content = action === 'summary'
    ? buildSummaryContent(nextSummary)
    : buildMessageContent(payload);
  const metadata = action === 'summary'
    ? buildSummaryMetadata({
        reason: reason ?? 'rate_limit',
        summary: nextSummary,
        windowStart,
        windowEnd
      })
    : buildMessageMetadata(payload, notificationType);

  const message = await conversationService.sendSystemMessage({
    conversationId,
    practiceId: payload.practiceId,
    content,
    metadata,
    recipientUserId: participantUserId,
    auditEventType: 'notification_bot_message',
    auditPayload: { conversationId },
    skipPracticeValidation: true
  });

  await saveRateLimitState(env, rateKey, state, RATE_WINDOW_MS);

  return message.id;
}

async function sendSystemBotMessage(options: {
  env: Env;
  conversationService: ConversationService;
  payload: NotificationQueueMessage;
  recipient: NotificationRecipientSnapshot;
  nowMs: number;
}): Promise<string | null> {
  const { env, conversationService, payload, recipient, nowMs } = options;
  if (!payload.practiceId) return null;

  const systemConversation = await conversationService.getOrCreateSystemConversation({
    practiceId: payload.practiceId,
    userId: recipient.userId,
    skipPracticeValidation: true
  });
  const conversationId = systemConversation.id;

  if (payload.dedupeKey) {
    const isDuplicate = await hasDedupeMessage({
      env,
      conversationId,
      dedupeKey: payload.dedupeKey,
      dedupeWindow: payload.dedupeWindow ?? '24h',
      nowMs
    });
    if (isDuplicate) return null;
  }

  const notificationType = resolveNotificationType(payload);
  const link = payload.link ?? null;
  const summaryOnly = recipient.preferences?.inAppFrequency === 'summaries_only';
  const { windowStart, windowEnd } = getWindowBounds(nowMs, RATE_WINDOW_MS);
  const rateKey = `notif:rate:system:${payload.practiceId}:${recipient.userId}:${windowStart}`;
  const state = await loadRateLimitState(env, rateKey, windowStart, windowEnd);
  state.summary = updateSummaryState(state.summary, notificationType, link);

  const isRateLimited = state.messageCount >= MAX_PER_SYSTEM;
  const shouldSummarize = summaryOnly || isRateLimited;

  let action: 'individual' | 'summary' | 'skip' = 'individual';
  let reason: 'rate_limit' | 'preference' | 'both' = 'rate_limit';
  let shouldIncrement = false;

  if (shouldSummarize) {
    reason = summaryOnly && isRateLimited ? 'both' : summaryOnly ? 'preference' : 'rate_limit';
    if (!state.summarySent) {
      action = 'summary';
      shouldIncrement = true;
    } else {
      action = 'skip';
    }
  } else {
    shouldIncrement = true;
  }

  const globalWindow = getWindowBounds(nowMs, USER_WINDOW_MS);
  const globalKey = `notif:rate:user:${recipient.userId}:${globalWindow.windowStart}`;
  const globalState = await loadGlobalRateLimitState(env, globalKey, globalWindow.windowStart, globalWindow.windowEnd);
  if (shouldIncrement && globalState.messageCount >= MAX_PER_USER) {
    action = 'skip';
    shouldIncrement = false;
  }

  if (shouldIncrement) {
    state.messageCount += 1;
    if (action === 'summary') {
      state.summarySent = true;
    }
  }

  if (action === 'skip') {
    await saveRateLimitState(env, rateKey, state, RATE_WINDOW_MS);
    return null;
  }

  const content = action === 'summary'
    ? buildSummaryContent(state.summary)
    : buildMessageContent(payload);
  const metadata = action === 'summary'
    ? buildSummaryMetadata({
        reason,
        summary: state.summary,
        windowStart,
        windowEnd
      })
    : buildMessageMetadata(payload, notificationType);

  const message = await conversationService.sendSystemMessage({
    conversationId,
    practiceId: payload.practiceId,
    content,
    metadata,
    recipientUserId: recipient.userId,
    auditEventType: 'notification_bot_message',
    auditPayload: { conversationId },
    skipPracticeValidation: true
  });

  if (shouldIncrement) {
    globalState.messageCount += 1;
    try {
      await saveGlobalRateLimitState(env, globalKey, globalState, USER_WINDOW_MS);
    } catch (error) {
      Logger.warn('Failed to save global rate-limit state', {
        error: error instanceof Error ? error.message : String(error),
        globalKey
      });
    }
  }
  try {
    await saveRateLimitState(env, rateKey, state, RATE_WINDOW_MS);
  } catch (error) {
    Logger.warn('Failed to save rate-limit state', {
      error: error instanceof Error ? error.message : String(error),
      rateKey
    });
  }

  await maybePruneSystemConversation(env, conversationService, conversationId);

  return message.id;
}

export async function handleNotificationQueue(
  batch: MessageBatch<NotificationQueueMessage>,
  env: Env
): Promise<void> {
  Logger.initialize({
    DEBUG: env.DEBUG,
    NODE_ENV: env.NODE_ENV
  });

  const emailEnabled = readEnvToggle(env.ENABLE_EMAIL_NOTIFICATIONS, true);
  const pushEnabled = readEnvToggle(env.ENABLE_PUSH_NOTIFICATIONS, true);

  if (!emailEnabled) {
    Logger.info('Email notifications disabled via ENABLE_EMAIL_NOTIFICATIONS');
  }

  if (!pushEnabled) {
    Logger.info('Push notifications disabled via ENABLE_PUSH_NOTIFICATIONS');
  }

  const deliveryStore = new NotificationDeliveryStore(env);
  const destinationStore = new NotificationDestinationStore(env);
  const oneSignal = OneSignalService.isConfigured(env) ? new OneSignalService(env) : null;
  if (!oneSignal) {
    Logger.warn('OneSignal delivery disabled - missing credentials');
  }

  const conversationService = new ConversationService(env);

  for (const msg of batch.messages) {
    const payload = msg.body;
    let hadFailure = false;
    const createdAtMs = payload.createdAt ? new Date(payload.createdAt).getTime() : NaN;
    const nowMs = Number.isFinite(createdAtMs) ? createdAtMs : Date.now();
    const conversationId = resolveConversationId(payload);

    let sharedMessageId: string | null = null;
    const perRecipientMessageIds = new Map<string, string>();

    if (payload.practiceId && conversationId) {
      const inAppRecipients = payload.recipients.filter(shouldSendInApp);
      let participantUserId: string | null = null;
      for (const recipient of inAppRecipients) {
        try {
          await conversationService.validateParticipantAccess(conversationId, payload.practiceId, recipient.userId);
          participantUserId = recipient.userId;
          break;
        } catch {
          continue;
        }
      }

      if (participantUserId) {
        try {
          sharedMessageId = await sendConversationBotMessage({
            env,
            conversationService,
            payload,
            conversationId,
            participantUserId,
            nowMs
          });
        } catch (error) {
          hadFailure = true;
          Logger.warn('Failed to create conversation bot message', {
            eventId: payload.eventId,
            conversationId,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    } else if (payload.practiceId) {
      for (const recipient of payload.recipients) {
        if (!shouldSendInApp(recipient)) {
          continue;
        }
        try {
          const messageId = await sendSystemBotMessage({
            env,
            conversationService,
            payload,
            recipient,
            nowMs
          });
          if (messageId) {
            perRecipientMessageIds.set(recipient.userId, messageId);
          }
        } catch (error) {
          hadFailure = true;
          Logger.warn('Failed to create system bot message', {
            eventId: payload.eventId,
            recipient: recipient.userId,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }

    for (const recipient of payload.recipients) {
      try {
        if (!shouldProcessRecipient(recipient, payload)) {
          continue;
        }

        const deliveryId = perRecipientMessageIds.get(recipient.userId)
          ?? sharedMessageId
          ?? payload.eventId
          ?? crypto.randomUUID();

        if (emailEnabled && shouldSendEmail(recipient) && oneSignal) {
          try {
            await sendEmailNotification(oneSignal, recipient, payload);
            await deliveryStore.recordResult({
              notificationId: deliveryId,
              userId: recipient.userId,
              channel: 'email',
              provider: 'onesignal',
              status: 'success'
            });
          } catch (error) {
            hadFailure = true;
            await deliveryStore.recordResult({
              notificationId: deliveryId,
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

        if (pushEnabled && shouldSendPush(recipient) && oneSignal) {
          try {
            await sendPushNotification(oneSignal, recipient, payload);
            await deliveryStore.recordResult({
              notificationId: deliveryId,
              userId: recipient.userId,
              channel: 'push',
              provider: 'onesignal',
              status: 'success',
              externalUserId: recipient.userId
            });
          } catch (error) {
            await deliveryStore.recordResult({
              notificationId: deliveryId,
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
