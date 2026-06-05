import { useState, useEffect, useMemo, useCallback } from 'preact/hooks';
import { useTranslation } from '@/shared/i18n/hooks';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { DEFAULT_LOCALE, detectBestLocale, setLocale, SUPPORTED_LOCALES } from '@/shared/i18n/hooks';
import type { Language } from '@/shared/types/user';
import { SettingSelect } from '@/features/settings/components/SettingSelect';
import { SettingSection } from '@/features/settings/components/SettingSection';
import { SettingRow } from '@/features/settings/components/SettingRow';
import { Switch } from '@/shared/ui/input/Switch';
import { LoadingBlock } from '@/shared/ui/layout/LoadingBlock';
import { SettingsCard } from '@/features/settings/components/SettingsCard';
import { getPreferencesCategory, preferencesApi } from '@/shared/lib/preferencesApi';
import type { GeneralPreferences } from '@/shared/types/preferences';
import { cn } from '@/shared/utils/cn';

// ---------------------------------------------------------------------------
// Theme card — uses app's .card CSS class + design-token border + shadow
// ---------------------------------------------------------------------------

interface ThemeCardProps {
  id: 'light' | 'dark' | 'system';
  label: string;
  selected: boolean;
  onSelect: () => void;
}

const THEME_PREVIEWS: Record<ThemeCardProps['id'], { bg: string; sidebar: string; bars: string[]; lines: string[] }> = {
  light: {
    bg: '#f0eadb',
    sidebar: '#e2dabf',
    bars: ['#cdc9b8', '#cdc9b8', '#0a1a30', '#cdc9b8'],
    lines: ['#0a1a30', '#cdc9b8', '#cdc9b8'],
  },
  dark: {
    bg: '#050c1c',
    sidebar: '#0c142a',
    bars: ['#15203b', '#15203b', '#ede7d3', '#15203b'],
    lines: ['#ede7d3', '#15203b', '#15203b'],
  },
  system: {
    bg: 'linear-gradient(135deg, #f0eadb 50%, #050c1c 50%)',
    sidebar: 'linear-gradient(135deg, #e2dabf 50%, #0c142a 50%)',
    bars: ['#cdc9b8', '#15203b', '#0a1a30', '#ede7d3'],
    lines: ['#0a1a30', '#15203b', '#ede7d3'],
  },
};

const ThemeCard = ({ id, label, selected, onSelect }: ThemeCardProps) => {
  const p = THEME_PREVIEWS[id];
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn('card card-hover text-left p-0 overflow-hidden', selected ? 'border-ink' : '')}
      style={{ borderWidth: 2 }}
    >
      {/* Mini preview */}
      <div className="grid overflow-hidden" style={{ height: 80, gridTemplateColumns: '28% 1fr', background: p.bg }}>
        <div className="p-1.5 flex flex-col gap-1" style={{ background: p.sidebar, borderRight: '1px solid rgba(0,0,0,0.08)' }}>
          {p.bars.map((color, i) => (
            <div key={i} className="rounded-sm" style={{ height: 3, background: color, width: i === 2 ? '90%' : i === 1 ? '60%' : i === 3 ? '70%' : '80%' }} />
          ))}
        </div>
        <div className="p-2 flex flex-col gap-1">
          {p.lines.map((color, i) => (
            <div key={i} className="rounded-sm" style={{ height: 3, background: color, width: i === 0 ? '60%' : i === 2 ? '75%' : '90%' }} />
          ))}
        </div>
      </div>
      {/* Label */}
      <div className="flex items-center justify-between px-3 py-2.5">
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{label}</span>
        <span style={{
          width: 16, height: 16, borderRadius: '50%',
          border: `2px solid ${selected ? 'var(--ink)' : 'var(--rule)'}`,
          background: selected ? 'var(--ink)' : 'transparent',
          display: 'grid', placeItems: 'center',
          fontSize: 10, color: 'var(--accent)',
        }}>
          {selected ? '✓' : null}
        </span>
      </div>
    </button>
  );
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const SIDEBAR_STATE_KEY = 'blawby:settings:sidebar-default';
const SHOW_BADGES_KEY = 'blawby:settings:show-badges';

