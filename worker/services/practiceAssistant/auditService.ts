import type { Env } from '../../types.js';

const PAYLOAD_MAX_CHARS = 4000;

const serializeAuditPayload = (payload: Record<string, unknown> | undefined): string | null => {
  if (!payload) return null;

  const json = JSON.stringify(payload);
  if (json.length <= PAYLOAD_MAX_CHARS) return json;

  const previewLength = Math.max(0, PAYLOAD_MAX_CHARS - 80);
  return JSON.stringify({
    _truncated: true,
    _originalSize: json.length,
    _preview: json.slice(0, previewLength),
  });
};

export class PracticeAssistantAuditService {
  constructor(private env: Env) {}

  async record(input: {
    conversationId: string;
    practiceId: string;
    eventType: string;
    actorId?: string | null;
    actorType?: 'user' | 'lawyer' | 'system';
    payload?: Record<string, unknown>;
  }): Promise<void> {
    await this.env.DB.prepare(`
      INSERT INTO session_audit_events (
        id, conversation_id, practice_id, event_type, actor_type, actor_id, payload, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      input.conversationId,
      input.practiceId,
      input.eventType,
      input.actorType ?? 'system',
      input.actorId ?? null,
      serializeAuditPayload(input.payload),
      new Date().toISOString(),
    ).run();
  }
}
