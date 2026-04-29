/**
 * Wire types for practice/workspace API responses.
 *
 * Single source of truth for the JSON shapes the worker emits to the
 * frontend. Re-exported via @/shared/types/wire on the frontend so
 * service code never imports from `worker/` directly. The legacy
 * `worker/types.ts` re-exports from here for backward compat.
 */

import type { MinorAmount } from '../../types.js';

export type SubscriptionLifecycleStatus =
  | 'none'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'unpaid'
  | 'paused';

// Conversation configuration (conversation/messaging settings, not chatbot)
export interface ConversationConfig {
  ownerEmail?: string;
  availableServices: string[];
  serviceQuestions: Record<string, string[]>;
  domain: string;
  description: string;
  brandColor: string;
  accentColor: string;
  profileImage?: string;
  voice: {
    enabled: boolean;
    provider: 'cloudflare' | 'elevenlabs' | 'custom';
    voiceId?: string | null;
    displayName?: string | null;
    previewUrl?: string | null;
  };
  blawbyApi?: {
    enabled: boolean;
    apiKey?: string | null;
    apiKeyHash?: string;
    apiUrl?: string;
  };
  testMode?: boolean;
  metadata?: Record<string, unknown>;
  /**
   * Fee charged for an initial consultation.
   * Minor currency units (e.g., cents for USD). Must be integer >= 0.
   */
  consultationFee?: MinorAmount;
  /**
   * Smallest billing increment in minutes. Typical: 6, 10, or 15.
   */
  billingIncrementMinutes?: number;
  betterAuthOrgId?: string;
  tools?: {
    [toolName: string]: {
      enabled: boolean;
      requiredRole?: 'owner' | 'admin' | 'attorney' | 'paralegal' | null;
      allowAnonymous?: boolean;
    };
  };
  agentMember?: {
    enabled: boolean;
    userId?: string;
    autoInvoke?: boolean;
    tagRequired?: boolean;
  };
  isPublic?: boolean;
}

// Practice configuration extends conversation config.
// Currently identical to ConversationConfig — kept as a separate alias
// for future extensibility (rename callers to PracticeConfig where the
// distinction is meaningful).
export type PracticeConfig = ConversationConfig;

// Practice type (business practice - law firm)
export interface Practice {
  id: string;
  name: string;
  slug: string;
  domain?: string;
  accentColor?: string;
  metadata?: Record<string, unknown>;
  /** Extracted from practice.metadata.conversationConfig in the remote API. */
  conversationConfig: ConversationConfig;
  betterAuthOrgId?: string;
  stripeCustomerId?: string | null;
  seats?: number | null;
  kind: 'practice';
  subscriptionStatus: SubscriptionLifecycleStatus;
  subscriptionPeriodEnd?: number | null;
  createdAt: number;
  updatedAt: number;
  businessOnboardingCompletedAt?: number | null;
  businessOnboardingSkipped?: boolean;
  businessOnboardingData?: Record<string, unknown> | null;
}

// Workspace type (personal/ephemeral - no storage needed)
export interface Workspace {
  id: string;
  name: string;
  slug: string;
  domain?: string;
  accentColor?: string;
  metadata?: Record<string, unknown>;
  /** Hardcoded defaults (workspaces don't have backend-side config). */
  conversationConfig: ConversationConfig;
  betterAuthOrgId?: string;
  stripeCustomerId: null;
  seats: 1;
  kind: 'workspace';
  subscriptionStatus: 'none';
  subscriptionPeriodEnd: null;
  createdAt: number;
  updatedAt: number;
  businessOnboardingCompletedAt: null;
  businessOnboardingSkipped: false;
  businessOnboardingData: null;
}

export type PracticeOrWorkspace = Practice | Workspace;
