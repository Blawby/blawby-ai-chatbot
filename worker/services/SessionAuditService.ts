import type { Env } from '../types.js';

export interface SessionAuditEventInput {
  conversationId: string;
  practiceId: string;
  eventType: string;
  actorType?: 'user' | 'lawyer' | 'system';
  actorId?: string | null;
  payload?: Record<string, unknown> | null;
}

const MAX_PAYLOAD_LENGTH = 4000;
const ALLOWED_PAYLOAD_KEYS = new Set([
  'conversationId',
  'mode',
  'source',
  'intent',
  'confidence',
  'reason'
]);
const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const SSN_REGEX = /\b\d{3}-\d{2}-\d{4}\b/g;
const CREDIT_CARD_REGEX = /\b(?:\d[ -]*?){13,19}\b/g;

const redactString = (value: string): string => value
  .replace(EMAIL_REGEX, '[REDACTED]')
  .replace(SSN_REGEX, '[REDACTED]')
  .replace(CREDIT_CARD_REGEX, '[REDACTED]');

const redactValue = (value: unknown): unknown => {
  if (typeof value === 'string') {
    return redactString(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, redactValue(entry)])
    );
  }
  return value;
};

const sanitizePayload = (payload?: Record<string, unknown> | null): Record<string, unknown> | null => {
  if (!payload) return null;
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!ALLOWED_PAYLOAD_KEYS.has(key)) continue;
    sanitized[key] = redactValue(value);
  }
  if (Object.keys(sanitized).length === 0) {
    return null;
  }
  try {
    const serialized = JSON.stringify(sanitized);
    if (serialized.length > MAX_PAYLOAD_LENGTH) {
      console.warn('[SessionAuditService] Payload exceeds size limit, dropping payload');
      return null;
    }
  } catch (error) {
    console.warn('[SessionAuditService] Failed to serialize payload', error);
    return null;
  }
  return sanitized;
};

export class SessionAuditService {
  constructor(private env: Env) {}

  async createEvent(event: SessionAuditEventInput): Promise<string> {
    const eventId = crypto.randomUUID();
    const now = new Date().toISOString();
    const sanitizedPayload = sanitizePayload(event.payload);
    const payload = sanitizedPayload ? JSON.stringify(sanitizedPayload) : null;

    try {
      await this.env.DB.prepare(`
        INSERT INTO session_audit_events (
          id, conversation_id, practice_id, event_type, actor_type, actor_id, payload, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        eventId,
        event.conversationId,
        event.practiceId,
        event.eventType,
        event.actorType ?? 'system',
        event.actorId ?? null,
        payload,
        now
      ).run();
    } catch (error) {
      console.warn('[SessionAuditService] Failed to persist audit event', {
        eventId,
        conversationId: event.conversationId,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    return eventId;
  }
}
