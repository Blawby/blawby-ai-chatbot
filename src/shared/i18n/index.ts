import i18next from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

import commonEn from '../../locales/en/common.json';
import settingsEn from '../../locales/en/settings.json';
import authEn from '../../locales/en/auth.json';
import profileEn from '../../locales/en/profile.json';
import pricingEn from '../../locales/en/pricing.json';
import practiceEn from '../../locales/en/practice.json';

export const DEFAULT_LOCALE = 'en' as const;

// Locales fully exposed in the UI (100% translated)
export const SUPPORTED_LOCALES = [
  'en',  // English - 100%
  'pt',  // Português - 100%
  'ar',  // العربية - 100%
  'es',  // Español - 100%
  'ja',  // 日本語 - 100%
  'zh',  // 中文 - 100%
  'vi',  // Tiếng Việt - 100%
  'de',  // Deutsch - 100%
  'fr',  // Français - 100%
] as const;

// All locales we can load (may be incomplete; hidden from UI if not 100%)
export const AVAILABLE_LOCALES = [
  'en','pt','ar','es','ja','zh','vi','de','fr',
  'hi','uk','id','th','ko','pl','it','ru','tr','nl'
] as const;

export type AnyLocale = typeof AVAILABLE_LOCALES[number];

// Languages with incomplete translations (<100%) - files exist but not shown in selector:
// 'hi'  - हिन्दी - 60.3% (203 keys remaining)
// 'uk'  - Українська - 60.3% (203 keys remaining)
// 'id'  - Bahasa Indonesia - 60.3% (203 keys remaining)
// 'th'  - ไทย - 38.9% (312 keys remaining)
// 'ko'  - 한국어 - 24.9% (384 keys remaining)
// 'pl'  - Polski - 24.9% (384 keys remaining)
// 'it'  - Italiano - 24.9% (384 keys remaining)
// 'ru'  - Русский - 24.9% (384 keys remaining)
// 'tr'  - Türkçe - 2.3% (499 keys remaining)
// 'nl'  - Nederlands - 24.9% (384 keys remaining) - moved to incomplete due to excessive placeholders

export type AppLocale = typeof SUPPORTED_LOCALES[number];

// RTL (Right-to-Left) languages
export const RTL_LOCALES: ReadonlySet<AppLocale> = new Set(['ar'] as const);

/**
 * Check if a locale uses RTL (Right-to-Left) text direction
 */
export const isRTLLocale = (locale: AnyLocale): boolean => {
  const normalized = locale.toLowerCase().split('-')[0];
  return RTL_LOCALES.has(normalized as AppLocale);
};

const NAMESPACES = ['common', 'settings', 'auth', 'profile', 'pricing', 'practice'] as const;

// Type for locale resource bundles
type LocaleResourceBundle = Record<string, string>;

// Type for locale index modules
type LocaleIndexModule = {
  common: LocaleResourceBundle;
  settings: LocaleResourceBundle;
  auth: LocaleResourceBundle;
  profile: LocaleResourceBundle;
  pricing: LocaleResourceBundle;
  practice: LocaleResourceBundle;
};

// Create typed loader maps for Vite static analysis
const localeIndexLoaders = import.meta.glob('../../locales/*/index.ts') as Record<string, () => Promise<LocaleIndexModule>>;

const localeJsonLoaders = import.meta.glob('../../locales/*/*.json') as Record<string, () => Promise<{ default: LocaleResourceBundle }>>;

const STORAGE_KEY = 'blawby_locale';
let initialized = false;

const staticResources = {
  en: {
    common: commonEn,
    settings: settingsEn,
    auth: authEn,
    profile: profileEn,
    pricing: pricingEn,
    practice: practiceEn
  }
};

const isSupportedLocale = (locale: string): locale is AppLocale => {
  return SUPPORTED_LOCALES.includes(locale as AppLocale);
};

const isAvailableLocale = (locale: string): locale is AnyLocale => {
  return AVAILABLE_LOCALES.includes(locale as AnyLocale);
};

const normalizeLocale = (locale?: string | null): AppLocale => {
  if (!locale) return DEFAULT_LOCALE;
  const lower = locale.toLowerCase();
  const explicitMatch = isSupportedLocale(lower) ? lower : null;
  if (explicitMatch) return explicitMatch;

  const match = SUPPORTED_LOCALES.find((supported) => lower.startsWith(`${supported}-`));
  return match ?? DEFAULT_LOCALE;
};

