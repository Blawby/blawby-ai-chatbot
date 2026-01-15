import { NOTIFICATION_DEFAULTS } from '@/shared/ui/validation/defaultValues';
import type { NotificationDefaults } from '@/shared/ui/validation/defaultValues';
import type { NotificationSettings } from '@/shared/types/user';
import type { NotificationCategory } from '@/features/notifications/types';

export type NotificationPolicyScope = 'defaults' | 'allowed';
export type NotificationChannelKey = 'push' | 'email';

export interface NotificationPolicy {
  defaults: NotificationDefaults;
  allowed: NotificationDefaults;
}

const ALL_ALLOWED: NotificationDefaults = {
  messages: { push: true, email: true },
  system: { push: true, email: true },
  payments: { push: true, email: true },
  intakes: { push: true, email: true },
  matters: { push: true, email: true }
};

const CATEGORY_KEYS: Record<NotificationCategory, keyof NotificationDefaults> = {
  message: 'messages',
  system: 'system',
  payment: 'payments',
  intake: 'intakes',
  matter: 'matters'
};

const coerceBoolean = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback;

const normalizeCategory = (
  raw: unknown,
  fallback: NotificationDefaults[keyof NotificationDefaults]
): NotificationDefaults[keyof NotificationDefaults] => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return fallback;
  }
  const record = raw as Record<string, unknown>;
  return {
    push: coerceBoolean(record.push, fallback.push),
    email: coerceBoolean(record.email, fallback.email)
  };
};

export const normalizeNotificationPolicy = (raw: unknown): NotificationPolicy => {
  const record = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const defaultsRaw = record.defaults as Record<string, unknown> | undefined;
  const allowedRaw = record.allowed as Record<string, unknown> | undefined;

  const defaults: NotificationDefaults = {
    messages: normalizeCategory(defaultsRaw?.messages, NOTIFICATION_DEFAULTS.messages),
    system: NOTIFICATION_DEFAULTS.system,
    payments: normalizeCategory(defaultsRaw?.payments, NOTIFICATION_DEFAULTS.payments),
    intakes: normalizeCategory(defaultsRaw?.intakes, NOTIFICATION_DEFAULTS.intakes),
    matters: normalizeCategory(defaultsRaw?.matters, NOTIFICATION_DEFAULTS.matters)
  };

  const allowed: NotificationDefaults = {
    messages: normalizeCategory(allowedRaw?.messages, ALL_ALLOWED.messages),
    system: ALL_ALLOWED.system,
    payments: normalizeCategory(allowedRaw?.payments, ALL_ALLOWED.payments),
    intakes: normalizeCategory(allowedRaw?.intakes, ALL_ALLOWED.intakes),
    matters: normalizeCategory(allowedRaw?.matters, ALL_ALLOWED.matters)
  };

  // System notifications are always enabled and cannot be disabled by users.
  // This ensures critical system messages are always delivered.
  defaults.system = { push: true, email: true };
  allowed.system = { push: true, email: true };

  return { defaults, allowed };
};

export const applyNotificationPolicy = (
  settings: NotificationSettings,
  policy: NotificationPolicy
): NotificationSettings => {
  const applyCategory = (key: keyof NotificationDefaults): NotificationDefaults[keyof NotificationDefaults] => {
    const current = settings[key];
    const allowed = policy.allowed[key];
    return {
      push: allowed.push ? current.push : false,
      email: allowed.email ? current.email : false
    };
  };

  return {
    ...settings,
    messages: applyCategory('messages'),
    payments: applyCategory('payments'),
    intakes: applyCategory('intakes'),
    matters: applyCategory('matters'),
    system: { push: true, email: true }
  };
};

export const updateNotificationPolicy = (
  policy: NotificationPolicy,
  category: NotificationCategory,
  scope: NotificationPolicyScope,
  channel: NotificationChannelKey,
  value: boolean
): NotificationPolicy => {
  if (category === 'system') {
    return policy;
  }

  const key = CATEGORY_KEYS[category];
  const nextScope = {
    ...policy[scope],
    [key]: {
      ...policy[scope][key],
      [channel]: value
    }
  };

  let nextPolicy: NotificationPolicy = {
    ...policy,
    [scope]: nextScope
  };

  if (scope === 'allowed' && value === false) {
    nextPolicy = {
      ...nextPolicy,
      defaults: {
        ...nextPolicy.defaults,
        [key]: {
          ...nextPolicy.defaults[key],
          [channel]: false
        }
      }
    };
  }

  nextPolicy.defaults = {
    ...nextPolicy.defaults,
    system: { push: true, email: true }
  };
  nextPolicy.allowed = {
    ...nextPolicy.allowed,
    system: { push: true, email: true }
  };

  return nextPolicy;
};

export const isNotificationChannelLocked = (
  policy: NotificationPolicy,
  category: NotificationCategory,
  channel: NotificationChannelKey
): boolean => {
  if (category === 'system') {
    return true;
  }
  const key = CATEGORY_KEYS[category];
  return policy.allowed[key][channel] === false;
};

export const getNotificationPolicyCategoryKey = (category: NotificationCategory): keyof NotificationDefaults =>
  CATEGORY_KEYS[category];