export const GeneralPage = () => {
  const { showSuccess, showError } = useToastContext();
  const { t } = useTranslation(['settings', 'common']);

  const [isLoading, setIsLoading] = useState(true);
  const [theme, setThemeState] = useState<'light' | 'dark' | 'system'>('system');
  const [language, setLanguage] = useState<'auto-detect' | Language>('auto-detect');
  const [spokenLanguage, setSpokenLanguage] = useState<'auto-detect' | Language>('auto-detect');
  const [dateFormat, setDateFormatState] = useState('MMM D, YYYY');
  const [timeFormat, setTimeFormatState] = useState<'12h' | '24h'>('12h');
  const [timezone, setTimezoneState] = useState('America/New_York');
  const [sidebarDefault, setSidebarDefaultState] = useState('expanded');
  const [showBadges, setShowBadgesState] = useState(true);

  const applyThemePreference = useCallback((value: 'light' | 'dark' | 'system') => {
    if (value === 'dark') {
      document.documentElement.setAttribute('data-theme', 'midnight');
      localStorage.setItem('theme', 'dark');
      return;
    }
    if (value === 'light') {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('theme', 'light');
      return;
    }
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.setAttribute('data-theme', 'midnight');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    localStorage.removeItem('theme');
  }, []);

  useEffect(() => {
    let mounted = true;
    const getValidLanguage = (lang: string | undefined): 'auto-detect' | Language => {
      if (!lang || lang === 'auto-detect') return 'auto-detect';
      return SUPPORTED_LOCALES.includes(lang as typeof SUPPORTED_LOCALES[number]) ? lang as Language : 'auto-detect';
    };
    const load = async () => {
      try {
        const prefs = await getPreferencesCategory<GeneralPreferences>('general');
        if (!mounted) return;
        const nextTheme = (prefs?.theme as 'light' | 'dark' | 'system') || 'system';
        setThemeState(nextTheme);
        applyThemePreference(nextTheme);
        setLanguage(getValidLanguage(prefs?.language));
        setSpokenLanguage(getValidLanguage(prefs?.spoken_language));
        setDateFormatState(prefs?.date_format || 'MMM D, YYYY');
        setTimeFormatState(prefs?.time_format || '12h');
        setTimezoneState(prefs?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York');
        const validatedLanguage = getValidLanguage(prefs?.language);
        if (validatedLanguage !== 'auto-detect') void setLocale(validatedLanguage);
      } catch { /* keep defaults */ }
      finally { if (mounted) setIsLoading(false); }
    };
    try {
      const s = localStorage.getItem(SIDEBAR_STATE_KEY); if (s) setSidebarDefaultState(s);
      const b = localStorage.getItem(SHOW_BADGES_KEY); if (b !== null) setShowBadgesState(b !== 'false');
    } catch { /* ignore */ }
    void load();
    return () => { mounted = false; };
  }, [applyThemePreference]);

  const languageOptions = useMemo(() => ([
    { value: 'auto-detect', label: t('common:language.auto') },
    ...SUPPORTED_LOCALES.map(locale => ({ value: locale, label: t(`common:language.${locale}`) })),
  ]), [t]);

  const handleLocaleChange = useCallback(async (value: string) => {
    try {
      if (value === 'auto-detect') await setLocale(detectBestLocale());
      else {
        const isSupported = SUPPORTED_LOCALES.includes(value as typeof SUPPORTED_LOCALES[number]);
        await setLocale(isSupported ? value : DEFAULT_LOCALE);
      }
      showSuccess(t('settings:general.language.toastTitle'), t('settings:general.language.toastBody'));
    } catch { /* ignore */ }
  }, [showSuccess, t]);

  const save = async (patch: GeneralPreferences) => {
    try {
      await preferencesApi.updateGeneral(patch);
      showSuccess(t('common:notifications.settingsSavedTitle'), t('common:notifications.settingsSavedBody'));
    } catch {
      showError(t('common:notifications.settingsSaveErrorTitle'), t('common:notifications.settingsSaveErrorBody'));
    }
  };

  const handleTheme = (value: 'light' | 'dark' | 'system') => {
    setThemeState(value);
    applyThemePreference(value);
    void save({ theme: value });
  };

  const timezoneOptions = useMemo(() => {
    const options = [
      { value: 'America/New_York', label: 'America/New_York (EST/EDT)' },
      { value: 'America/Chicago', label: 'America/Chicago (CST/CDT)' },
      { value: 'America/Denver', label: 'America/Denver (MST/MDT)' },
      { value: 'America/Los_Angeles', label: 'America/Los_Angeles (PST/PDT)' },
      { value: 'America/Anchorage', label: 'America/Anchorage (AKST/AKDT)' },
      { value: 'Pacific/Honolulu', label: 'Pacific/Honolulu (HST)' },
      { value: 'Europe/London', label: 'Europe/London (GMT/BST)' },
      { value: 'Europe/Paris', label: 'Europe/Paris (CET/CEST)' },
      { value: 'Asia/Tokyo', label: 'Asia/Tokyo (JST)' },
      { value: 'Australia/Sydney', label: 'Australia/Sydney (AEST/AEDT)' },
      { value: 'UTC', label: 'UTC' },
    ];
    if (timezone && !options.some((option) => option.value === timezone)) {
      options.push({ value: timezone, label: timezone });
    }
    return options;
  }, [timezone]);

  if (isLoading) return <LoadingBlock />;

  return (
    <div>
      {/* Theme */}
      <SettingSection first title="Theme" description="Choose a color scheme. All themes maintain WCAG AA contrast for readability.">
        <SettingsCard className="max-w-[820px]">
        <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {(['light', 'dark', 'system'] as const).map((id) => (
            <ThemeCard key={id} id={id} label={id.charAt(0).toUpperCase() + id.slice(1)} selected={theme === id} onSelect={() => handleTheme(id)} />
          ))}
        </div>
        </SettingsCard>
      </SettingSection>

      {/* Sidebar */}
      <SettingSection title="Sidebar" description="Control sidebar behavior in the main app.">
        <SettingsCard className="max-w-[820px]">
          <SettingRow label="Default sidebar state" description="Whether the sidebar is expanded or collapsed when you open Blawby.">
            <select className="select" value={sidebarDefault} style={{ width: 160 }}
              onChange={(e) => { setSidebarDefaultState((e.target as HTMLSelectElement).value); try { localStorage.setItem(SIDEBAR_STATE_KEY, (e.target as HTMLSelectElement).value); } catch { /* ignore */ } }}>
              <option value="expanded">Expanded</option>
              <option value="collapsed">Collapsed</option>
              <option value="remember">Remember last</option>
            </select>
          </SettingRow>
          <SettingRow label="Show matter count badges" description="Display count badges next to navigation items.">
            <Switch value={showBadges} onChange={(v) => { setShowBadgesState(v); try { localStorage.setItem(SHOW_BADGES_KEY, String(v)); } catch { /* ignore */ } }} />
          </SettingRow>
        </SettingsCard>
      </SettingSection>

      {/* Date & time */}
      <SettingSection title="Date &amp; time" description="How dates and times are displayed throughout the app.">
        <SettingsCard className="max-w-[820px]">
          <SettingRow label="Date format" description="Used in tables, invoices, and the calendar.">
            <select className="select" value={dateFormat} style={{ width: 180 }}
              onChange={(e) => { setDateFormatState((e.target as HTMLSelectElement).value); void save({ date_format: (e.target as HTMLSelectElement).value }); }}>
              <option value="MMM D, YYYY">MMM D, YYYY</option>
              <option value="MM/DD/YYYY">MM/DD/YYYY</option>
              <option value="DD/MM/YYYY">DD/MM/YYYY</option>
              <option value="YYYY-MM-DD">YYYY-MM-DD</option>
            </select>
          </SettingRow>
          <SettingRow label="Time format">
            <select className="select" value={timeFormat} style={{ width: 140 }}
              onChange={(e) => { setTimeFormatState((e.target as HTMLSelectElement).value as '12h' | '24h'); void save({ time_format: (e.target as HTMLSelectElement).value as '12h' | '24h' }); }}>
              <option value="12h">12-hour</option>
              <option value="24h">24-hour</option>
            </select>
          </SettingRow>
          <SettingRow label="Timezone">
            <select className="select" value={timezone} style={{ width: 220 }}
              onChange={(e) => { setTimezoneState((e.target as HTMLSelectElement).value); void save({ timezone: (e.target as HTMLSelectElement).value }); }}>
              {timezoneOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </SettingRow>
        </SettingsCard>
      </SettingSection>

      {/* Language */}
      <SettingSection title="Language" description="Interface language and voice transcription language.">
        <SettingsCard className="max-w-[820px]">
          <SettingSelect
            label={t('settings:general.language.label')}
            description={t('settings:general.language.description')}
            value={language}
            options={languageOptions}
            onChange={(value) => { setLanguage(value as 'auto-detect' | Language); void preferencesApi.updateGeneral({ language: value }); void handleLocaleChange(value); }}
          />
          <SettingSelect
            label={t('settings:general.spokenLanguage.label')}
            description={t('settings:general.spokenLanguage.description')}
            value={spokenLanguage}
            options={languageOptions}
            onChange={(value) => { setSpokenLanguage(value as 'auto-detect' | Language); void save({ spoken_language: value }); }}
          />
        </SettingsCard>
      </SettingSection>
    </div>
  );
};
