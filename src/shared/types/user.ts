// TypeScript types for user data that match Better Auth schema
// These types are derived from the additionalFields defined in worker/auth/index.ts

import type { User as BetterAuthUser } from 'better-auth/types';

// Language type for internationalization
export type Language = 'en' | 'es' | 'fr' | 'de' | 'it' | 'pt' | 'ja' | 'ko' | 'zh' | 'ar' | 'hi' | 'ru' | 'tr' | 'pl' | 'nl' | 'id' | 'th' | 'vi' | 'uk';

// Extended User type that includes all custom fields from Better Auth
export interface ExtendedUser extends BetterAuthUser {
  // Organization & Role
  practiceId?: string | null;
  activePracticeId?: string | null;
  role?: string | null;
  practiceCount?: number | null;
  onboardingComplete?: boolean | null;
  primary_workspace?: 'public' | 'client' | 'practice' | null;
  
  // Contact Info
  phone?: string | null;
  
  // Links
  selectedDomain?: string | null;
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  customDomains?: string | null; // JSON string
  
  // Email Preferences
  receiveFeedbackEmails?: boolean;
  marketingEmails?: boolean;
  securityAlerts?: boolean;
  
  // Auth Info
  lastLoginMethod?: string | null;
  
  // UI Preferences
  theme?: string | null;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  practiceId?: string | null;
  activePracticeId?: string | null;
  role?: string | null;
  stripeCustomerId?: string | null;
  phone?: string | null;
  practiceCount?: number | null;
  
  // Profile Information
  bio?: string | null;
  secondaryPhone?: string | null;
  addressStreet?: string | null;
  addressCity?: string | null;
  addressState?: string | null;
  addressZip?: string | null;
  addressCountry?: string | null;
  preferredContactMethod?: string | null;
  
  // App Preferences
  theme?: string;
  accentColor?: string;
  fontSize?: string;
  language?: string;
  spokenLanguage?: string;
  country?: string;
  timezone?: string;
  dateFormat?: string;
  timeFormat?: string;
  
  // Chat Preferences
  autoSaveConversations?: boolean;
  typingIndicators?: boolean;
  
  // Email Settings
  receiveFeedbackEmails?: boolean;
  marketingEmails?: boolean;
  securityAlerts?: boolean;
  
  // Security Settings
  twoFactorEnabled?: boolean;
  emailNotifications?: boolean;
  loginAlerts?: boolean;
  sessionTimeout?: number;
  lastPasswordChange?: Date | null;
  
  // Links
  selectedDomain?: string | null;
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  
  // Timestamps
  createdAt: Date | null;
  updatedAt: Date | null;
}

// Alias for clarity: backend-shaped session user
export type BackendSessionUser = BetterAuthSessionUser;

// Minimal backend session record shape (extendable by backend)
export interface BackendSession {
  id?: string | null;
  created_at?: string | null;
  expires_at?: string | null;
  // allow additional backend-provided fields
  [key: string]: unknown;
}

// Canonical auth session payload returned by `getSession()` and `useSession()`
export type AuthSessionPayload = { session: BackendSession; user: BackendSessionUser } | null;

// NotificationSettings mirrors the notifications preferences category shape.
export interface NotificationSettings {
  messages: {
    push: boolean;
    email: boolean;
  };
  messagesMentionsOnly: boolean;
  system: {
    push: boolean;
    email: boolean;
  };
  payments: {
    push: boolean;
    email: boolean;
  };
  intakes: {
    push: boolean;
    email: boolean;
  };
  matters: {
    push: boolean;
    email: boolean;
  };
  desktopPushEnabled: boolean;
  inApp: {
    messages: boolean;
    system: boolean;
    payments: boolean;
    intakes: boolean;
    matters: boolean;
  };
  inAppFrequency: 'all' | 'summaries_only';
}

export interface SecuritySettings {
  twoFactorEnabled: boolean;
  emailNotifications: boolean;
  loginAlerts: boolean;
  sessionTimeout?: number; // Timeout in seconds
  lastPasswordChange: Date | null;
  connectedAccounts: Array<{
    provider: string;
    email: string;
    connectedAt: string;
  }>;
}

// Helper functions for session timeout conversion
export const SESSION_TIMEOUT_OPTIONS = {
  '1 hour': 3600,      // 1 hour in seconds
  '1 day': 86400,      // 1 day in seconds  
  '7 days': 604800,    // 7 days in seconds
  '30 days': 2592000   // 30 days in seconds
} as const;

export type SessionTimeoutOption = keyof typeof SESSION_TIMEOUT_OPTIONS;

export const convertSessionTimeoutToSeconds = (timeout: string | number): number => {
  if (typeof timeout === 'number') {
    return timeout;
  }
  
  // Handle legacy string values
  const seconds = SESSION_TIMEOUT_OPTIONS[timeout as SessionTimeoutOption];
  if (seconds !== undefined) {
    return seconds;
  }
  
  // Default to 7 days if invalid value
  return SESSION_TIMEOUT_OPTIONS['7 days'];
};

