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
export const DEFAULT_ORGANIZATION_ID = '01K0TNGNKTM4Q0AG0XF0A8ST0Q'; // blawby-ai organization ID
export const DEFAULT_PUBLIC_ORG_SLUG = 'blawby-ai';