/**
 * Append-only per-turn intake event timeline types.
 * See U4 of docs/plans/2026-05-18-002-feat-strengthen-intake-ai-observability-plan.md.
 */

export type IntakeEventProvenance =
  | 'ai_intake'
  | 'ai_intake_no_tool_call'
  | 'safety_rail.legal_disclaimer'
  | 'ai_failure'
  | 'submit_intake'
  | 'mode_unresolved';

export const INTAKE_EVENT_PROVENANCES: readonly IntakeEventProvenance[] = [
  'ai_intake',
  'ai_intake_no_tool_call',
  'safety_rail.legal_disclaimer',
  'ai_failure',
  'submit_intake',
  'mode_unresolved',
] as const;

export interface IntakeEventRecordInput {
  conversationId: string;
  practiceId: string;
  provenance: IntakeEventProvenance;
  modeResolution?: Record<string, unknown> | null;
  userMessage?: string | null;
  modelRequest?: Record<string, unknown> | null;
  modelResponse?: Record<string, unknown> | null;
  toolCalls?: unknown[] | null;
  toolResults?: unknown[] | null;
  failureReason?: string | null;
}

/**
 * Raw D1 row shape — JSON columns stored as TEXT. snake_case at the wire
 * boundary per docs/engineering/AUTHENTICATION_ARCHITECTURE.md.
 */
export interface IntakeEventRow {
  id: string;
  conversation_id: string;
  practice_id: string;
  turn_seq: number;
  provenance: IntakeEventProvenance;
  mode_resolution_json: string | null;
  user_message: string | null;
  model_request_json: string | null;
  model_response_json: string | null;
  tool_calls_json: string | null;
  tool_results_json: string | null;
  failure_reason: string | null;
  created_at: string;
}

/**
 * Parsed read DTO — JSON columns parsed into structured values.
 * Returned by IntakeEventService.listByConversation / .recordTurn.
 */
export interface IntakeEventTurn {
  id: string;
  conversation_id: string;
  practice_id: string;
  turn_seq: number;
  provenance: IntakeEventProvenance;
  mode_resolution: Record<string, unknown> | null;
  user_message: string | null;
  model_request: Record<string, unknown> | null;
  model_response: Record<string, unknown> | null;
  tool_calls: unknown[] | null;
  tool_results: unknown[] | null;
  failure_reason: string | null;
  created_at: string;
}
