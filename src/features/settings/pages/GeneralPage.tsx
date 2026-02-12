import { useState, useEffect, useMemo, useCallback } from 'preact/hooks';
import { useTranslation } from '@/shared/i18n/hooks';
import { SectionDivider } from '@/shared/ui';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { DEFAULT_LOCALE, detectBestLocale, setLocale, SUPPORTED_LOCALES } from '@/shared/i18n/hooks';
import type { Language } from '@/shared/types/user';
import { SettingSelect } from '@/features/settings/components/SettingSelect';
import { SettingsPageLayout } from '@/features/settings/components/SettingsPageLayout';
import { getPreferencesCategory, preferencesApi } from '@/shared/lib/preferencesApi';
import type { GeneralPreferences } from '@/shared/types/preferences';
import { applyAccentColor, ACCENT_COLORS, type AccentColor } from '@/shared/utils/accentColors';

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
  const [settings, setSettings] = useState({
    theme: 'system' as 'light' | 'dark' | 'system',
    accentColor: 'grey' as AccentColor,
    language: 'auto-detect' as 'auto-detect' | Language,
    spokenLanguage: 'auto-detect' as 'auto-detect' | Language
  });
  const [isLoading, setIsLoading] = useState(true);

  // Load settings from preferences API
  useEffect(() => {
    let isMounted = true;

    // Helper function to validate language against supported options
    const getValidLanguage = (lang: string | undefined): 'auto-detect' | Language => {
      if (!lang || lang === 'auto-detect') return 'auto-detect';
      // Check if it's a supported language in our i18n layer
      return SUPPORTED_LOCALES.includes(lang as typeof SUPPORTED_LOCALES[number]) ? lang as Language : 'auto-detect';
    };
    
    const loadPreferences = async () => {
      try {
        setIsLoading(true);
        const prefs = await getPreferencesCategory<GeneralPreferences>('general');
        if (!isMounted) return;

        // Validate against known accent colors
        const savedAccentColor = (prefs?.accent_color && prefs.accent_color in ACCENT_COLORS) 
          ? (prefs.accent_color as AccentColor) 
          : 'grey';
        
        setSettings({
          theme: (prefs?.theme as 'light' | 'dark' | 'system') || 'system',
          accentColor: savedAccentColor,
          language: getValidLanguage(prefs?.language),
          spokenLanguage: getValidLanguage(prefs?.spoken_language)
        });

        // Apply the saved accent color
        applyAccentColor(savedAccentColor);

        const validatedLanguage = getValidLanguage(prefs?.language);
        if (validatedLanguage !== 'auto-detect') {
          void setLocale(validatedLanguage);
        }
      } catch (error) {
        console.error('Failed to load general preferences:', error);
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
      const updatePayload: GeneralPreferences = {};
      if (key === 'theme') {
        updatePayload.theme = value as GeneralPreferences['theme'];
      } else if (key === 'accentColor') {
        updatePayload.accent_color = value as string;
        // Apply the accent color immediately
        applyAccentColor(value as AccentColor);
      } else if (key === 'language') {
        updatePayload.language = value as string;
      } else if (key === 'spokenLanguage') {
        updatePayload.spoken_language = value as string;
      }

      await preferencesApi.updateGeneral(updatePayload);
      
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
        
        // Reapply accent color to update gradients for new theme
        applyAccentColor(settings.accentColor);
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
        t('common:notifications.settingsSaveErrorTitle'),
        t('common:notifications.settingsSaveErrorBody')
      );
      
      // Revert the local state on error
      setSettings(prev => ({ ...prev, [key]: previousValue }));
      
      // Revert accent color if it failed
      if (key === 'accentColor') {
        applyAccentColor(previousValue as AccentColor);
      }
    }
  };

  // Show loading state while session is loading
  if (isLoading) {
    return (
      <div className={`h-full flex items-center justify-center ${className}`}>
        <div className="w-8 h-8 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Use same layout for both mobile and desktop
  return (
    <SettingsPageLayout title={t('settings:general.title')} className={className}>
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
          { value: 'grey', label: t('settings:general.accent.options.grey') },
          { value: 'gold', label: t('settings:general.accent.options.gold') },
          { value: 'blue', label: t('settings:general.accent.options.blue') },
          { value: 'green', label: t('settings:general.accent.options.green') },
          { value: 'yellow', label: t('settings:general.accent.options.yellow') },
          { value: 'pink', label: t('settings:general.accent.options.pink') },
          { value: 'orange', label: t('settings:general.accent.options.orange') },
          { value: 'purple', label: t('settings:general.accent.options.purple') }
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
    </SettingsPageLayout>
  );
};
