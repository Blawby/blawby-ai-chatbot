import { useState, useEffect, useMemo, useCallback } from 'preact/hooks';
import { useTranslation } from '@/shared/i18n/hooks';
import { SectionDivider } from '@/shared/ui';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useSession, updateUser } from '@/shared/lib/authClient';
import { DEFAULT_LOCALE, detectBestLocale, setLocale, SUPPORTED_LOCALES } from '@/shared/i18n/hooks';
import type { Language } from '@/shared/types/user';
import { SettingHeader } from '@/features/settings/components/SettingHeader';
import { SettingSelect } from '@/features/settings/components/SettingSelect';

export interface GeneralPageProps {
  isMobile?: boolean;
  onClose?: () => void;
  className?: string;
}

export const GeneralPage = ({
  isMobile: _isMobile = false,
  onClose: _onClose,
  className = ''
}: GeneralPageProps) => {
  const { showSuccess, showError } = useToastContext();
  const { t } = useTranslation(['settings', 'common']);
  const { data: session, isPending } = useSession();
  const [settings, setSettings] = useState({
    theme: 'system' as 'light' | 'dark' | 'system',
    accentColor: 'default' as 'default' | 'blue' | 'green' | 'purple' | 'red',
    language: 'auto-detect' as 'auto-detect' | Language,
    spokenLanguage: 'auto-detect' as 'auto-detect' | Language
  });

  // Load settings from Better Auth session
  useEffect(() => {
    if (!session?.user) return;
    
    const user = session.user;
    
    // Helper function to validate language against supported options
    const getValidLanguage = (lang: string | undefined): 'auto-detect' | Language => {
      if (!lang || lang === 'auto-detect') return 'auto-detect';
      // Check if it's a supported language in our i18n layer
      return SUPPORTED_LOCALES.includes(lang as typeof SUPPORTED_LOCALES[number]) ? lang as Language : 'auto-detect';
    };
    
    // Defensive checks with sensible fallbacks
    setSettings({
      theme: ((user as { theme?: string }).theme as 'light' | 'dark' | 'system') || 'system',
      accentColor: ((user as { accentColor?: string }).accentColor as 'default' | 'blue' | 'green' | 'purple' | 'red') || 'default',
      language: getValidLanguage((user as { language?: string }).language),
      spokenLanguage: getValidLanguage((user as { spokenLanguage?: string }).spokenLanguage)
    });

    const preferredLanguage = (user as { language?: string }).language;
    if (preferredLanguage && preferredLanguage !== 'auto-detect') {
      void setLocale(preferredLanguage);
    }
  }, [session?.user]);
  const languageOptions = useMemo(() => ([
    { value: 'auto-detect', label: t('common:language.auto') },
    ...SUPPORTED_LOCALES.map(locale => ({
      value: locale,
      label: t(`common:language.${locale}`)
    }))
  ]), [t]);

  const handleLocaleChange = useCallback(async (value: string) => {
    try {
      if (value === 'auto-detect') {
        const detected = detectBestLocale();
        await setLocale(detected);
      } else {
        const isSupported = SUPPORTED_LOCALES.includes(value as typeof SUPPORTED_LOCALES[number]);
        await setLocale(isSupported ? value : DEFAULT_LOCALE);
      }

      showSuccess(
        t('settings:general.language.toastTitle'),
        t('settings:general.language.toastBody')
      );
    } catch (error) {
       
      console.error('Failed to apply locale change', error);
    }
  }, [showSuccess, t]);

  const handleSettingChange = async (key: string, value: string | boolean) => {
    const previousValue = settings[key as keyof typeof settings];
    
    setSettings(prev => {
      const newSettings = { ...prev, [key]: value };
      return newSettings;
    });
    
    try {
      // Update user in database
      await updateUser({ [key]: value });
      
      // Apply theme immediately if changed
      if (key === 'theme') {
        if (value === 'dark') {
          document.documentElement.classList.add('dark');
          localStorage.setItem('theme', 'dark');
        } else if (value === 'light') {
          document.documentElement.classList.remove('dark');
          localStorage.setItem('theme', 'light');
        } else {
          // System theme
          const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          if (prefersDark) {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
          localStorage.removeItem('theme');
        }
      }
      
      if (key === 'language') {
        void handleLocaleChange(value as string);
      }
      
      if (key !== 'language') {
        showSuccess(
          t('common:notifications.settingsSavedTitle'),
          t('common:notifications.settingsSavedBody')
        );
      }
    } catch (error) {
      console.error('Failed to update user settings:', error);
      showError(
        t('common:notifications.errorTitle'),
        t('common:notifications.settingsSaveError')
      );
      
      // Revert the local state on error
      setSettings(prev => ({ ...prev, [key]: previousValue }));
    }
  };

  // Show loading state while session is loading
  if (isPending) {
    return (
      <div className={`h-full flex items-center justify-center ${className}`}>
        <div className="w-8 h-8 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Use same layout for both mobile and desktop
  return (
    <div className={`h-full flex flex-col ${className}`}>
      <SettingHeader title={t('settings:general.title')} />

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6">
        <div className="space-y-0">
          <SettingSelect
            label={t('settings:general.theme.label')}
            value={settings.theme}
            options={[
              { value: 'light', label: t('settings:general.theme.options.light') },
              { value: 'dark', label: t('settings:general.theme.options.dark') },
              { value: 'system', label: t('settings:general.theme.options.system') }
            ]}
            onChange={(value) => handleSettingChange('theme', value)}
          />
          
          <SectionDivider />
          
          <SettingSelect
            label={t('settings:general.accent.label')}
            value={settings.accentColor}
            options={[
              { value: 'default', label: t('settings:general.accent.options.default') },
              { value: 'blue', label: t('settings:general.accent.options.blue') },
              { value: 'green', label: t('settings:general.accent.options.green') },
              { value: 'purple', label: t('settings:general.accent.options.purple') },
              { value: 'red', label: t('settings:general.accent.options.red') }
            ]}
            onChange={(value) => handleSettingChange('accentColor', value)}
          />
          
          <SectionDivider />
          
          <SettingSelect
            label={t('settings:general.language.label')}
            description={t('settings:general.language.description')}
            value={settings.language}
            options={languageOptions}
            onChange={(value) => handleSettingChange('language', value)}
          />
          
          <SectionDivider />
          
          <SettingSelect
            label={t('settings:general.spokenLanguage.label')}
            description={t('settings:general.spokenLanguage.description')}
            value={settings.spokenLanguage}
            options={[
              { value: 'auto-detect', label: t('common:language.auto') },
              ...SUPPORTED_LOCALES.map(locale => ({
                value: locale,
                label: t(`common:language.${locale}`)
              }))
            ]}
            onChange={(value) => handleSettingChange('spokenLanguage', value)}
          />
        </div>
      </div>
    </div>
  );
};
