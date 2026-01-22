import { useMemo, useState } from 'preact/hooks';
import { SectionDivider } from '@/shared/ui';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useTranslation } from '@/shared/i18n/hooks';
import { getNotificationDisplayText } from '@/shared/ui/validation/defaultValues';
import { SettingHeader } from '@/features/settings/components/SettingHeader';
import { SettingRow } from '@/features/settings/components/SettingRow';
import { NotificationChannelSelector } from '@/features/settings/components/NotificationChannelSelector';
import {
  useNotificationSettings,
  updateNotificationChannel,
  updateDesktopPushEnabled,
  updateMessagesMentionsOnly,
  updateInAppCategory,
  updateInAppFrequency
} from '@/features/settings/hooks/useNotificationSettings';
import { Switch } from '@/shared/ui/input';
import {
  getNotificationPermissionState,
  optInDesktopNotifications,
  optOutDesktopNotifications,
  type NotificationPermissionState
} from '@/shared/notifications/oneSignalClient';
import type { NotificationSettings } from '@/shared/types/user';
import type { NotificationCategory, InAppNotificationFrequency } from '@/shared/types/notifications';

export interface NotificationsPageProps {
  className?: string;
}

const CATEGORY_CONFIG: Array<{
  key: NotificationCategory;
  labelKey: string;
  descriptionKey: string;
  fallbackLabel: string;
  fallbackDescription: string;
}> = [
  {
    key: 'message',
    labelKey: 'settings:notifications.categories.messages.title',
    descriptionKey: 'settings:notifications.categories.messages.description',
    fallbackLabel: 'Messages',
    fallbackDescription: 'Message notifications for new conversation activity.'
  },
  {
    key: 'system',
    labelKey: 'settings:notifications.categories.system.title',
    descriptionKey: 'settings:notifications.categories.system.description',
    fallbackLabel: 'System',
    fallbackDescription: 'Updates and alerts from Blawby.'
  },
  {
    key: 'payment',
    labelKey: 'settings:notifications.categories.payments.title',
    descriptionKey: 'settings:notifications.categories.payments.description',
    fallbackLabel: 'Payments',
    fallbackDescription: 'Payment and billing updates.'
  },
  {
    key: 'intake',
    labelKey: 'settings:notifications.categories.intakes.title',
    descriptionKey: 'settings:notifications.categories.intakes.description',
    fallbackLabel: 'Intakes',
    fallbackDescription: 'Client intake updates and submissions.'
  },
  {
    key: 'matter',
    labelKey: 'settings:notifications.categories.matters.title',
    descriptionKey: 'settings:notifications.categories.matters.description',
    fallbackLabel: 'Matters',
    fallbackDescription: 'Matter status changes and updates.'
  }
];

const IN_APP_CATEGORY_CONFIG: Array<{
  key: NotificationCategory;
  labelKey: string;
  descriptionKey: string;
  fallbackLabel: string;
  fallbackDescription: string;
}> = [
  {
    key: 'message',
    labelKey: 'settings:notifications.inApp.messages.title',
    descriptionKey: 'settings:notifications.inApp.messages.description',
    fallbackLabel: 'Messages (in-app)',
    fallbackDescription: 'Bot updates inside conversation threads.'
  },
  {
    key: 'system',
    labelKey: 'settings:notifications.inApp.system.title',
    descriptionKey: 'settings:notifications.inApp.system.description',
    fallbackLabel: 'System (in-app)',
    fallbackDescription: 'Required system updates from Blawby.'
  },
  {
    key: 'payment',
    labelKey: 'settings:notifications.inApp.payments.title',
    descriptionKey: 'settings:notifications.inApp.payments.description',
    fallbackLabel: 'Payments (in-app)',
    fallbackDescription: 'Payment and billing updates in chat.'
  },
  {
    key: 'intake',
    labelKey: 'settings:notifications.inApp.intakes.title',
    descriptionKey: 'settings:notifications.inApp.intakes.description',
    fallbackLabel: 'Intakes (in-app)',
    fallbackDescription: 'Intake updates posted by Blawby.'
  },
  {
    key: 'matter',
    labelKey: 'settings:notifications.inApp.matters.title',
    descriptionKey: 'settings:notifications.inApp.matters.description',
    fallbackLabel: 'Matters (in-app)',
    fallbackDescription: 'Matter updates posted by Blawby.'
  }
];

