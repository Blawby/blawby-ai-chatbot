/**
 * Wire types for the worker → backend event-bus payloads.
 *
 * The worker emits events for matter/conversation/intake state changes
 * (sent via BackendEventService). Snake_case fields match the backend
 * event schema.
 */

export interface BackendEventPayload {
  event_type: string;
  event_id?: string;
  occurred_at?: string;
  practice_id?: string;
  conversation_id?: string;
  matter_id?: string;
  intake_id?: string;
  sender_type?: string;
  sender_id?: string;
  contact_identifier?: string;
  contact_email?: string;
  message_id?: string;
  message_preview?: string;
  file_metadata?: Record<string, unknown>;
  sla_metadata?: Record<string, unknown>;
  [key: string]: unknown;
}
