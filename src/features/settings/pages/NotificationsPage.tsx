import { useMemo, useState } from 'preact/hooks';
import { SectionDivider } from '@/shared/ui';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useTranslation } from '@/shared/i18n/hooks';
import { getNotificationDisplayText } from '@/shared/ui/validation/defaultValues';
import { SettingHeader } from '@/features/settings/components/SettingHeader';
import { SettingRow } from '@/features/settings/components/SettingRow';
import { NotificationChannelSelector } from '@/features/settings/components/NotificationChannelSelector';
import { useNotificationSettings, updateNotificationChannel, updateDesktopPushEnabled, updateMessagesMentionsOnly } from '@/features/settings/hooks/useNotificationSettings';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { Button } from '@/shared/ui/Button';
import { Switch } from '@/shared/ui/input';
import {
  getNotificationPermissionState,
  requestNotificationPermission,
  type NotificationPermissionState
} from '@/shared/notifications/oneSignalClient';
import type { NotificationSettings } from '@/shared/types/user';
import type { NotificationCategory } from '@/features/notifications/types';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import {
  applyNotificationPolicy,
  getNotificationPolicyCategoryKey,
  isNotificationChannelLocked,
  normalizeNotificationPolicy,
  updateNotificationPolicy,
  type NotificationPolicy
} from '@/features/settings/utils/notificationPolicy';

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