export const convertSessionTimeoutToString = (timeout: number): SessionTimeoutOption => {
  // Find the matching string value
  for (const [key, value] of Object.entries(SESSION_TIMEOUT_OPTIONS)) {
    if (value === timeout) {
      return key as SessionTimeoutOption;
    }
  }
  
  // Default to 7 days if no match found
  return '7 days';
};

export interface UserLinks {
  selectedDomain: string;
  linkedinUrl: string | null;
  githubUrl: string | null;
  customDomains: Array<{
    domain: string;
    verified: boolean;
    verifiedAt: string | null;
  }>;
}

export interface EmailSettings {
  email: string;
  receiveFeedbackEmails: boolean;
  marketingEmails: boolean;
  securityAlerts: boolean;
}

// Type for updating user data via Better Auth
export type UserUpdateData = Partial<Omit<UserProfile, 'id' | 'email' | 'createdAt' | 'updatedAt'>>;

// Helper type for Better Auth session user (what we get from useSession)
export interface BetterAuthSessionUser {
  id: string;
  name: string;
  email: string;
  emailVerified?: boolean;
  image?: string | null;
  lastLoginMethod?: string; // "google", "email", etc.
  role?: string | null;
  phone?: string | null;
  practiceCount?: number | null;
  primary_workspace?: 'public' | 'client' | 'practice' | null;
  
  // All the additional fields we added
  bio?: string | null;
  // TODO: These PII fields should be encrypted using PIIEncryptionService
  // TODO: Better Auth session should handle encryption/decryption transparently
  secondaryPhone?: string | null;
  addressStreet?: string | null;
  addressCity?: string | null;
  addressState?: string | null;
  addressZip?: string | null;
  addressCountry?: string | null;
  preferredContactMethod?: string | null;
  theme?: string;
  accentColor?: string;
  fontSize?: string;
  language?: string;
  spokenLanguage?: string;
  country?: string;
  timezone?: string;
  dateFormat?: string;
  timeFormat?: string;
  autoSaveConversations?: boolean;
  typingIndicators?: boolean;
  receiveFeedbackEmails?: boolean;
  marketingEmails?: boolean;
  securityAlerts?: boolean;
  twoFactorEnabled?: boolean;
  emailNotifications?: boolean;
  loginAlerts?: boolean;
  sessionTimeout?: number;
  lastPasswordChange?: Date | null;
  selectedDomain?: string | null;
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  customDomains?: string | null; // JSON string of custom domains array

  // Backend session payload uses snake_case field names.
  is_anonymous?: boolean;
  onboarding_complete?: boolean | null;
  practice_id?: string | null;
  active_practice_id?: string | null;
  active_organization_id?: string | null;
  stripe_customer_id?: string | null;
  
  // PII Compliance & Consent
  piiConsentGiven?: boolean;
  piiConsentDate?: Date | null;
  dataRetentionConsent?: boolean;
  marketingConsent?: boolean;
  dataProcessingConsent?: boolean;
  
  // Data Retention & Deletion
  dataRetentionExpiry?: Date | null;
  lastDataAccess?: Date | null;
  dataDeletionRequested?: boolean;
  dataDeletionDate?: Date | null;
  
  createdAt: Date | null;
  updatedAt: Date | null;
}

/**
 * Safely converts various timestamp formats to Date or null
 * @param value - The value to convert (number, string, Date, or null/undefined)
 * @returns Date object or null if conversion fails or value is null/undefined
 */
export function safeConvertToDate(value: unknown): Date | null {
  if (value === null || value === undefined) {
    return null;
  }
  
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }
  
  if (typeof value === 'number') {
    // Handle both Unix timestamps (seconds) and JavaScript timestamps (milliseconds)
    const timestamp = value > 1e10 ? value : value * 1000;
    const date = new Date(timestamp);
    return isNaN(date.getTime()) ? null : date;
  }
  
  if (typeof value === 'string') {
    if (value.trim() === '') {
      return null;
    }
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }
  
  return null;
}


/**
 * Validates that required primitive fields exist in the raw user data
 * @param rawUser - The raw user data to validate
 * @throws Error if required fields are missing
 */
export function validateRequiredFields(rawUser: Record<string, unknown>): void {
  const requiredFields = ['id', 'email'] as const;
  const missingFields: string[] = [];

  const isMissingString = (value: unknown) =>
    value === null || value === undefined || typeof value !== 'string' || value.trim() === '';
  
  for (const field of requiredFields) {
    const value = rawUser[field];
    if (isMissingString(value)) {
      missingFields.push(field);
    }
  }
  
  if (missingFields.length > 0) {
    throw new Error(`Missing required user fields: ${missingFields.join(', ')}`);
  }
}

/**
 * Transforms raw session user data and ensures timestamp fields are properly converted to Date objects
 * @param rawUser - The raw user data from Better Auth session
 * @returns The transformed user data with properly typed fields
 * @throws Error if required fields (id, name, email) are missing
 */
// transformSessionUser removed: frontend will use backend session/user shape directly.
