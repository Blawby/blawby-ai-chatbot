import { useState, useEffect, useMemo } from 'preact/hooks';
import { SectionDivider } from '@/shared/ui';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useTranslation } from '@/shared/i18n/hooks';
import { getNotificationDisplayText } from '@/shared/ui/validation/defaultValues';
import type { NotificationSettings } from '@/shared/types/user';
import { SettingHeader } from '@/features/settings/components/SettingHeader';
import { SettingRow } from '@/features/settings/components/SettingRow';
import { NotificationChannelSelector } from '@/features/settings/components/NotificationChannelSelector';
import { getPreferencesCategory, updatePreferencesCategory } from '@/shared/lib/preferencesApi';
import type { NotificationPreferences } from '@/shared/types/preferences';

export interface NotificationsPageProps {
  className?: string;
}

export const NotificationsPage = ({
  className = ''
}: NotificationsPageProps) => {
  const { showSuccess, showError } = useToastContext();
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const { t } = useTranslation(['settings', 'common']);
  const [isLoading, setIsLoading] = useState(true);
  

  // Load settings from preferences API
  useEffect(() => {
    let isMounted = true;

    const loadPreferences = async () => {
      try {
        setIsLoading(true);
        const prefs = await getPreferencesCategory<NotificationPreferences>('notifications');
        if (!isMounted) return;
        const notificationSettings: NotificationSettings = {
          responses: {
            push: prefs?.responses_push ?? true
          },
          tasks: {
            push: prefs?.tasks_push ?? true,
            email: prefs?.tasks_email ?? true
          },
          messaging: {
            push: prefs?.messaging_push ?? true
          }
        };
        setSettings(notificationSettings);
      } catch (error) {
        console.error('Failed to load notification preferences:', error);
        setSettings(null);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadPreferences();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleToggleChange = async (section: string, toggleKey: string, value: boolean) => {
    if (!settings) return;
    
    // Create a new settings object to ensure React detects the change
    const updatedSettings = {
      ...settings,
      [section]: {
        ...settings[section as keyof NotificationSettings],
        [toggleKey]: value
      }
    };
    
    // Update local state
    setSettings(updatedSettings);
    
    try {
      // Map the nested structure to flat fields for Better Auth
      const updateData: Partial<NotificationPreferences> = {};
      
      if (section === 'responses' && toggleKey === 'push') {
        updateData.responses_push = value;
      } else if (section === 'tasks') {
        if (toggleKey === 'push') {
          updateData.tasks_push = value;
        } else if (toggleKey === 'email') {
          updateData.tasks_email = value;
        }
      } else if (section === 'messaging' && toggleKey === 'push') {
        updateData.messaging_push = value;
      }
      
      await updatePreferencesCategory('notifications', updateData);
      
      // Show success toast
      showSuccess(
        t('common:notifications.settingsSavedTitle'),
        t('settings:notifications.toastBody')
      );
    } catch (error) {
      console.error('Failed to update notification settings:', error);
      showError(
        t('common:notifications.errorTitle'),
        t('common:notifications.settingsSaveError')
      );
      
      // Revert the local state on error
      setSettings(settings);
    }
  };

  // Generate display text for dropdown triggers using atomic design defaults
  const getDisplayText = (section: keyof NotificationSettings) => {
    if (!settings) return '';
    
    const sectionSettings = settings[section];
    const translations = {
      push: t('settings:notifications.channels.push'),
      email: t('settings:notifications.channels.email'),
      none: t('settings:notifications.channels.none'),
    };
    
    return getNotificationDisplayText(sectionSettings, translations);
  };

  // Prepare channels for NotificationChannelSelector
  const responsesChannels = useMemo(() => {
    if (!settings) return [];
    return [
      {
        key: 'push',
        label: t('settings:notifications.channels.push'),
        checked: settings.responses.push
      }
    ];
  }, [settings, t]);

  const tasksChannels = useMemo(() => {
    if (!settings) return [];
    return [
      {
        key: 'push',
        label: t('settings:notifications.channels.push'),
        checked: settings.tasks.push
      },
      {
        key: 'email',
        label: t('settings:notifications.channels.email'),
        checked: settings.tasks.email
      }
    ];
  }, [settings, t]);

  const messagingChannels = useMemo(() => {
    if (!settings) return [];
    return [
      {
        key: 'push',
        label: t('settings:notifications.channels.push'),
        checked: settings.messaging.push
      }
    ];
  }, [settings, t]);

  // Show loading state while preferences are loading
  if (isLoading) {
    return (
      <div className={`h-full flex items-center justify-center ${className}`}>
        <div className="w-8 h-8 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!settings) {
    return (
      <div className={`h-full flex items-center justify-center ${className}`}>
        <p className="text-gray-500 dark:text-gray-400">{t('settings:notifications.loadError')}</p>
      </div>
    );
  }

  return (
    <div className={`h-full flex flex-col ${className}`}>
      <SettingHeader title={t('settings:notifications.title')} />

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6">
        <div className="space-y-0">
          {/* Responses Section */}
          <SettingRow
            label={t('settings:notifications.sections.responses.title')}
            description={t('settings:notifications.sections.responses.description')}
          >
            <NotificationChannelSelector
              displayText={getDisplayText('responses')}
              channels={responsesChannels}
              onChannelChange={(channelKey, checked) => handleToggleChange('responses', channelKey, checked)}
            />
          </SettingRow>

          <SectionDivider />

          {/* Tasks Section */}
          <SettingRow
            label={t('settings:notifications.sections.tasks.title')}
            description={
              <>
                {t('settings:notifications.sections.tasks.description')}
                <button 
                  onClick={() => {/* TODO: Implement task management navigation */}}
                  className="text-xs mt-1 text-left block"
                >
                  {t('settings:notifications.sections.tasks.manage')}
                </button>
              </>
            }
          >
            <NotificationChannelSelector
              displayText={getDisplayText('tasks')}
              channels={tasksChannels}
              onChannelChange={(channelKey, checked) => handleToggleChange('tasks', channelKey, checked)}
            />
          </SettingRow>

          <SectionDivider />

          {/* Messaging Section */}
          <SettingRow
            label={t('settings:notifications.sections.messaging.title')}
            description={t('settings:notifications.sections.messaging.description')}
          >
            <NotificationChannelSelector
              displayText={getDisplayText('messaging')}
              channels={messagingChannels}
              onChannelChange={(channelKey, checked) => handleToggleChange('messaging', channelKey, checked)}
            />
          </SettingRow>
        </div>
      </div>
    </div>
  );
};
