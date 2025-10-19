// Centralized export for all i18n hooks and utilities
// This is the single source of truth for i18n imports

// Re-export standard i18next hooks (no custom wrapper)
export { useTranslation, Trans } from 'react-i18next';

// Re-export all i18n utilities and constants
export {
  i18n,
  initI18n,
  setLocale,
  detectBestLocale,
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  RTL_LOCALES,
  isRTLLocale,
  type AppLocale
} from './index';

// Alias for backward compatibility with tests
export { setLocale as changeLanguage } from './index';
