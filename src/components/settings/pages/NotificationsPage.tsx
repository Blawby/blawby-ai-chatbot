import { useState, useEffect } from 'preact/hooks';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, SectionDivider } from '../../ui';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { useToastContext } from '../../../contexts/ToastContext';
import { useSession } from '../../../contexts/AuthContext';
import { updateUser } from '../../../lib/authClient';
import { useTranslation } from '@/i18n/hooks';
import { getNotificationDisplayText, NOTIFICATION_DEFAULTS } from '../../ui/validation/defaultValues';
import type { NotificationSettings } from '../../../types/user';

export interface NotificationsPageProps {
  className?: string;
}

export const NotificationsPage = ({
  className = ''
}: NotificationsPageProps) => {
  const { showSuccess, showError } = useToastContext();
  const { data: session, isPending } = useSession();
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const { t } = useTranslation(['settings', 'common']);
  

  // Load settings from Better Auth session
  useEffect(() => {
    if (!session?.user) return;
    
    const user = session.user;
    
    // Convert user data to notification settings format
    const notificationSettings: NotificationSettings = {
      responses: {
        push: user.notificationResponsesPush ?? true
      },
      tasks: {
        push: user.notificationTasksPush ?? true,
        email: user.notificationTasksEmail ?? true
      },
      messaging: {
        push: user.notificationMessagingPush ?? true
      }
    };
    
    setSettings(notificationSettings);
  }, [session?.user]);

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
      const updateData: Record<string, boolean> = {};
      
      if (section === 'responses' && toggleKey === 'push') {
        updateData.notificationResponsesPush = value;
      } else if (section === 'tasks') {
        if (toggleKey === 'push') {
          updateData.notificationTasksPush = value;
        } else if (toggleKey === 'email') {
          updateData.notificationTasksEmail = value;
        }
      } else if (section === 'messaging' && toggleKey === 'push') {
        updateData.notificationMessagingPush = value;
      }
      
      // Update user in database
      await updateUser(updateData);
      
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

  // Show loading state while session is loading
  if (isPending) {
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
      {/* Header */}
      <div className="px-6 py-4">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {t('settings:notifications.title')}
        </h1>
        <div className="border-t border-gray-200 dark:border-dark-border mt-4" />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6">
        <div className="space-y-0">
          {/* Responses Section */}
          <div className="flex items-center justify-between py-2">
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {t('settings:notifications.sections.responses.title')}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {t('settings:notifications.sections.responses.description')}
              </p>
            </div>
            <div className="ml-4">
              <DropdownMenu>
                <DropdownMenuTrigger>
                  <span>{getDisplayText('responses')}</span>
                  <ChevronDownIcon className="w-4 h-4 text-gray-400" />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuCheckboxItem
                    checked={settings.responses.push}
                    onCheckedChange={(value) => handleToggleChange('responses', 'push', value)}
                  >
                    {t('settings:notifications.channels.push')}
                  </DropdownMenuCheckboxItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="border-t border-gray-200 dark:border-dark-border" />

          {/* Tasks Section */}
          <div className="flex items-center justify-between py-2">
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {t('settings:notifications.sections.tasks.title')}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {t('settings:notifications.sections.tasks.description')}
              </p>
              <button 
                onClick={() => {/* TODO: Implement task management navigation */}}
                className="text-xs mt-1 text-left"
              >
                {t('settings:notifications.sections.tasks.manage')}
              </button>
            </div>
            <div className="ml-4">
              <DropdownMenu>
                <DropdownMenuTrigger>
                  <span>{getDisplayText('tasks')}</span>
                  <ChevronDownIcon className="w-4 h-4 text-gray-400" />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuCheckboxItem
                    checked={settings.tasks.push}
                    onCheckedChange={(value) => handleToggleChange('tasks', 'push', value)}
                  >
                    {t('settings:notifications.channels.push')}
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={settings.tasks.email}
                    onCheckedChange={(value) => handleToggleChange('tasks', 'email', value)}
                  >
                    {t('settings:notifications.channels.email')}
                  </DropdownMenuCheckboxItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="border-t border-gray-200 dark:border-dark-border" />

          {/* Messaging Section */}
          <div className="flex items-center justify-between py-2">
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {t('settings:notifications.sections.messaging.title')}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {t('settings:notifications.sections.messaging.description')}
              </p>
            </div>
            <div className="ml-4">
              <DropdownMenu>
                <DropdownMenuTrigger>
                  <span>{getDisplayText('messaging')}</span>
                  <ChevronDownIcon className="w-4 h-4 text-gray-400" />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuCheckboxItem
                    checked={settings.messaging.push}
                    onCheckedChange={(value) => handleToggleChange('messaging', 'push', value)}
                  >
                    {t('settings:notifications.channels.push')}
                  </DropdownMenuCheckboxItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