const normalizeAnyLocale = (locale?: string | null): AnyLocale => {
  if (!locale) return DEFAULT_LOCALE;
  const lower = locale.toLowerCase();
  const explicitMatch = isAvailableLocale(lower) ? lower : null;
  if (explicitMatch) return explicitMatch;

  const match = AVAILABLE_LOCALES.find((available) => lower.startsWith(`${available}-`));
  return match ?? DEFAULT_LOCALE;
};

const loadLocaleResources = async (locale: AnyLocale) => {
  if (locale === DEFAULT_LOCALE) {
    return;
  }

  // Try to load from index file first
  const indexLoaderKey = `../../locales/${locale}/index.ts`;
  const indexLoader = localeIndexLoaders[indexLoaderKey];
  
  if (indexLoader) {
    try {
      const localeModule = await indexLoader();
      
      NAMESPACES.forEach((namespace) => {
        const alreadyLoaded = i18next.getResourceBundle(locale, namespace);
        if (!alreadyLoaded && localeModule[namespace]) {
          i18next.addResourceBundle(locale, namespace, localeModule[namespace], true, true);
        }
      });
      return; // Successfully loaded from index
    } catch (error) {
      console.warn(`Failed to load locale index ${locale}, falling back to JSON files:`, error);
      // Continue to fallback logic below
    }
  } else {
    // No index loader found
    console.warn(`No index loader found for locale ${locale}, falling back to JSON files`);
  }
  const namespaceData = await Promise.all(
    NAMESPACES.map(async (namespace) => {
      const jsonLoaderKey = `../../locales/${locale}/${namespace}.json`;
      const jsonLoader = localeJsonLoaders[jsonLoaderKey];
      
      if (jsonLoader) {
        try {
          const module = await jsonLoader();
          return [namespace, module.default] as const;
        } catch (error) {
          console.warn(`Failed to load ${locale}/${namespace}.json:`, error);
        }
      } else {
        console.warn(`JSON loader not found for ${locale}/${namespace}.json`);
      }
      return [namespace, {}] as const;
    })
  );

  namespaceData.forEach(([namespace, data]) => {
    const alreadyLoaded = i18next.getResourceBundle(locale, namespace);
    if (!alreadyLoaded && Object.keys(data).length > 0) {
      i18next.addResourceBundle(locale, namespace, data, true, true);
    }
  });
};

export const initI18n = async () => {
  if (initialized) {
    return i18next;
  }

  const initialLocale = normalizeLocale(
    typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : undefined
  );

  await i18next
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources: staticResources,
      fallbackLng: DEFAULT_LOCALE,
      lng: initialLocale,
      load: 'languageOnly',
      supportedLngs: [...AVAILABLE_LOCALES],
      ns: [...NAMESPACES],
      defaultNS: 'common',
      interpolation: {
        escapeValue: false
      },
      detection: {
        order: ['querystring', 'localStorage', 'navigator'],
        caches: ['localStorage'],
        lookupLocalStorage: STORAGE_KEY
      },
      react: {
        useSuspense: true,
        bindI18n: 'languageChanged loaded',
        bindI18nStore: 'added removed'
      }
    });

  const normalizedAnyLocale = normalizeAnyLocale(i18next.language);
  await loadLocaleResources(normalizedAnyLocale);

  // Set initial HTML dir and lang attributes
  if (typeof window !== 'undefined') {
    const isRTL = isRTLLocale(normalizedAnyLocale);
    document.documentElement.setAttribute('dir', isRTL ? 'rtl' : 'ltr');
    document.documentElement.setAttribute('lang', normalizedAnyLocale);
  }

  initialized = true;
  return i18next;
};

export const setLocale = async (nextLocale: string) => {
  const target = normalizeAnyLocale(nextLocale);
  await loadLocaleResources(target);
  await i18next.changeLanguage(target);
  
  // Update text direction based on locale
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, target);
    
    // Set HTML dir attribute for RTL support
    const isRTL = isRTLLocale(target);
    document.documentElement.setAttribute('dir', isRTL ? 'rtl' : 'ltr');
    document.documentElement.setAttribute('lang', target);
  }
};

export const detectBestLocale = (): AppLocale => {
  if (typeof navigator === 'undefined') {
    return DEFAULT_LOCALE;
  }

  const [primary] = navigator.language.split('-');
  return normalizeLocale(primary);
};

export { i18next as i18n };
