import { atom, onMount } from 'nanostores';
import { useMemo } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import { getPreferencesCategory, updatePreferencesCategory } from '@/shared/lib/preferencesApi';
import type { NotificationPreferences } from '@/shared/types/preferences';
import type { NotificationSettings } from '@/shared/types/user';
import {
  NOTIFICATION_DEFAULTS,
  DEFAULT_DESKTOP_PUSH_ENABLED,
  DEFAULT_MESSAGES_MENTIONS_ONLY,
  type NotificationDefaults
} from '@/shared/ui/validation/defaultValues';
import type { NotificationCategory } from '@/features/notifications/types';

interface NotificationSettingsState {
  preferences: NotificationPreferences | null;
  isLoading: boolean;
  error: string | null;
}

const notificationSettingsStore = atom<NotificationSettingsState>({
  preferences: null,
  isLoading: true,
  error: null
});

const categoryPreferenceKey: Record<NotificationCategory, { push: keyof NotificationPreferences; email: keyof NotificationPreferences }> = {
  message: { push: 'messages_push', email: 'messages_email' },
  system: { push: 'system_push', email: 'system_email' },
  payment: { push: 'payments_push', email: 'payments_email' },
  intake: { push: 'intakes_push', email: 'intakes_email' },
  matter: { push: 'matters_push', email: 'matters_email' }
};

const buildSettings = (
  prefs: NotificationPreferences | null,
  defaults: NotificationDefaults
): NotificationSettings => ({
  messages: {
    push: prefs?.messages_push ?? defaults.messages.push,
    email: prefs?.messages_email ?? defaults.messages.email
  },
  messagesMentionsOnly: prefs?.messages_mentions_only ?? DEFAULT_MESSAGES_MENTIONS_ONLY,
  system: {
    push: prefs?.system_push ?? defaults.system.push,
    email: prefs?.system_email ?? defaults.system.email
  },
  payments: {
    push: prefs?.payments_push ?? defaults.payments.push,
    email: prefs?.payments_email ?? defaults.payments.email
  },
  intakes: {
    push: prefs?.intakes_push ?? defaults.intakes.push,
    email: prefs?.intakes_email ?? defaults.intakes.email
  },
  matters: {
    push: prefs?.matters_push ?? defaults.matters.push,
    email: prefs?.matters_email ?? defaults.matters.email
  },
  desktopPushEnabled: prefs?.desktop_push_enabled ?? DEFAULT_DESKTOP_PUSH_ENABLED
});

const setState = (next: Partial<NotificationSettingsState>) => {
  const current = notificationSettingsStore.get();
  notificationSettingsStore.set({ ...current, ...next });
};

const loadNotificationSettings = async () => {
  setState({ isLoading: true, error: null });
  try {
    const prefs = await getPreferencesCategory<NotificationPreferences>('notifications');
    setState({ preferences: prefs, isLoading: false, error: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load notification settings';
    setState({ preferences: null, isLoading: false, error: message });
  }
};

const updateSettings = async (
  nextPreferences: NotificationPreferences,
  updateData: Partial<NotificationPreferences>
) => {
  const current = notificationSettingsStore.get();
  const previousPreferences = current.preferences;
  setState({ preferences: nextPreferences });
  try {
    await updatePreferencesCategory('notifications', updateData);
  } catch (error) {
    const latestState = notificationSettingsStore.get();
    const rolledBackPreferences = latestState.preferences
      ? { ...latestState.preferences }
      : previousPreferences;

    if (rolledBackPreferences && previousPreferences) {
      for (const key of Object.keys(updateData) as (keyof NotificationPreferences)[]) {
        rolledBackPreferences[key] = previousPreferences[key];
      }
    }

    const message = error instanceof Error ? error.message : 'Failed to update settings';
    setState({ preferences: rolledBackPreferences ?? null, error: message });
    throw error;
  }
};

export const updateNotificationChannel = async (
  category: NotificationCategory,
  channel: 'push' | 'email',
  value: boolean
) => {
  const current = notificationSettingsStore.get();
  if (!current.preferences) {
    throw new Error('Notification settings not loaded');
  }
  const currentPrefs = current.preferences;
  const nextPreferences: NotificationPreferences = {
    ...currentPrefs,
    [categoryPreferenceKey[category][channel]]: value
  };

  const updateData: Partial<NotificationPreferences> = {
    [categoryPreferenceKey[category][channel]]: value
  };

  await updateSettings(nextPreferences, updateData);
};

export const updateDesktopPushEnabled = async (value: boolean) => {
  const current = notificationSettingsStore.get();
  if (!current.preferences) {
    throw new Error('Notification settings not loaded');
  }
  const currentPrefs = current.preferences;
  const nextPreferences: NotificationPreferences = {
    ...currentPrefs,
    desktop_push_enabled: value
  };

  await updateSettings(nextPreferences, { desktop_push_enabled: value });
};

export const updateMessagesMentionsOnly = async (value: boolean) => {
  const current = notificationSettingsStore.get();
  if (!current.preferences) {
    throw new Error('Notification settings not loaded');
  }
  const currentPrefs = current.preferences;
  const nextPreferences: NotificationPreferences = {
    ...currentPrefs,
    messages_mentions_only: value
  };

  await updateSettings(nextPreferences, { messages_mentions_only: value });
};

onMount(notificationSettingsStore, () => {
  void loadNotificationSettings();
});

export const useNotificationSettings = (defaults: NotificationDefaults = NOTIFICATION_DEFAULTS) => {
  const store = useStore(notificationSettingsStore);
  const settings = useMemo(
    () => buildSettings(store.preferences, defaults),
    [store.preferences, defaults]
  );
  return { ...store, settings };
};

export const refreshNotificationSettings = () => loadNotificationSettings();
