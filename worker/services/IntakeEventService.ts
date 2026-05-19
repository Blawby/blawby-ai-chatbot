import type { Env } from '../types.js';
import { Logger } from '../utils/logger.js';
import type {
  IntakeEventRecordInput,
  IntakeEventRow,
  IntakeEventTurn,
} from '../types/intakeEvent.js';

/**
 * Write semantics chosen by the caller per provenance.
 * - `fire_and_forget`: log warn on failure but do NOT block user-facing AI response.
 *   Use for `ai_intake`, `ai_intake_no_tool_call`, `safety_rail.legal_disclaimer`,
 *   and `submit_intake` — these are routine turns where best-effort recording
 *   is acceptable.
 * - `await_with_retry`: await, retry once, emit critical-error with full payload
 *   if both attempts fail. Use for `ai_failure` and `mode_unresolved` — these turns
 *   ARE the timeline's primary purpose; silently dropping them recreates the
 *   "engineer must grep logs" workflow this whole initiative exists to eliminate.
 * See U5 of docs/plans/2026-05-18-002-feat-strengthen-intake-ai-observability-plan.md.
 */
export type IntakeTimelineWritePolicy = 'fire_and_forget' | 'await_with_retry';

/**
 * Single entry point used by aiChat.ts and friends. Encapsulates the
 * provenance-dependent write semantics so call sites stay simple — they pick
 * the policy, the helper handles the retry + critical-log behavior.
 *
 * Never throws. Always awaits at least one D1 write attempt before returning.
 * "Fire-and-forget" means "don't make the user wait" — call sites push the
 * returned promise into a `ctx.waitUntil`-backed post-stream task list rather
 * than awaiting inline. On Cloudflare Workers, a Promise that is not pinned
 * to the request via waitUntil may be cancelled when the response closes, so
 * the helper itself must always await; the policy controls retry + log severity.
 *
 *   - `fire_and_forget`: one attempt; warn on failure; no retry. Use for
 *     `ai_intake`, `ai_intake_no_tool_call`, `safety_rail.legal_disclaimer`,
 *     `submit_intake`.
 *   - `await_with_retry`: one attempt + one retry on failure; critical-log
 *     with full intended payload if both fail. Use for `ai_failure` and
 *     `mode_unresolved` — these turns are the timeline's primary purpose.
 *
 * See U5 of docs/plans/2026-05-18-002-feat-strengthen-intake-ai-observability-plan.md.
 */
export async function writeIntakeTurn(
  service: IntakeEventService,
  input: IntakeEventRecordInput,
  policy: IntakeTimelineWritePolicy,
): Promise<void> {
  try {
    await service.recordTurn(input);
    return;
  } catch (firstError) {
    Logger.warn('intake.timeline.write_failed', {
      conversationId: input.conversationId,
      practiceId: input.practiceId,
      provenance: input.provenance,
      attempt: 1,
      error: firstError instanceof Error ? firstError.message : String(firstError),
    });
    if (policy === 'fire_and_forget') {
      return;
    }
    try {
      await service.recordTurn(input);
    } catch (secondError) {
      Logger.error('intake.timeline.write_failed_critical', {
        conversationId: input.conversationId,
        practiceId: input.practiceId,
        provenance: input.provenance,
        attempt: 2,
        error: secondError instanceof Error ? secondError.message : String(secondError),
        // Inline the full intended turn payload so diagnostic data is
        // recoverable from logs even when the timeline row is lost.
        intendedTurn: {
          modeResolution: input.modeResolution ?? null,
          userMessage: input.userMessage ?? null,
          modelRequest: input.modelRequest ?? null,
          modelResponse: input.modelResponse ?? null,
          toolCalls: input.toolCalls ?? null,
          toolResults: input.toolResults ?? null,
          failureReason: input.failureReason ?? null,
        },
      });
    }
  }
}

/**
 * Append-only timeline for intake turns. Mirrors SessionAuditService's shape
 * (constructor takes Env; methods perform single-statement D1 reads/writes).
 *
 * Write semantics are decided at the call site (fire-and-forget vs await + retry),
 * see U5 of the plan — this service exposes plain async methods that throw on
 * D1 errors; the caller chooses whether to swallow or propagate.
 */
export class IntakeEventService {
  constructor(private env: Env) {}

