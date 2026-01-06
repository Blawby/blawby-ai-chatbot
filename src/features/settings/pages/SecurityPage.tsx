import { useState, useEffect } from 'preact/hooks';
import { Button } from '@/shared/ui/Button';
import { SectionDivider } from '@/shared/ui';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useNavigation } from '@/shared/utils/navigation';
import { useSession, authClient } from '@/shared/lib/authClient';
import Modal from '@/shared/components/Modal';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/shared/i18n/hooks';
import type { SecuritySettings } from '@/shared/types/user';
import { SettingHeader } from '@/features/settings/components/SettingHeader';
import { SettingSection } from '@/features/settings/components/SettingSection';
import { SettingToggle } from '@/features/settings/components/SettingToggle';
import { SettingRow } from '@/features/settings/components/SettingRow';
import { PasswordChangeForm } from '@/features/settings/components/PasswordChangeForm';
import { getPreferencesCategory, updatePreferencesCategory } from '@/shared/lib/preferencesApi';
import type { SecurityPreferences } from '@/shared/types/preferences';

// Local interface for user with security-related fields
interface SecurityUser {
  twoFactorEnabled?: boolean;
  emailNotifications?: boolean;
  loginAlerts?: boolean;
  lastPasswordChange?: Date | string | number;
}

// Runtime validation for lastPasswordChange values
const isValidDate = (value: unknown): value is Date | string | number => {
  if (value === null || value === undefined) {
    return false;
  }
  
  // If it's already a Date, check if it's valid
  if (value instanceof Date) {
    return !isNaN(value.getTime());
  }
  
  // Handle numbers explicitly by checking if they produce valid dates
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Number.isFinite(new Date(value).getTime());
  }
  
  // For strings, use Date.parse
  if (typeof value === 'string') {
    const timestamp = Date.parse(value);
    return isFinite(timestamp);
  }
  
  return false;
};

// Safely convert lastPasswordChange to Date or undefined
const safeConvertLastPasswordChange = (value: unknown): Date | undefined => {
  if (!isValidDate(value)) {
    return undefined;
  }
  
  const date = new Date(value as Date | string | number);
  // Double-check the resulting Date is valid
  return isNaN(date.getTime()) ? undefined : date;
};

export interface SecurityPageProps {
  isMobile?: boolean;
  onClose?: () => void;
  className?: string;
}

