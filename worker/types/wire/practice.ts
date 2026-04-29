/**
 * Wire types for practice/workspace API responses.
 *
 * Single source of truth for the JSON shapes the worker emits to the
 * frontend. Each TypeScript type is paired with a Zod schema; types
 * are derived via z.infer so the validator and the type stay in
 * lockstep. Re-exported via @/shared/types/wire on the frontend so
 * service code never imports from `worker/` directly. The legacy
 * `worker/types.ts` re-exports from here for backward compat.
 */

import { z } from 'zod';
import type { MinorAmount } from '../../../src/shared/utils/money';

export const SubscriptionLifecycleStatusSchema = z.enum([
  'none',
  'trialing',
  'active',
  'past_due',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'unpaid',
  'paused',
]);
export type SubscriptionLifecycleStatus = z.infer<typeof SubscriptionLifecycleStatusSchema>;

// MinorAmount is a branded number; Zod doesn't see the brand. Validate
// as `number` (>= 0, integer) and cast through unknown to preserve the
// brand in the inferred output type. Keep the optional() wrapper so
// the parent schema treats the field as not required.
const minorAmountField = (): z.ZodOptional<z.ZodType<MinorAmount>> =>
  z.number().int().min(0).optional() as unknown as z.ZodOptional<z.ZodType<MinorAmount>>;

const VoiceConfigSchema = z.object({
  enabled: z.boolean(),
  provider: z.enum(['cloudflare', 'elevenlabs', 'custom']),
  voiceId: z.string().nullable().optional(),
  displayName: z.string().nullable().optional(),
  previewUrl: z.string().nullable().optional(),
});

const BlawbyApiConfigSchema = z.object({
  enabled: z.boolean(),
  apiKey: z.string().nullable().optional(),
  apiKeyHash: z.string().optional(),
  apiUrl: z.string().optional(),
});

const ToolConfigSchema = z.object({
  enabled: z.boolean(),
  requiredRole: z.enum(['owner', 'admin', 'attorney', 'paralegal']).nullable().optional(),
  allowAnonymous: z.boolean().optional(),
});

const AgentMemberConfigSchema = z.object({
  enabled: z.boolean(),
  userId: z.string().optional(),
  autoInvoke: z.boolean().optional(),
  tagRequired: z.boolean().optional(),
});

export const ConversationConfigSchema = z.object({
  ownerEmail: z.string().optional(),
  availableServices: z.array(z.string()),
  serviceQuestions: z.record(z.string(), z.array(z.string())),
  domain: z.string(),
  description: z.string(),
  brandColor: z.string(),
  accentColor: z.string(),
  profileImage: z.string().optional(),
  voice: VoiceConfigSchema,
  blawbyApi: BlawbyApiConfigSchema.optional(),
  testMode: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  /** Fee charged for an initial consultation. Minor currency units. */
  consultationFee: minorAmountField(),
  /** Smallest billing increment in minutes. Typical: 6, 10, or 15. */
  billingIncrementMinutes: z.number().int().positive().optional(),
  betterAuthOrgId: z.string().optional(),
  tools: z.record(z.string(), ToolConfigSchema).optional(),
  agentMember: AgentMemberConfigSchema.optional(),
  isPublic: z.boolean().optional(),
}).passthrough();
export type ConversationConfig = z.infer<typeof ConversationConfigSchema>;

// PracticeConfig is currently identical to ConversationConfig — kept as
// a separate alias for future extensibility.
export const PracticeConfigSchema = ConversationConfigSchema;
export type PracticeConfig = ConversationConfig;

export const PracticeSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  domain: z.string().optional(),
  accentColor: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  /** Extracted from practice.metadata.conversationConfig in the remote API. */
  conversationConfig: ConversationConfigSchema,
  betterAuthOrgId: z.string().optional(),
  stripeCustomerId: z.string().nullable().optional(),
  seats: z.number().nullable().optional(),
  kind: z.literal('practice'),
  subscriptionStatus: SubscriptionLifecycleStatusSchema,
  subscriptionPeriodEnd: z.number().nullable().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
  businessOnboardingCompletedAt: z.number().nullable().optional(),
  businessOnboardingSkipped: z.boolean().optional(),
  businessOnboardingData: z.record(z.string(), z.unknown()).nullable().optional(),
}).passthrough();
export type Practice = z.infer<typeof PracticeSchema>;

export const WorkspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  domain: z.string().optional(),
  accentColor: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  /** Hardcoded defaults (workspaces don't have backend-side config). */
  conversationConfig: ConversationConfigSchema,
  betterAuthOrgId: z.string().optional(),
  stripeCustomerId: z.literal(null),
  seats: z.literal(1),
  kind: z.literal('workspace'),
  subscriptionStatus: z.literal('none'),
  subscriptionPeriodEnd: z.literal(null),
  createdAt: z.number(),
  updatedAt: z.number(),
  businessOnboardingCompletedAt: z.literal(null),
  businessOnboardingSkipped: z.literal(false),
  businessOnboardingData: z.literal(null),
}).passthrough();
export type Workspace = z.infer<typeof WorkspaceSchema>;

export const PracticeOrWorkspaceSchema = z.union([PracticeSchema, WorkspaceSchema]);
export type PracticeOrWorkspace = z.infer<typeof PracticeOrWorkspaceSchema>;
