import type {
  Env,
  NotificationQueueMessage,
  NotificationRecipientSnapshot,
  NotificationCategory,
  NotificationPolicy,
  NotificationPolicyCategoryKey
} from '../types.js';
import { normalizeNotificationPolicy } from '../types.js';
import { RemoteApiService } from './RemoteApiService.js';
import { Logger } from '../utils/logger.js';

interface PracticeMember {
  user_id: string;
  email?: string | null;
  role?: string | null;
}

const ADMIN_ROLES = new Set(['owner', 'admin']);

type RemoteNotificationPreferences = Record<string, unknown>;

const categoryPreferenceKey: Record<NotificationCategory, { push: string; email: string }> = {
  message: { push: 'messages_push', email: 'messages_email' },
  payment: { push: 'payments_push', email: 'payments_email' },
  intake: { push: 'intakes_push', email: 'intakes_email' },
  matter: { push: 'matters_push', email: 'matters_email' },
  system: { push: 'system_push', email: 'system_email' }
};

const categoryPolicyKey: Record<NotificationCategory, NotificationPolicyCategoryKey> = {
  message: 'messages',
  payment: 'payments',
  intake: 'intakes',
  matter: 'matters',
  system: 'system'
};

function resolveChannelPreference(
  prefs: RemoteNotificationPreferences | null | undefined,
  key: string,
  defaultValue: boolean
): boolean {
  if (!prefs || !(key in prefs)) return defaultValue;
  return Boolean(prefs[key]);
}

function resolveRecipientPreferences(
  prefs: RemoteNotificationPreferences | null | undefined,
  category: NotificationCategory,
  policy: NotificationPolicy
): NotificationRecipientSnapshot['preferences'] {
  const defaults = policy.defaults[categoryPolicyKey[category]];
  const allowed = policy.allowed[categoryPolicyKey[category]];
  const desktopPushEnabled = resolveChannelPreference(prefs, 'desktop_push_enabled', true);
  const mentionsOnly = category === 'message'
    ? resolveChannelPreference(prefs, 'messages_mentions_only', false)
    : false;
  const channelKeys = categoryPreferenceKey[category];
  const pushEnabled = allowed.push && resolveChannelPreference(prefs, channelKeys.push, defaults.push);
  const emailEnabled = allowed.email && resolveChannelPreference(prefs, channelKeys.email, defaults.email);

  if (category === 'system') {
    return { pushEnabled: true, emailEnabled: true, desktopPushEnabled, mentionsOnly };
  }

  return { pushEnabled, emailEnabled, desktopPushEnabled, mentionsOnly };
}

export async function getAdminRecipients(
  env: Env,
  practiceId: string,
  request: Request,
  options?: { actorUserId?: string; category?: NotificationCategory }
): Promise<NotificationRecipientSnapshot[]> {
  const [members, actorPreferences, memberPreferences, practice] = await Promise.all([
    RemoteApiService.getPracticeMembers(env, practiceId, request),
    RemoteApiService.getNotificationPreferences(env, request),
    RemoteApiService.getPracticeMemberNotificationPreferences(env, practiceId, request),
    RemoteApiService.getPractice(env, practiceId, request)
  ]);

  const category = options?.category ?? 'system';
  const policy = normalizeNotificationPolicy(practice?.metadata?.notificationPolicy);

  return members
    .filter((member): member is PracticeMember => Boolean(member?.user_id))
    .filter((member) => ADMIN_ROLES.has(String(member.role ?? '').toLowerCase()))
    .map((member) => {
      const prefs = memberPreferences[member.user_id]
        ?? (options?.actorUserId && member.user_id === options.actorUserId ? actorPreferences : null);
      return {
        userId: member.user_id,
        email: member.email ?? null,
        preferences: resolveRecipientPreferences(prefs, category, policy)
      };
    });
}

export async function enqueueNotification(env: Env, message: NotificationQueueMessage): Promise<void> {
  Logger.initialize({
    DEBUG: env.DEBUG,
    NODE_ENV: env.NODE_ENV
  });

  await env.NOTIFICATION_EVENTS.send(message);
}