const getCategorySettings = (settings: NotificationSettings, category: NotificationCategory) => {
  switch (category) {
    case 'message':
      return settings.messages;
    case 'system':
      return settings.system;
    case 'payment':
      return settings.payments;
    case 'intake':
      return settings.intakes;
    case 'matter':
      return settings.matters;
    default:
      return settings.system;
  }
};

const inAppSettingKey: Record<NotificationCategory, keyof NotificationSettings['inApp']> = {
  message: 'messages',
  system: 'system',
  payment: 'payments',
  intake: 'intakes',
  matter: 'matters'
};

export const NotificationsPage = ({
  className = ''
}: NotificationsPageProps) => {
  const { showSuccess, showError } = useToastContext();
  const { t } = useTranslation(['settings', 'common']);
  const { settings, isLoading, error } = useNotificationSettings();
  const [permissionState, setPermissionState] = useState<NotificationPermissionState>(getNotificationPermissionState());

  const isPermissionSupported = permissionState !== 'unsupported';

  const handleChannelChange = async (category: NotificationCategory, channelKey: string, value: boolean) => {
    try {
      await updateNotificationChannel(category, channelKey as 'push' | 'email', value);
      showSuccess(
        t('common:notifications.settingsSavedTitle', { defaultValue: 'Settings saved' }),
        t('settings:notifications.toastBody', { defaultValue: 'Your notification preferences have been updated.' })
      );
    } catch (error) {
      console.error('Failed to update notification settings:', error);
      showError(
        t('common:notifications.settingsSaveErrorTitle', { defaultValue: 'Settings save failed' }),
        t('common:notifications.settingsSaveErrorBody', { defaultValue: 'Unable to save your settings. Please try again.' })
      );
    }
  };

  const handleDesktopToggle = async (value: boolean) => {
    try {
      if (value) {
        if (!isPermissionSupported) {
          showError(
            t('common:notifications.settingsSaveErrorTitle', { defaultValue: 'Settings save failed' }),
            t('settings:notifications.desktop.permissionErrorBody', { defaultValue: 'We could not enable desktop notifications.' })
          );
          return;
        }
        const result = await optInDesktopNotifications();
        setPermissionState(result.permission);
        if (result.permission !== 'granted') {
          showError(
            t('settings:notifications.desktop.permissionDeniedTitle', { defaultValue: 'Permission blocked' }),
            t('settings:notifications.desktop.permissionDeniedBody', { defaultValue: 'Enable notifications in your browser settings to receive alerts.' })
          );
          return;
        }
        if (!result.subscribed) {
          showError(
            t('settings:notifications.desktop.permissionErrorTitle', { defaultValue: 'Permission failed' }),
            t('settings:notifications.desktop.permissionErrorBody', { defaultValue: 'We could not enable desktop notifications.' })
          );
          return;
        }
      } else {
        const optOutSucceeded = await optOutDesktopNotifications();
        if (!optOutSucceeded) {
          showError(
            t('settings:notifications.desktop.optOutFailedTitle', { defaultValue: 'Browser still subscribed' }),
            t('settings:notifications.desktop.optOutFailedBody', { defaultValue: 'Disable notifications in your browser settings to stop this device from receiving alerts.' })
          );
        }
      }
      await updateDesktopPushEnabled(value);
      showSuccess(
        t('common:notifications.settingsSavedTitle', { defaultValue: 'Settings saved' }),
        t('settings:notifications.desktop.toastBody', { defaultValue: 'Desktop notification preference updated.' })
      );
    } catch (error) {
      console.error('Failed to update desktop push preference:', error);
      showError(
        t('common:notifications.settingsSaveErrorTitle', { defaultValue: 'Settings save failed' }),
        t('common:notifications.settingsSaveErrorBody', { defaultValue: 'Unable to save your settings. Please try again.' })
      );
    }
  };

  const translations = useMemo(() => ({
    push: t('settings:notifications.channels.push', { defaultValue: 'Push' }),
    email: t('settings:notifications.channels.email', { defaultValue: 'Email' }),
    none: t('settings:notifications.channels.none', { defaultValue: 'None' }),
    required: t('settings:notifications.systemRequiredLabel', { defaultValue: 'Required' })
  }), [t]);

  const handleMentionsOnlyToggle = async (value: boolean) => {
    try {
      await updateMessagesMentionsOnly(value);
      showSuccess(
        t('common:notifications.settingsSavedTitle', { defaultValue: 'Settings saved' }),
        t('settings:notifications.mentions.toastBody', { defaultValue: 'Mention preferences updated.' })
      );
    } catch (error) {
      console.error('Failed to update mention preferences:', error);
      showError(
        t('common:notifications.settingsSaveErrorTitle', { defaultValue: 'Settings save failed' }),
        t('common:notifications.settingsSaveErrorBody', { defaultValue: 'Unable to save your settings. Please try again.' })
      );
    }
  };

  const handleInAppToggle = async (category: NotificationCategory, value: boolean) => {
    try {
      await updateInAppCategory(category, value);
      showSuccess(
        t('common:notifications.settingsSavedTitle', { defaultValue: 'Settings saved' }),
        t('settings:notifications.inApp.toastBody', { defaultValue: 'In-app preferences updated.' })
      );
    } catch (error) {
      console.error('Failed to update in-app notification settings:', error);
      showError(
        t('common:notifications.settingsSaveErrorTitle', { defaultValue: 'Settings save failed' }),
        t('common:notifications.settingsSaveErrorBody', { defaultValue: 'Unable to save your settings. Please try again.' })
      );
    }
  };

  const handleInAppFrequencyToggle = async (value: boolean) => {
    const nextValue: InAppNotificationFrequency = value ? 'summaries_only' : 'all';
    try {
      await updateInAppFrequency(nextValue);
      showSuccess(
        t('common:notifications.settingsSavedTitle', { defaultValue: 'Settings saved' }),
        t('settings:notifications.inApp.frequencyToast', { defaultValue: 'System conversation preferences updated.' })
      );
    } catch (error) {
      console.error('Failed to update in-app summary preference:', error);
      showError(
        t('common:notifications.settingsSaveErrorTitle', { defaultValue: 'Settings save failed' }),
        t('common:notifications.settingsSaveErrorBody', { defaultValue: 'Unable to save your settings. Please try again.' })
      );
    }
  };

  if (isLoading) {
    return (
      <div className={`h-full flex items-center justify-center ${className}`}>
        <div className="w-8 h-8 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !settings) {
    return (
      <div className={`h-full flex items-center justify-center ${className}`}>
        <p className="text-gray-500 dark:text-gray-400">
          {t('settings:notifications.loadError', { defaultValue: 'Failed to load notification settings' })}
        </p>
      </div>
    );
  }

  return (
    <div className={`h-full flex flex-col ${className}`}>
      <SettingHeader title={t('settings:notifications.title', { defaultValue: 'Notifications' })} />

      <div className="flex-1 overflow-y-auto px-6">
        <div className="space-y-0">
          {CATEGORY_CONFIG.map((category, index) => {
            const categorySettings = getCategorySettings(settings, category.key);
            const isSystem = category.key === 'system';
            const displayText = category.key === 'system'
              ? translations.required
              : getNotificationDisplayText(categorySettings, translations);
            const channels = [
              {
                key: 'push',
                label: translations.push,
                checked: categorySettings.push,
                disabled: isSystem
              },
              {
                key: 'email',
                label: translations.email,
                checked: categorySettings.email,
                disabled: isSystem
              }
            ];
            const baseDescription = t(category.descriptionKey, { defaultValue: category.fallbackDescription });
            const description = isSystem
              ? (
                <>
                  <span>{baseDescription}</span>
                  <span className="mt-1 block text-[11px] text-gray-400 dark:text-gray-500">
                    {t('settings:notifications.systemRequiredHint', { defaultValue: 'System notifications are required for all members.' })}
                  </span>
                </>
              )
              : baseDescription;

            return (
              <div key={category.key}>
                <SettingRow
                  label={t(category.labelKey, { defaultValue: category.fallbackLabel })}
                  description={description}
                >
                  <NotificationChannelSelector
                    displayText={displayText}
                    channels={channels}
                    onChannelChange={(channelKey, checked) => {
                      if (isSystem) {
                        return;
                      }
                      handleChannelChange(category.key, channelKey, checked);
                    }}
                  />
                </SettingRow>
                {category.key === 'message' && (
                  <>
                    <SectionDivider />
                    <SettingRow
                      label={t('settings:notifications.mentions.title', { defaultValue: 'Mentions only' })}
                      description={t('settings:notifications.mentions.description', { defaultValue: 'Only notify me when I am @mentioned in a conversation.' })}
                    >
                      <Switch
                        value={settings.messagesMentionsOnly}
                        onChange={handleMentionsOnlyToggle}
                        className="py-0"
                      />
                    </SettingRow>
                  </>
                )}
                {index < CATEGORY_CONFIG.length - 1 && <SectionDivider />}
              </div>
            );
          })}

          <SectionDivider />

          <div className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
            {t('settings:notifications.inApp.sectionTitle', { defaultValue: 'In-app bot messages' })}
          </div>

          {IN_APP_CATEGORY_CONFIG.map((category, index) => {
            const isSystem = category.key === 'system';
            const description = t(category.descriptionKey, { defaultValue: category.fallbackDescription });

            return (
              <div key={`in-app-${category.key}`}>
                <SettingRow
                  label={t(category.labelKey, { defaultValue: category.fallbackLabel })}
                  description={description}
                >
                  <Switch
                    value={settings.inApp[inAppSettingKey[category.key]]}
                    onChange={(value) => handleInAppToggle(category.key, value)}
                    disabled={isSystem}
                    className="py-0"
                  />
                </SettingRow>
                {isSystem && (
                  <>
                    <SectionDivider />
                    <SettingRow
                      label={t('settings:notifications.inApp.frequencyLabel', { defaultValue: 'System summaries only' })}
                      description={t('settings:notifications.inApp.frequencyDescription', {
                        defaultValue: 'Show a single summary message for the Blawby System conversation.'
                      })}
                    >
                      <Switch
                        value={settings.inAppFrequency === 'summaries_only'}
                        onChange={handleInAppFrequencyToggle}
                        className="py-0"
                      />
                    </SettingRow>
                  </>
                )}
                {index < IN_APP_CATEGORY_CONFIG.length - 1 && <SectionDivider />}
              </div>
            );
          })}

          <SectionDivider />

          <SettingRow
            label={t('settings:notifications.desktop.title', { defaultValue: 'Desktop notifications' })}
            description={t('settings:notifications.desktop.description', { defaultValue: 'Allow Blawby to send OS-level alerts.' })}
          >
            <div className="flex items-center gap-2">
              <Switch
                value={settings.desktopPushEnabled}
                onChange={handleDesktopToggle}
                disabled={!isPermissionSupported}
                className="py-0"
              />
            </div>
          </SettingRow>
        </div>
      </div>
    </div>
  );
};
