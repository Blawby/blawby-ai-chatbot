import type { Env } from '../types.js';

export interface SessionAuditEventInput {
  conversationId: string;
  eventType: string;
  actorType?: 'user' | 'lawyer' | 'system';
  actorId?: string | null;
  payload?: Record<string, unknown> | null;
}

export class SessionAuditService {
  constructor(private env: Env) {}

  async createEvent(event: SessionAuditEventInput): Promise<string> {
    const eventId = crypto.randomUUID();
    const now = new Date().toISOString();
    const payload = event.payload ? JSON.stringify(event.payload) : null;

    await this.env.DB.prepare(`
      INSERT INTO session_audit_events (
        id, conversation_id, event_type, actor_type, actor_id, payload, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      eventId,
      event.conversationId,
      event.eventType,
      event.actorType ?? 'system',
      event.actorId ?? null,
      payload,
      now
    ).run();

    return eventId;
  }
}