export const NotificationsPage = ({
  className = ''
}: NotificationsPageProps) => {
  const { showSuccess, showError } = useToastContext();
  const { t } = useTranslation(['settings', 'common']);
  const { session } = useSessionContext();
  const { currentPractice, updatePractice } = usePracticeManagement({
    fetchInvitations: false
  });
  const [policyOverride, setPolicyOverride] = useState<NotificationPolicy | null>(null);
  const [isSavingPolicy, setIsSavingPolicy] = useState(false);
  const policy = useMemo(
    () => policyOverride ?? normalizeNotificationPolicy(currentPractice?.metadata?.notificationPolicy),
    [policyOverride, currentPractice?.metadata]
  );
  const { settings, isLoading, error } = useNotificationSettings(policy.defaults);
  const [permissionState, setPermissionState] = useState<NotificationPermissionState>(getNotificationPermissionState());
  const effectiveSettings = useMemo(
    () => applyNotificationPolicy(settings, policy),
    [settings, policy]
  );

  const isAdmin = ['owner', 'admin'].includes(String(session?.user?.role ?? '').toLowerCase());
  const isPermissionGranted = permissionState === 'granted';
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
        t('common:notifications.errorTitle', { defaultValue: 'Update failed' }),
        t('common:notifications.settingsSaveError', { defaultValue: 'Unable to save notification settings.' })
      );
    }
  };

  const handleDesktopToggle = async (value: boolean) => {
    try {
      await updateDesktopPushEnabled(value);
      showSuccess(
        t('common:notifications.settingsSavedTitle', { defaultValue: 'Settings saved' }),
        t('settings:notifications.desktop.toastBody', { defaultValue: 'Desktop notification preference updated.' })
      );
    } catch (error) {
      console.error('Failed to update desktop push preference:', error);
      showError(
        t('common:notifications.errorTitle', { defaultValue: 'Update failed' }),
        t('common:notifications.settingsSaveError', { defaultValue: 'Unable to save notification settings.' })
      );
    }
  };

  const handleRequestPermission = async () => {
    try {
      const next = await requestNotificationPermission();
      setPermissionState(next);
      if (next === 'granted') {
        showSuccess(
          t('settings:notifications.desktop.permissionGrantedTitle', { defaultValue: 'Desktop notifications enabled' }),
          t('settings:notifications.desktop.permissionGrantedBody', { defaultValue: 'You will receive desktop alerts when Blawby sends updates.' })
        );
      } else if (next === 'denied') {
        showError(
          t('settings:notifications.desktop.permissionDeniedTitle', { defaultValue: 'Permission blocked' }),
          t('settings:notifications.desktop.permissionDeniedBody', { defaultValue: 'Enable notifications in your browser settings to receive alerts.' })
        );
      }
    } catch (error) {
      console.error('Failed to request notification permission:', error);
      showError(
        t('settings:notifications.desktop.permissionErrorTitle', { defaultValue: 'Permission failed' }),
        t('settings:notifications.desktop.permissionErrorBody', { defaultValue: 'We could not enable desktop notifications.' })
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
        t('common:notifications.errorTitle', { defaultValue: 'Update failed' }),
        t('common:notifications.settingsSaveError', { defaultValue: 'Unable to save notification settings.' })
      );
    }
  };

  const handlePolicyChange = async (
    category: NotificationCategory,
    scope: 'defaults' | 'allowed',
    channel: 'push' | 'email',
    value: boolean
  ) => {
    if (!currentPractice) return;
    if (category === 'system') return;

    const nextPolicy = updateNotificationPolicy(policy, category, scope, channel, value);
    setPolicyOverride(nextPolicy);
    setIsSavingPolicy(true);

    try {
      await updatePractice(currentPractice.id, {
        metadata: {
          notificationPolicy: nextPolicy
        }
      });
      showSuccess(
        t('common:notifications.settingsSavedTitle', { defaultValue: 'Settings saved' }),
        t('settings:notifications.organization.toastBody', { defaultValue: 'Organization notification defaults updated.' })
      );
      setPolicyOverride(null);
    } catch (error) {
      console.error('Failed to update organization notification policy:', error);
      showError(
        t('common:notifications.errorTitle', { defaultValue: 'Update failed' }),
        t('settings:notifications.organization.toastErrorBody', { defaultValue: 'Unable to update organization notification settings.' })
      );
      setPolicyOverride(null);
    } finally {
      setIsSavingPolicy(false);
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
            const categorySettings = getCategorySettings(effectiveSettings, category.key);
            const displayText = category.key === 'system'
              ? translations.required
              : getNotificationDisplayText(categorySettings, translations);
            const channels = [
              {
                key: 'push',
                label: translations.push,
                checked: categorySettings.push,
                disabled: isNotificationChannelLocked(policy, category.key, 'push')
              },
              {
                key: 'email',
                label: translations.email,
                checked: categorySettings.email,
                disabled: isNotificationChannelLocked(policy, category.key, 'email')
              }
            ];
            const baseDescription = t(category.descriptionKey, { defaultValue: category.fallbackDescription });
            const isSystem = category.key === 'system';
            const hasLockedChannel = ['push', 'email'].some((channel) =>
              isNotificationChannelLocked(policy, category.key, channel as 'push' | 'email')
            );
            const policyNote = isSystem
              ? t('settings:notifications.systemRequiredHint', { defaultValue: 'System notifications are required for all members.' })
              : (hasLockedChannel
                ? t('settings:notifications.managedHint', { defaultValue: 'Managed by your organization.' })
                : null);
            const description = policyNote
              ? (
                <>
                  <span>{baseDescription}</span>
                  <span className="mt-1 block text-[11px] text-gray-400 dark:text-gray-500">{policyNote}</span>
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
                      if (isNotificationChannelLocked(policy, category.key, channelKey as 'push' | 'email')) {
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

          <SettingRow
            label={t('settings:notifications.desktop.title', { defaultValue: 'Desktop notifications' })}
            description={t('settings:notifications.desktop.description', { defaultValue: 'Allow Blawby to send OS-level alerts.' })}
          >
            <div className="flex items-center gap-2">
              {permissionState !== 'granted' && isPermissionSupported && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleRequestPermission}
                  disabled={permissionState === 'denied'}
                >
                  {permissionState === 'denied'
                    ? t('settings:notifications.desktop.permissionDeniedButton', { defaultValue: 'Blocked' })
                    : t('settings:notifications.desktop.permissionButton', { defaultValue: 'Enable' })}
                </Button>
              )}
              <Switch
                value={settings.desktopPushEnabled}
                onChange={handleDesktopToggle}
                disabled={!isPermissionGranted}
                className="py-0"
              />
            </div>
          </SettingRow>

          {isAdmin && (
            <>
              <SectionDivider />
              <div className="rounded-lg border border-gray-200 bg-gray-50/70 p-4 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-800/40 dark:text-gray-300">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {t('settings:notifications.organization.title', { defaultValue: 'Organization defaults' })}
                </p>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                  {t('settings:notifications.organization.description', { defaultValue: 'Set defaults for your team. Members can customize unless a channel is locked.' })}
                </p>
                <div className="mt-4">
                  {CATEGORY_CONFIG.map((category, index) => {
                    const policyKey = getNotificationPolicyCategoryKey(category.key);
                    const defaults = policy.defaults[policyKey];
                    const allowed = policy.allowed[policyKey];
                    const isSystem = category.key === 'system';
                    const defaultsDisplay = isSystem
                      ? translations.required
                      : getNotificationDisplayText(defaults, translations);
                    const allowedDisplay = isSystem
                      ? translations.required
                      : getNotificationDisplayText(allowed, translations);

                    return (
                      <div key={`org-${category.key}`}>
                        <SettingRow
                          label={t(category.labelKey, { defaultValue: category.fallbackLabel })}
                          description={isSystem
                            ? t('settings:notifications.organization.systemRequired', { defaultValue: 'System notifications are required and cannot be disabled.' })
                            : t(category.descriptionKey, { defaultValue: category.fallbackDescription })}
                        >
                          <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                                {t('settings:notifications.organization.defaultsLabel', { defaultValue: 'Defaults' })}
                              </span>
                              <NotificationChannelSelector
                                displayText={defaultsDisplay}
                                channels={[
                                  {
                                    key: 'push',
                                    label: translations.push,
                                    checked: defaults.push,
                                    disabled: isSystem || isSavingPolicy
                                  },
                                  {
                                    key: 'email',
                                    label: translations.email,
                                    checked: defaults.email,
                                    disabled: isSystem || isSavingPolicy
                                  }
                                ]}
                                onChannelChange={(channelKey, checked) =>
                                  handlePolicyChange(category.key, 'defaults', channelKey as 'push' | 'email', checked)}
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                                {t('settings:notifications.organization.allowedLabel', { defaultValue: 'Allowed' })}
                              </span>
                              <NotificationChannelSelector
                                displayText={allowedDisplay}
                                channels={[
                                  {
                                    key: 'push',
                                    label: translations.push,
                                    checked: allowed.push,
                                    disabled: isSystem || isSavingPolicy
                                  },
                                  {
                                    key: 'email',
                                    label: translations.email,
                                    checked: allowed.email,
                                    disabled: isSystem || isSavingPolicy
                                  }
                                ]}
                                onChannelChange={(channelKey, checked) =>
                                  handlePolicyChange(category.key, 'allowed', channelKey as 'push' | 'email', checked)}
                              />
                            </div>
                          </div>
                        </SettingRow>
                        {index < CATEGORY_CONFIG.length - 1 && <SectionDivider />}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
