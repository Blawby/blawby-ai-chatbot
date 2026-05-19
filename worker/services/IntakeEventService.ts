import type { Env } from '../types.js';
import { Logger } from '../utils/logger.js';
import type {
  IntakeEventRecordInput,
  IntakeEventRow,
  IntakeEventTurn,
} from '../types/intakeEvent.js';

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
