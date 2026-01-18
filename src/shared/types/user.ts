// TypeScript types for user data that match Better Auth schema
// These types are derived from the additionalFields defined in worker/auth/index.ts

import type { User as BetterAuthUser } from 'better-auth/types';

// Subscription tier type matching database enum
export type SubscriptionTier = 'free' | 'plus' | 'business' | 'enterprise';


// Language type for internationalization
export type Language = 'en' | 'es' | 'fr' | 'de' | 'it' | 'pt' | 'ja' | 'ko' | 'zh' | 'ar' | 'hi' | 'ru' | 'tr' | 'pl' | 'nl' | 'id' | 'th' | 'vi' | 'uk';

// Extended User type that includes all custom fields from Better Auth
export interface ExtendedUser extends BetterAuthUser {
  // Organization & Role
  practiceId?: string | null;
  activePracticeId?: string | null;
  role?: string | null;
  primaryWorkspace?: 'client' | 'practice' | null;
  preferredPracticeId?: string | null;
  practiceCount?: number | null;
  hasPractice?: boolean | null;
  
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
  phone?: string | null;
  primaryWorkspace?: 'client' | 'practice' | null;
  preferredPracticeId?: string | null;
  practiceCount?: number | null;
  hasPractice?: boolean | null;
  
  // Profile Information
  bio?: string | null;
  // TODO: These PII fields should be encrypted using PIIEncryptionService
  // TODO: Frontend should handle encryption/decryption transparently
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
  
  // Onboarding
  
  // Timestamps
  createdAt: Date | null;
  updatedAt: Date | null;
}

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
  isAnonymous?: boolean;
  lastLoginMethod?: string; // "google", "email", etc.
  practiceId?: string | null;
  activePracticeId?: string | null;
  role?: string | null;
  phone?: string | null;
  primaryWorkspace?: 'client' | 'practice' | null;
  preferredPracticeId?: string | null;
  practiceCount?: number | null;
  hasPractice?: boolean | null;
  
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
function safeConvertToDate(value: unknown): Date | null {
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
function validateRequiredFields(rawUser: Record<string, unknown>): void {
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
export function transformSessionUser(rawUser: Record<string, unknown>): BetterAuthSessionUser {
  // Validate required fields first
  validateRequiredFields(rawUser);
  
  const rawPrimaryWorkspace = rawUser.primaryWorkspace;
  const primaryWorkspace =
    rawPrimaryWorkspace === 'client' || rawPrimaryWorkspace === 'practice'
      ? rawPrimaryWorkspace
      : rawPrimaryWorkspace === null
        ? null
        : undefined;

  // Build the transformed user object with explicit field mapping
  const transformedUser: BetterAuthSessionUser = {
    // Required fields (already validated)
    id: rawUser.id as string,
    name: (rawUser.name as string) || 
          (rawUser.email as string).split('@')[0] || 
          `User-${rawUser.id}`,
    email: rawUser.email as string,
    
    // Optional primitive fields
    emailVerified: rawUser.emailVerified as boolean | undefined,
    image: rawUser.image as string | null | undefined,
    isAnonymous:
      typeof rawUser.isAnonymous === 'boolean'
        ? rawUser.isAnonymous
        : typeof rawUser.is_anonymous === 'boolean'
          ? rawUser.is_anonymous
          : undefined,
    lastLoginMethod: rawUser.lastLoginMethod as string | undefined,
    practiceId: rawUser.practiceId as string | null | undefined,
    activePracticeId: rawUser.activePracticeId as string | null | undefined,
    role: rawUser.role as string | null | undefined,
    phone: rawUser.phone as string | null | undefined,
    primaryWorkspace,
    preferredPracticeId: rawUser.preferredPracticeId as string | null | undefined,
    practiceCount: typeof rawUser.practiceCount === 'number' ? rawUser.practiceCount : undefined,
    hasPractice: typeof rawUser.hasPractice === 'boolean' ? rawUser.hasPractice : undefined,
    
    // Profile fields
    bio: rawUser.bio as string | null | undefined,
    secondaryPhone: rawUser.secondaryPhone as string | null | undefined,
    addressStreet: rawUser.addressStreet as string | null | undefined,
    addressCity: rawUser.addressCity as string | null | undefined,
    addressState: rawUser.addressState as string | null | undefined,
    addressZip: rawUser.addressZip as string | null | undefined,
    addressCountry: rawUser.addressCountry as string | null | undefined,
    preferredContactMethod: rawUser.preferredContactMethod as string | null | undefined,
    
    // App preferences
    theme: rawUser.theme as string | undefined,
    accentColor: rawUser.accentColor as string | undefined,
    fontSize: rawUser.fontSize as string | undefined,
    language: rawUser.language as string | undefined,
    spokenLanguage: rawUser.spokenLanguage as string | undefined,
    country: rawUser.country as string | undefined,
    timezone: rawUser.timezone as string | undefined,
    dateFormat: rawUser.dateFormat as string | undefined,
    timeFormat: rawUser.timeFormat as string | undefined,
    
    // Chat preferences
    autoSaveConversations: rawUser.autoSaveConversations as boolean | undefined,
    typingIndicators: rawUser.typingIndicators as boolean | undefined,
    
    // Email settings
    receiveFeedbackEmails: rawUser.receiveFeedbackEmails as boolean | undefined,
    marketingEmails: rawUser.marketingEmails as boolean | undefined,
    securityAlerts: rawUser.securityAlerts as boolean | undefined,
    
    // Security settings
    twoFactorEnabled: rawUser.twoFactorEnabled as boolean | undefined,
    emailNotifications: rawUser.emailNotifications as boolean | undefined,
    loginAlerts: rawUser.loginAlerts as boolean | undefined,
    sessionTimeout: convertSessionTimeoutToSeconds(rawUser.sessionTimeout as string | number),
    
    // Links
    selectedDomain: rawUser.selectedDomain as string | null | undefined,
    linkedinUrl: rawUser.linkedinUrl as string | null | undefined,
    githubUrl: rawUser.githubUrl as string | null | undefined,
    customDomains: rawUser.customDomains as string | null | undefined,
    
    // PII Compliance & Consent
    piiConsentGiven: rawUser.piiConsentGiven as boolean | undefined,
    dataRetentionConsent: rawUser.dataRetentionConsent as boolean | undefined,
    marketingConsent: rawUser.marketingConsent as boolean | undefined,
    dataProcessingConsent: rawUser.dataProcessingConsent as boolean | undefined,
    
    // Data Retention & Deletion
    dataDeletionRequested: rawUser.dataDeletionRequested as boolean | undefined,
    
    // Convert timestamp fields to Date objects
    piiConsentDate: safeConvertToDate(rawUser.piiConsentDate),
    dataRetentionExpiry: safeConvertToDate(rawUser.dataRetentionExpiry),
    lastDataAccess: safeConvertToDate(rawUser.lastDataAccess),
    dataDeletionDate: safeConvertToDate(rawUser.dataDeletionDate),
    createdAt: safeConvertToDate(rawUser.createdAt),
    updatedAt: safeConvertToDate(rawUser.updatedAt),
    lastPasswordChange: safeConvertToDate(rawUser.lastPasswordChange),
  };
  
  return transformedUser;
}