export const SecurityPage = ({
  isMobile: _isMobile = false,
  onClose: _onClose,
  className = ''
}: SecurityPageProps) => {
  const { showSuccess, showError } = useToastContext();
  const { navigate } = useNavigation();
  const { t } = useTranslation(['settings', 'common']);
  const { data: session, isPending } = useSession();
  const [settings, setSettings] = useState<SecuritySettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [showDisableMFAConfirm, setShowDisableMFAConfirm] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  // Load settings from preferences API
  useEffect(() => {
    let isMounted = true;

    const loadPreferences = async () => {
      try {
        setIsLoading(true);
        const prefs = await getPreferencesCategory<SecurityPreferences>('security');
        if (!isMounted) return;
        const securitySettings: SecuritySettings = {
          twoFactorEnabled: prefs?.two_factor_enabled ?? false,
          emailNotifications: prefs?.email_notifications ?? true,
          loginAlerts: prefs?.login_alerts ?? true,
          sessionTimeout: prefs?.session_timeout,
          lastPasswordChange: safeConvertLastPasswordChange((session?.user as SecurityUser | undefined)?.lastPasswordChange) ?? null,
          connectedAccounts: [] // This would need to be populated from accounts table if needed
        };
        setSettings(securitySettings);
      } catch (error) {
        console.error('Failed to load security preferences:', error);
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
  }, [session?.user]);

  // Refresh settings when component regains focus (e.g., returning from MFA enrollment)
  useEffect(() => {
    const handleFocus = () => {
      // Settings will be refreshed automatically when session updates
      // No need to manually reload since we're using reactive session data
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  const handleToggleChange = async (key: string, value: boolean) => {
    if (!settings) return;
    
    if (key === 'twoFactorEnabled') {
      if (value) {
        // Enable MFA: Navigate to enrollment page without updating state
        navigate('/settings/mfa-enrollment');
      } else {
        // Disable MFA: Show confirmation dialog
        setShowDisableMFAConfirm(true);
      }
    } else {
      // Handle other toggles normally
      const updatedSettings = { ...settings, [key]: value };
      setSettings(updatedSettings);
      
      try {
      const updateData: Partial<SecurityPreferences> = {};
      if (key === 'emailNotifications') {
        updateData.email_notifications = value;
      } else if (key === 'loginAlerts') {
        updateData.login_alerts = value;
      }
        await updatePreferencesCategory('security', updateData);
        
        showSuccess(
          t('common:notifications.settingsSavedTitle'),
          t('settings:security.toasts.settingsUpdated')
        );
      } catch (error) {
        console.error('Failed to update security settings:', error);
        showError(
          t('common:notifications.errorTitle'),
          t('common:notifications.settingsSaveError')
        );
        
        // Revert the local state on error
        setSettings(settings);
      }
    }
  };

  const handleConfirmDisableMFA = async () => {
    if (!settings) return;
    
    // Check if user session is authenticated
    if (!session?.user) {
      showError(
        t('common:notifications.errorTitle'),
        t('common:notifications.sessionExpired')
      );
      setShowDisableMFAConfirm(false);
      return;
    }
    
    const updatedSettings = { ...settings, twoFactorEnabled: false };
    setSettings(updatedSettings);
    
    try {
      // Disable MFA using Better Auth twoFactor plugin (if available)
      const twoFactorClient = (authClient as { twoFactor?: { disable: () => Promise<void> } }).twoFactor;
      if (twoFactorClient) {
        await twoFactorClient.disable();
      } else {
        throw new Error('Two-factor authentication is not available');
      }
      
      await updatePreferencesCategory('security', { two_factor_enabled: false });
      
      showSuccess(
        t('settings:security.mfa.disable.toastTitle'),
        t('settings:security.mfa.disable.toastBody')
      );
    } catch (error) {
      console.error('Failed to disable MFA:', error);
      showError(
        t('common:notifications.errorTitle'),
        t('common:notifications.settingsSaveError')
      );
      
      // Revert the local state on error
      setSettings(settings);
    }
    
    setShowDisableMFAConfirm(false);
  };

  const handleCancelDisableMFA = () => {
    setShowDisableMFAConfirm(false);
  };

  const handlePasswordChange = (field: string, value: string) => {
    setPasswordForm(prev => ({ ...prev, [field]: value }));
  };

  const handleChangePassword = async () => {
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      showError(
        t('settings:security.password.errors.missing.title'),
        t('settings:security.password.errors.missing.body')
      );
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      showError(
        t('settings:security.password.errors.mismatch.title'),
        t('settings:security.password.errors.mismatch.body')
      );
      return;
    }

    if (passwordForm.newPassword.length < 8) {
      showError(
        t('settings:security.password.errors.weak.title'),
        t('settings:security.password.errors.weak.body')
      );
      return;
    }

    try {
      // Here you would call your API to change the password
      // await authService.changePassword(passwordForm.currentPassword, passwordForm.newPassword);
      
      showSuccess(
        t('settings:security.password.success.title'),
        t('settings:security.password.success.body')
      );
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setIsChangingPassword(false);
    } catch (error) {
      showError(
        t('settings:security.password.errors.failed.title'),
        error instanceof Error ? error.message : t('settings:security.password.errors.failed.body')
      );
    }
  };

  const handleResetPassword = () => {
    // Here you would trigger a password reset email
    showSuccess(
      t('settings:security.password.reset.title'),
      t('settings:security.password.reset.body')
    );
  };

  const handleLogout = (type: 'current' | 'all') => {
    if (type === 'current') {
      showSuccess(
        t('settings:security.logout.current.toastTitle'),
        t('settings:security.logout.current.toastBody')
      );
    } else {
      showSuccess(
        t('settings:security.logout.all.toastTitle'),
        t('settings:security.logout.all.toastBody')
      );
    }
  };

  // Show loading state while session or preferences are loading
  if (isPending || isLoading) {
    return (
      <div className={`h-full flex items-center justify-center ${className}`}>
        <div className="w-8 h-8 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }


  if (!settings) {
    return (
      <div className={`h-full flex items-center justify-center ${className}`}>
        <p className="text-gray-500 dark:text-gray-400">{t('settings:security.fallback')}</p>
      </div>
    );
  }

  return (
    <div className={`h-full flex flex-col ${className}`}>
      <SettingHeader title={t('settings:security.title')} />

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6">
        <div className="space-y-0">
          {/* Password Section */}
          <SettingSection
            title={t('settings:security.password.sectionTitle')}
            description={t('settings:security.password.description')}
          >
            <div className="flex items-center justify-end gap-2 mb-4">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsChangingPassword(!isChangingPassword)}
              >
                {isChangingPassword ? t('settings:security.password.cancelButton') : t('settings:security.password.changeButton')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetPassword}
                className="text-accent-600 dark:text-accent-400 hover:text-accent-700 dark:hover:text-accent-300"
              >
                {t('settings:security.password.resetButton')}
              </Button>
            </div>

            <PasswordChangeForm
              currentPassword={passwordForm.currentPassword}
              newPassword={passwordForm.newPassword}
              confirmPassword={passwordForm.confirmPassword}
              onCurrentPasswordChange={(value) => handlePasswordChange('currentPassword', value)}
              onNewPasswordChange={(value) => handlePasswordChange('newPassword', value)}
              onConfirmPasswordChange={(value) => handlePasswordChange('confirmPassword', value)}
              onSubmit={handleChangePassword}
              onCancel={() => {
                setIsChangingPassword(false);
                setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
              }}
              isOpen={isChangingPassword}
            />
          </SettingSection>

          <SectionDivider />

          {/* Multi-factor authentication Section */}
          <SettingToggle
            label={t('settings:security.mfa.title')}
            description={t('settings:security.mfa.description')}
            value={settings.twoFactorEnabled}
            onChange={(value) => handleToggleChange('twoFactorEnabled', value)}
            id="mfa-toggle"
          />

          <SectionDivider />

          {/* Trusted Devices Section */}
          <SettingRow
            label={t('settings:security.trustedDevices.title')}
            description={t('settings:security.trustedDevices.description')}
          >
            <span
              className="text-xs text-gray-500 dark:text-gray-400"
              aria-label={t('settings:security.trustedDevices.comingSoonAria', { defaultValue: 'Trusted devices management is coming soon' })}
            >
              {t('settings:security.trustedDevices.comingSoon', { defaultValue: 'Coming soon' })}
            </span>
          </SettingRow>

          <SectionDivider />

          {/* Log out of this device Section */}
          <SettingRow
            label={t('settings:security.logout.current.title')}
          >
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleLogout('current')}
            >
              {t('settings:security.logout.current.button')}
            </Button>
          </SettingRow>

          <SectionDivider />

          {/* Log out of all devices Section */}
          <SettingRow
            label={t('settings:security.logout.all.title')}
            description={t('settings:security.logout.all.description')}
          >
            <Button
              variant="primary"
              size="sm"
              onClick={() => handleLogout('all')}
              className="bg-red-600 hover:bg-red-700 text-white border-red-600 hover:border-red-700 focus:ring-red-500"
            >
              {t('settings:security.logout.all.button')}
            </Button>
          </SettingRow>
        </div>
      </div>

      {/* MFA Disable Confirmation Modal */}
      <Modal
        isOpen={showDisableMFAConfirm}
        onClose={handleCancelDisableMFA}
        title={t('settings:security.mfa.disable.modalTitle')}
        showCloseButton={true}
        type="modal"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <ExclamationTriangleIcon className="w-6 h-6 text-orange-500" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                {t('settings:security.mfa.disable.heading')}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t('settings:security.mfa.disable.description')}
              </p>
            </div>
          </div>
          
          <div className="flex gap-3 justify-end pt-4">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCancelDisableMFA}
              className="min-w-[80px]"
            >
              {t('settings:security.mfa.disable.cancel')}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleConfirmDisableMFA}
              className="bg-orange-600 hover:bg-orange-700 text-white border-orange-600 hover:border-orange-700 focus:ring-orange-500 min-w-[80px]"
            >
              {t('settings:security.mfa.disable.confirm')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
