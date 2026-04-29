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

export const BackendIntakeCreateResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    uuid: z.string(),
    status: z.string(),
    payment_link_url: z.string().nullable(),
    organization: z.object({
      name: z.string().nullable().optional(),
    }).passthrough().nullable().optional(),
  }).passthrough().optional(),
  error: z.string().optional(),
});
export type BackendIntakeCreateResponse = z.infer<typeof BackendIntakeCreateResponseSchema>;
