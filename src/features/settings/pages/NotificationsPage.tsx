import { useState } from 'preact/hooks';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useTranslation } from '@/shared/i18n/hooks';
import { LoadingBlock } from '@/shared/ui/layout/LoadingBlock';
import {
  useNotificationSettings,
  updateNotificationChannel,
  updateDesktopPushEnabled,
} from '@/features/settings/hooks/useNotificationSettings';
import {
  getNotificationPermissionState,
  optInDesktopNotifications,
  optOutDesktopNotifications,
  type NotificationPermissionState
} from '@/shared/notifications/oneSignalClient';
import { Switch } from '@/shared/ui/input';
import type { NotificationCategory } from '@/shared/types/notifications';
import type { NotificationSettings } from '@/shared/types/user';
import { cn } from '@/shared/utils/cn';
import { SettingSection } from '@/features/settings/components/SettingSection';
import { SettingRow } from '@/features/settings/components/SettingRow';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NotifEvent {
  name: string;
  description: string;
  emailDisabled?: boolean;
}

interface NotifSection {
  title: string;
  description: string;
  category: NotificationCategory;
  events: NotifEvent[];
}

const SECTIONS: NotifSection[] = [
  {
    title: 'Intakes',
    description: 'Notifications about new leads and intake activity.',
    category: 'intake',
    events: [
      { name: 'New intake submitted', description: 'A prospective client completes your intake form' },
      { name: 'Intake flagged urgent / DV', description: 'Safety check triggered during intake' },
    ],
  },
  {
    title: 'Billing & payments',
    description: 'Payment and retainer notifications.',
    category: 'payment',
    events: [
      { name: 'Payment received', description: 'A client pays an invoice or retainer deposit' },
      { name: 'Payment failed', description: 'A charge was declined' },
      { name: 'Retainer low', description: "A client's retainer balance drops below the threshold" },
    ],
  },
  {
    title: 'Matters',
    description: 'Activity on your active matters.',
    category: 'matter',
    events: [
      { name: 'Client uploaded a document', description: 'A client adds a file to their matter portal' },
      { name: 'Engagement signed', description: 'A client accepts and signs an engagement letter' },
    ],
  },
  {
    title: 'Assistant',
    description: 'Notifications from the AI assistant.',
    category: 'system',
    events: [
      { name: 'Morning briefing', description: 'Daily summary of your practice and upcoming events' },
      { name: 'Staged action ready', description: 'The assistant drafted something that needs your approval' },
    ],
  },
  {
    title: 'Security',
    description: 'Account security alerts. These cannot be fully disabled.',
    category: 'system',
    events: [
      { name: 'New sign-in from unrecognized device', description: 'Someone signs into your account from a new device or location', emailDisabled: true },
      { name: 'Password changed', description: 'Your account password was changed', emailDisabled: true },
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const getCategorySettings = (settings: NotificationSettings, category: NotificationCategory) => {
  switch (category) {
    case 'message': return settings.messages;
    case 'system':  return settings.system;
    case 'payment': return settings.payments;
    case 'intake':  return settings.intakes;
    case 'matter':  return settings.matters;
    default:        return settings.system;
  }
};

// ---------------------------------------------------------------------------
// NotifRow
// ---------------------------------------------------------------------------

const NotifRow = ({ event, isLast = false }: { event: NotifEvent; isLast?: boolean }) => (
  <div className={cn('py-3.5', !isLast && 'border-b border-rule')}>
    <div className="text-sm font-medium text-ink">{event.name}</div>
    <div className="mt-0.5 text-[12.5px] leading-[1.4] text-dim">{event.description}</div>
  </div>
);

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export interface NotificationsPageProps {
  className?: string;
}

export const NotificationsPage = ({ className = '' }: NotificationsPageProps) => {
  const { showSuccess, showError } = useToastContext();
  const { t } = useTranslation(['settings', 'common']);
  const { settings, isLoading, error } = useNotificationSettings();
  const [permissionState, setPermissionState] = useState<NotificationPermissionState>(getNotificationPermissionState());

  const save = async (category: NotificationCategory, channel: 'email' | 'push', value: boolean) => {
    try {
      await updateNotificationChannel(category, channel, value);
      showSuccess(
        t('common:notifications.settingsSavedTitle', { defaultValue: 'Settings saved' }),
        t('settings:notifications.toastBody', { defaultValue: 'Notification preferences updated.' }),
      );
    } catch {
      showError(
        t('common:notifications.settingsSaveErrorTitle', { defaultValue: 'Error' }),
        t('common:notifications.settingsSaveErrorBody', { defaultValue: 'Unable to save settings.' }),
      );
    }
  };

  const handleDesktopToggle = async (value: boolean) => {
    const isSupported = permissionState !== 'unsupported';
    try {
      if (value) {
        if (!isSupported) {
          showError('Not supported', 'Desktop notifications are not available in this browser.');
          return;
        }
        const result = await optInDesktopNotifications();
        setPermissionState(result.permission);
        if (result.permission !== 'granted' || !result.subscribed) {
          showError('Permission blocked', 'Enable notifications in your browser settings to receive alerts.');
          return;
        }
      } else {
        await optOutDesktopNotifications();
      }
      await updateDesktopPushEnabled(value);
      showSuccess(
        t('common:notifications.settingsSavedTitle', { defaultValue: 'Settings saved' }),
        'Desktop notification preference updated.',
      );
    } catch {
      showError(
        t('common:notifications.settingsSaveErrorTitle', { defaultValue: 'Error' }),
        t('common:notifications.settingsSaveErrorBody', { defaultValue: 'Unable to save settings.' }),
      );
    }
  };

  if (isLoading) return <LoadingBlock className={className} />;
  if (error || !settings) throw new Error(error || 'Failed to load notification settings.');

  return (
    <div className={className}>
      {SECTIONS.map((section, i) => {
        const catSettings = getCategorySettings(settings, section.category);
        const emailAlwaysDisabled = section.events.every((e) => e.emailDisabled);
        return (
          <SettingSection key={section.title} first={i === 0} title={section.title} description={section.description}>
            <div
              className="grid items-center border-b border-rule pb-2"
              style={{ gridTemplateColumns: '1fr 70px 70px', gap: 14 }}
            >
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-dim">Event</span>
              <div className="flex flex-col items-center gap-1">
                <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-dim">Email</span>
                <button
                  type="button"
                  className={cn('toggle', catSettings.email && 'on', emailAlwaysDisabled && 'opacity-50 cursor-not-allowed')}
                  onClick={() => { if (!emailAlwaysDisabled) void save(section.category, 'email', !catSettings.email); }}
                  disabled={emailAlwaysDisabled}
                  aria-pressed={catSettings.email}
                  aria-label={`Email notifications for ${section.title}`}
                />
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-dim">Push</span>
                <button
                  type="button"
                  className={cn('toggle', catSettings.push && 'on')}
                  onClick={() => void save(section.category, 'push', !catSettings.push)}
                  aria-pressed={catSettings.push}
                  aria-label={`Push notifications for ${section.title}`}
                />
              </div>
            </div>
            {section.events.map((event, j) => (
              <NotifRow
                key={event.name}
                event={event}
                isLast={j === section.events.length - 1}
              />
            ))}
          </SettingSection>
        );
      })}

      <SettingSection title="Desktop" description="Allow Blawby to send OS-level browser alerts.">
        <SettingRow
          label="Desktop notifications"
          description="Requires browser permission. You can revoke access in browser settings at any time."
          controlClassName="min-w-[120px] justify-end"
        >
          <Switch
            value={settings.desktopPushEnabled}
            onChange={handleDesktopToggle}
            disabled={permissionState === 'unsupported'}
            className="py-0"
          />
        </SettingRow>
      </SettingSection>
    </div>
  );
};
