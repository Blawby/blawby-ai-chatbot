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
const nullableUnknown = () => z.unknown().nullable();

/**
 * Diagnostic context attached to partial intake submissions that arrive after
 * an AI failure. The backend silently strips this field today (no
 * `.passthrough()` on its Zod schema), but the worker sends it anyway so the
 * data is already in place when the backend gains first-class support. Per
 * U7 of docs/plans/2026-05-18-002-feat-strengthen-intake-ai-observability-plan.md.
 *
 * `last_user_message` is intentionally NOT included — engineers recover it
 * via `conversation_id` -> admin inspector view, avoiding PII leakage through
 * the backend's middleware / APM / platform logs that may log raw request
 * bodies even when Zod strips the field from the validated DTO.
 *
 * Current staging rejects worker-local conversation ids when sent as the
 * backend's top-level `conversation_id`. Store that diagnostic link in
 * `custom_fields._worker_conversation_id` instead.
 */
export const BackendIntakeFailureContextSchema = z.object({
  reason: z.string().min(1),
  mode_resolution_trace: z.record(z.string(), z.unknown()).optional(),
  timeline_ref: z.string().min(1).optional(),
});
export type BackendIntakeFailureContext = z.infer<typeof BackendIntakeFailureContextSchema>;

export const BackendIntakeCreatePayloadSchema = z.object({
  slug: z.string().min(1),
  amount: z.number(),
  name: z.string().min(1),
  email: z.string().email(),
  user_id: optionalString(),
  phone: optionalString(),
  conversation_id: optionalString(),
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
  /** Set on partial submissions after AI failure; see schema doc above. */
  failure_context: BackendIntakeFailureContextSchema.optional(),
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

export const BackendIntakeTemplateFieldSchema = z.object({
  id: z.string(),
  template_id: z.string(),
  key: z.string(),
  label: z.string(),
  field_type: z.enum(['text', 'textarea', 'email', 'phone', 'select', 'multiselect', 'date', 'boolean', 'number']),
  phase: z.enum(['required', 'enrichment']),
  required: z.boolean(),
  order_index: z.number(),
  placeholder: z.string().nullable(),
  help_text: z.string().nullable(),
  prompt_hint: z.string().nullable(),
  is_standard: z.boolean(),
  validation_rules: nullableUnknown(),
  options: z.array(z.object({
    value: z.string(),
    label: z.string(),
  })).nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type BackendIntakeTemplateField = z.infer<typeof BackendIntakeTemplateFieldSchema>;

export const BackendIntakeTemplateSchema = z.object({
  id: z.string(),
  organization_id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  status: z.enum(['draft', 'published', 'archived']),
  is_default: z.boolean(),
  intro_message: z.string().nullable(),
  legal_disclaimer: z.string().nullable(),
  payment_link_enabled: z.boolean(),
  consultation_fee: z.number().nullable(),
  archived_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  fields: z.array(BackendIntakeTemplateFieldSchema),
});

export type BackendIntakeTemplate = z.infer<typeof BackendIntakeTemplateSchema>;

export const BackendPracticeTemplatesResponseSchema = z.object({
  templates: z.array(BackendIntakeTemplateSchema),
});
export type BackendPracticeTemplatesResponse = z.infer<typeof BackendPracticeTemplatesResponseSchema>;

export type BackendIntakeTemplatePublic = {
  id: string;
  slug: string;
  name: string;
  intro_message: string | null;
  legal_disclaimer: string | null;
  payment_link_enabled: boolean;
  consultation_fee: number | null;
  fields: Array<Omit<BackendIntakeTemplateField, 'template_id' | 'created_at' | 'updated_at'>>;
};

/**
 * Response from GET /api/practice-client-intakes/:slug/intake.
 * Backend exposes per-practice intake settings (payment link toggle,
 * consultation fee, organization branding) in canonical snake_case.
 */
const IntakeSettingsObjectSchema = z.object({
  payment_link_enabled: z.boolean().optional(),
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
