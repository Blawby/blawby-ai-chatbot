/**
 * Wire types for the worker → backend event-bus payloads.
 *
 * The worker emits events for matter/conversation/intake state changes
 * (sent via BackendEventService). Snake_case fields match the backend
 * event schema.
 */

import { z } from 'zod';

export const BackendEventPayloadSchema = z.object({
  event_type: z.string(),
  event_id: z.string().optional(),
  occurred_at: z.string().optional(),
  practice_id: z.string().optional(),
  conversation_id: z.string().optional(),
  matter_id: z.string().optional(),
  intake_id: z.string().optional(),
  sender_type: z.string().optional(),
  sender_id: z.string().optional(),
  contact_identifier: z.string().optional(),
  contact_email: z.string().optional(),
  message_id: z.string().optional(),
  message_preview: z.string().optional(),
  file_metadata: z.record(z.string(), z.unknown()).optional(),
  sla_metadata: z.record(z.string(), z.unknown()).optional(),
}).passthrough();
export type BackendEventPayload = z.infer<typeof BackendEventPayloadSchema>;
