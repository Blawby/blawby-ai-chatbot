// Default value utilities for atomic design system
// Ensures consistent default behavior across all form components

export interface DefaultValueConfig {
  enabled?: boolean;
  required?: boolean;
  fallback?: string | number | boolean | object;
}

export interface NotificationDefaults {
  messages: {
    push: boolean;
    email: boolean;
  };
  system: {
    push: boolean;
    email: boolean;
  };
  payments: {
    push: boolean;
    email: boolean;
  };
  intakes: {
    push: boolean;
    email: boolean;
  };
  matters: {
    push: boolean;
    email: boolean;
  };
}

// Default notification settings - features ON by default
export const NOTIFICATION_DEFAULTS: NotificationDefaults = {
  messages: {
    push: true,
    email: true
  },
  system: {
    push: true,
    email: true
  },
  payments: {
    push: true,
    email: true
  },
  intakes: {
    push: true,
    email: true
  },
  matters: {
    push: true,
    email: true
  }
};

export const DEFAULT_DESKTOP_PUSH_ENABLED = false;
export const DEFAULT_MESSAGES_MENTIONS_ONLY = false;

// Helper function to get display text for notification channels
export function getNotificationDisplayText(
  settings: NotificationDefaults[keyof NotificationDefaults],
  translations: {
    push: string;
    email: string;
    none: string;
  }
): string {
  const enabledChannels = [];
  
  if (settings.push) enabledChannels.push(translations.push);
  if ('email' in settings && settings.email) enabledChannels.push(translations.email);
  
  // Show "None" only when all channels are explicitly disabled
  // This follows atomic design principle: features are ON by default
  return enabledChannels.length > 0 
    ? enabledChannels.join(', ') 
    : translations.none;
}

// Helper function to check if all channels are disabled
export function areAllChannelsDisabled(
  settings: NotificationDefaults[keyof NotificationDefaults]
): boolean {
  return Object.values(settings).every(value => value === false);
}

// Helper function to ensure at least one channel is enabled (atomic design principle)
export function ensureAtLeastOneChannel(
  settings: NotificationDefaults[keyof NotificationDefaults],
  defaultSettings: NotificationDefaults[keyof NotificationDefaults]
): NotificationDefaults[keyof NotificationDefaults] {
  const hasEnabledChannels = Object.values(settings).some(value => value === true);
  
  if (!hasEnabledChannels) {
    // If all channels are disabled, revert to default (features ON by default)
    return defaultSettings;
  }
  
  return settings;
}
