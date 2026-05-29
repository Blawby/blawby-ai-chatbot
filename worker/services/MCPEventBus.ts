import { z } from 'zod';
import type { Env } from '../types.js';
import type { Request as WorkerRequest } from '@cloudflare/workers-types';
import { MCPSessionStore, type MCPSessionRecord } from './MCPSessionStore.js';

/**
 * MCPEventBus — Backend→Worker event ingest and fan-out.
 *
 * Plan U8. Receives a batch of lifecycle events from Backend U4's
 * outbox dispatcher, validates each, and fans out to active McpSession
 * Durable Objects whose granted scopes cover the event class.
 *
 * Event-type → required-scope mapping is a verbatim copy of Backend
 * U4's source of truth (plan calls this out explicitly). Keep the two
 * in sync via the integration tests in U13.
 *
 * For `pending_action.completed` the required scope is derived from
 * the originating tool — the dispatcher embeds `tool_name` in the
 * payload, and we map it back to the same scope the original tool
 * required (R10/R11). Plan: `send_invoice` → `invoices:send`;
 * `record_payment` → `invoices:send`; `refund_payment` → `payments:refund`.
 */

export const EVENT_TYPE_SCOPE_MAP: Readonly<Record<string, string>> = Object.freeze({
  'intake:submitted': 'intakes:read',
  'intake:triaged': 'intakes:read',
  'intake:payment_succeeded': 'intakes:read',
  'matter:status_changed': 'matters:read',
  'invoice:sent': 'invoices:read',
  'invoice:paid': 'invoices:read',
  'invoice:overdue': 'invoices:read',
  'payment:received': 'payments:read',
  'payout:completed': 'payments:read',
  'message:received_from_client': 'conversations:read',
  'engagement:signed': 'matters:read',
});

// pending_action.completed is special — derived from the originating tool.
const PENDING_ACTION_TOOL_SCOPE: Readonly<Record<string, string>> = Object.freeze({
  send_invoice: 'invoices:send',
  record_payment: 'invoices:send',
  refund_payment: 'payments:refund',
});

/**
 * Resolves the scope required to receive an event of the given type.
 * `pending_action.completed` requires `tool_name` in the payload.
 */
export const requiredScopeForEvent = (
  eventType: string,
  payload: Record<string, unknown>,
): string | null => {
  if (eventType === 'pending_action.completed') {
    const toolName = typeof payload.tool_name === 'string' ? payload.tool_name : null;
    if (!toolName) return null;
    return PENDING_ACTION_TOOL_SCOPE[toolName] ?? null;
  }
  return EVENT_TYPE_SCOPE_MAP[eventType] ?? null;
};

export const McpEventWireSchema = z.object({
  event_id: z.number().int().positive(),
  event_type: z.string().min(1).max(128),
  practice_id: z.string().min(1).max(128),
  payload: z.record(z.string(), z.unknown()),
  created_at: z.string(),
});
export type McpEventWire = z.infer<typeof McpEventWireSchema>;

export const McpEventBatchSchema = z.object({
  events: z.array(McpEventWireSchema).min(1).max(500),
});
export type McpEventBatch = z.infer<typeof McpEventBatchSchema>;

export interface FanOutResult {
  event_id: number;
  delivered_to: number;
  skipped_no_scope: number;
  skipped_no_session: boolean;
  errors: number;
}

/**
 * Fan a single validated event to every active session for the practice
 * whose scopes cover the event class.
 *
 * Errors per session are counted but never thrown — at-least-once
 * delivery means individual failures are recoverable on the next ingest
 * (Backend dispatcher retries on 5xx, DO replay buffer dedupes via
 * event_id PK).
 */
export const fanOutEventToSessions = async (
  env: Env,
  event: McpEventWire,
): Promise<FanOutResult> => {
  const store = new MCPSessionStore(env);
  const sessions = await store.listByPractice(event.practice_id);
  if (sessions.length === 0) {
    return {
      event_id: event.event_id,
      delivered_to: 0,
      skipped_no_scope: 0,
      skipped_no_session: true,
      errors: 0,
    };
  }

  const requiredScope = requiredScopeForEvent(event.event_type, event.payload);
  if (!requiredScope) {
    return {
      event_id: event.event_id,
      delivered_to: 0,
      skipped_no_scope: sessions.length,
      skipped_no_session: false,
      errors: 1,
    };
  }

  let delivered = 0;
  let skipped = 0;
  let errors = 0;
  await Promise.all(
    sessions.map(async (session: MCPSessionRecord) => {
      if (!session.scopes.includes(requiredScope)) {
        skipped += 1;
        return;
      }
      try {
        const stub = env.MCP_SESSION.get(env.MCP_SESSION.idFromName(session.session_id));
        const doRequest = new Request('https://mcp-do/internal/event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event_id: event.event_id,
            event_type: event.event_type,
            payload: event.payload,
          }),
        });
        const response = (await stub.fetch(
          doRequest as unknown as WorkerRequest,
        )) as unknown as Response;
        if (response.status === 200) {
          delivered += 1;
        } else {
          errors += 1;
        }
      } catch {
        errors += 1;
      }
    }),
  );

  return {
    event_id: event.event_id,
    delivered_to: delivered,
    skipped_no_scope: skipped,
    skipped_no_session: false,
    errors,
  };
};
