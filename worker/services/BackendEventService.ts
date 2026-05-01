import type { Env } from '../types.js';
import { Logger } from '../utils/logger.js';

export type { BackendEventPayload } from '../types/wire/events.js';
import type { BackendEventPayload } from '../types/wire/events.js';

export class BackendEventService {
  constructor(private env: Env) {}

  async emitEvent(payload: BackendEventPayload): Promise<void> {
    if (!this.env.BACKEND_API_URL) return;
    
    // Auth mechanism: internal token if available
    const token = typeof this.env.WIDGET_AUTH_TOKEN_SECRET === 'string'
      ? this.env.WIDGET_AUTH_TOKEN_SECRET.trim()
      : '';
    if (!token) {
      Logger.error('WIDGET_AUTH_TOKEN_SECRET is missing; cannot emit backend event', { eventType: payload.event_type });
      throw new Error('WIDGET_AUTH_TOKEN_SECRET must be configured');
    }

    const url = `${this.env.BACKEND_API_URL}/api/internal/events`;
    const body = {
      event_id: crypto.randomUUID(),
      occurred_at: new Date().toISOString(),
      ...payload
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      
      if (!response.ok) {
        let msg = response.statusText;
        try {
          msg = await response.text();
        } catch (_err) {
          // ignore
        }
        Logger.warn('Failed to emit backend event', {
          status: response.status,
          message: msg,
          eventType: payload.event_type
        });
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        Logger.error('Failed to emit backend event: request timed out', {
          eventType: payload.event_type
        });
      } else {
        Logger.error('Failed to emit backend event due to network error', {
          error: e instanceof Error ? e.message : String(e),
          eventType: payload.event_type
        });
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}
