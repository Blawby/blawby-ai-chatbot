// Shared constants for the application

export const Z_INDEX = {
  layout: 1900,
  fileMenu: 2000,
  modal: 2100,
  settings: 1500,
  settingsContent: 1600
} as const;

export const THEME = {
  zIndex: Z_INDEX
} as const;

// Matter analysis constants
export const SUMMARY_MIN_LENGTH = 50;

// Organization constants
// Used as the fallback platform/org identifier for public experiences
export const DEFAULT_ORGANIZATION_ID = '01K0TNGNKTM4Q0AG0XF0A8ST0Q';
export const DEFAULT_PLATFORM_SLUG = 'blawby-ai';
export const PLATFORM_ORGANIZATION_ID = DEFAULT_ORGANIZATION_ID;
