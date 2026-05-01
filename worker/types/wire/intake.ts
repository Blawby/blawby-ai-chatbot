/**
 * Wire types for intake submission — single source of truth for the
 * `/api/conversations/:id/submit-intake` and `RemoteApiService.createIntake`
 * payloads and responses.
 *
 * Snake_case fields match the backend contract verbatim. Each TS type
 * is derived from a Zod schema via `z.infer<typeof Schema>` so the
 * runtime validator and the type stay in lockstep.
 */

import { z } from 'zod';

const optionalString = () => z.string().optional();
const optionalNumber = () => z.number().optional();
const optionalBoolean = () => z.boolean().optional();

export const BackendIntakeCreatePayloadSchema = z.object({
  slug: z.string().min(1),
  amount: z.number(),
  name: z.string().min(1),
  email: z.string().email(),
  user_id: optionalString(),
  phone: optionalString(),
  conversation_id: z.string().min(1),
  description: optionalString(),
  urgency: optionalString(),
  opposing_party: optionalString(),
  desired_outcome: optionalString(),
  court_date: optionalString(),
  case_strength: optionalNumber(),
  has_documents: optionalBoolean(),
  income: optionalNumber(),
  household_size: optionalNumber(),
  practice_service_uuid: optionalString(),
  address: z.object({
    city: optionalString(),
    state: optionalString(),
  }).optional(),
  /** Plain-text digest of the intake conversation; max 4000 chars. */
  transcript_summary: optionalString(),
  /** Template attribution and unmapped custom answers. */
  custom_fields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});
export type BackendIntakeCreatePayload = z.infer<typeof BackendIntakeCreatePayloadSchema>;

const BackendIntakeCreateOrgSchema = z.object({
  name: z.string().nullable().optional(),
}).passthrough().nullable().optional();

// Backend has been observed emitting the flat shape directly
// ({uuid, status, payment_link_url, ...}) on POST .../create — no `success`
// wrapper. Accept both flat and nested ({success, data: {...}}) forms by
// listing the intake fields at the top level AND under `data`. Either may
// be present; the caller normalizes.
export const BackendIntakeCreateResponseSchema = z.object({
  success: z.boolean().optional(),
  // Nested shape
  data: z.object({
    uuid: z.string(),
    status: z.string(),
    payment_link_url: z.string().nullable().optional(),
    organization: BackendIntakeCreateOrgSchema,
  }).passthrough().optional(),
  // Flat shape — same fields at top level
  uuid: z.string().optional(),
  status: z.string().optional(),
  payment_link_url: z.string().nullable().optional(),
  organization: BackendIntakeCreateOrgSchema,
  error: z.string().optional(),
}).passthrough();
export type BackendIntakeCreateResponse = z.infer<typeof BackendIntakeCreateResponseSchema>;

/**
 * Response from POST /api/practice-client-intakes/:uuid/convert.
 * Backend creates a Matter from a paid intake and returns the IDs.
 */
export const BackendIntakeConvertResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    matter_id: z.string(),
    matter_status: z.string().optional(),
    conversation_id: z.string().optional(),
    invite_sent: z.boolean().optional(),
  }).passthrough(),
  error: z.string().optional(),
});
export type BackendIntakeConvertResponse = z.infer<typeof BackendIntakeConvertResponseSchema>;

/**
 * Response from GET /api/practice-client-intakes/:slug/intake.
 * Backend exposes per-practice intake settings (payment link toggle,
 * consultation fee, organization branding). Field names appear in
 * both camelCase and snake_case across backend versions; the schema
 * accepts both to tolerate version skew.
 */
const IntakeSettingsObjectSchema = z.object({
  paymentLinkEnabled: z.boolean().optional(),
  payment_link_enabled: z.boolean().optional(),
  consultationFee: z.number().optional(),
  consultation_fee: z.number().optional(),
}).passthrough();

const IntakeOrganizationObjectSchema = z.object({
  id: z.string().optional(),
  slug: z.string().optional(),
  name: z.string().optional(),
  logo: z.string().optional(),
}).passthrough();

export const BackendPracticeIntakeSettingsResponseSchema = z.object({
  success: z.boolean().optional(),
  data: z.object({
    settings: IntakeSettingsObjectSchema.optional(),
    organization: IntakeOrganizationObjectSchema.optional(),
  }).passthrough().optional(),
  // Some backend versions place settings/organization at the top level.
  settings: IntakeSettingsObjectSchema.optional(),
  organization: IntakeOrganizationObjectSchema.optional(),
}).passthrough();
export type BackendPracticeIntakeSettingsResponse = z.infer<typeof BackendPracticeIntakeSettingsResponseSchema>;