  /**
   * Returns the next turn_seq for a conversation (1-based, monotonic).
   * The UNIQUE (conversation_id, turn_seq) constraint guards against TOCTOU
   * races; callers can retry on uniqueness violation if they need to.
   */
  async getNextTurnSeq(conversationId: string): Promise<number> {
    const row = await this.env.DB.prepare(`
      SELECT COALESCE(MAX(turn_seq), 0) AS max_seq
      FROM intake_events
      WHERE conversation_id = ?
    `).bind(conversationId).first<{ max_seq: number }>();
    return (row?.max_seq ?? 0) + 1;
  }

  /**
   * Insert one turn. Returns the inserted row as a parsed IntakeEventTurn.
   * Throws on D1 error or CHECK / UNIQUE violation.
   */
  async recordTurn(input: IntakeEventRecordInput): Promise<IntakeEventTurn> {
    const id = crypto.randomUUID();
    const turnSeq = await this.getNextTurnSeq(input.conversationId);
    const createdAt = new Date().toISOString();
    const modeResolutionJson = serializeOrNull(input.modeResolution);
    const modelRequestJson = serializeOrNull(input.modelRequest);
    const modelResponseJson = serializeOrNull(input.modelResponse);
    const toolCallsJson = serializeOrNull(input.toolCalls);
    const toolResultsJson = serializeOrNull(input.toolResults);

    await this.env.DB.prepare(`
      INSERT INTO intake_events (
        id, conversation_id, practice_id, turn_seq, provenance,
        mode_resolution_json, user_message, model_request_json,
        model_response_json, tool_calls_json, tool_results_json,
        failure_reason, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      input.conversationId,
      input.practiceId,
      turnSeq,
      input.provenance,
      modeResolutionJson,
      input.userMessage ?? null,
      modelRequestJson,
      modelResponseJson,
      toolCallsJson,
      toolResultsJson,
      input.failureReason ?? null,
      createdAt,
    ).run();

    return {
      id,
      conversation_id: input.conversationId,
      practice_id: input.practiceId,
      turn_seq: turnSeq,
      provenance: input.provenance,
      mode_resolution: (input.modeResolution as Record<string, unknown> | null | undefined) ?? null,
      user_message: input.userMessage ?? null,
      model_request: (input.modelRequest as Record<string, unknown> | null | undefined) ?? null,
      model_response: (input.modelResponse as Record<string, unknown> | null | undefined) ?? null,
      tool_calls: input.toolCalls ?? null,
      tool_results: input.toolResults ?? null,
      failure_reason: input.failureReason ?? null,
      created_at: createdAt,
    };
  }

  /**
   * All turns for a conversation, ordered by turn_seq ASC.
   */
  async listByConversation(conversationId: string): Promise<IntakeEventTurn[]> {
    const result = await this.env.DB.prepare(`
      SELECT id, conversation_id, practice_id, turn_seq, provenance,
             mode_resolution_json, user_message, model_request_json,
             model_response_json, tool_calls_json, tool_results_json,
             failure_reason, created_at
      FROM intake_events
      WHERE conversation_id = ?
      ORDER BY turn_seq ASC
    `).bind(conversationId).all<IntakeEventRow>();

    return (result.results ?? []).map(deserialize);
  }

  /**
   * Per-record deletion at the conversation_id grain. Engineer-callable for
   * compliance triggers; no automatic retention policy in v1.
   * Returns the number of rows deleted.
   */
  async deleteByConversation(conversationId: string): Promise<number> {
    const result = await this.env.DB.prepare(`
      DELETE FROM intake_events WHERE conversation_id = ?
    `).bind(conversationId).run();
    return result.meta?.changes ?? 0;
  }
}

function serializeOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  try {
    return JSON.stringify(value);
  } catch (error) {
    Logger.warn('intake.event.serialize_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function parseJsonOrNull(value: string | null): unknown {
  if (value === null) return null;
  try {
    return JSON.parse(value);
  } catch (error) {
    Logger.warn('intake.event.parse_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function deserialize(row: IntakeEventRow): IntakeEventTurn {
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    practice_id: row.practice_id,
    turn_seq: row.turn_seq,
    provenance: row.provenance,
    mode_resolution: parseJsonOrNull(row.mode_resolution_json) as Record<string, unknown> | null,
    user_message: row.user_message,
    model_request: parseJsonOrNull(row.model_request_json) as Record<string, unknown> | null,
    model_response: parseJsonOrNull(row.model_response_json) as Record<string, unknown> | null,
    tool_calls: parseJsonOrNull(row.tool_calls_json) as unknown[] | null,
    tool_results: parseJsonOrNull(row.tool_results_json) as unknown[] | null,
    failure_reason: row.failure_reason,
    created_at: row.created_at,
  };
}
