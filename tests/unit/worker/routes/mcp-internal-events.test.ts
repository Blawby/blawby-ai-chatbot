import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleMcpInternalEvents } from '../../../../worker/routes/mcp/index.js';
import { MCPSessionStore } from '../../../../worker/services/MCPSessionStore.js';
import type { Env } from '../../../../worker/types.js';

/**
 * U8 — Backend->Worker event ingest tests.
 *
 * Covers the dual-factor auth (bearer + HMAC), timestamp skew, body
 * validation, scope filtering, and per-event delivery counts.
 *
 * The DO namespace is faked and records each fanned-out call. The
 * MCPSessionStore is spied (not stubbed against real D1) so the fan-out
 * decision tree is observable.
 */

const BEARER = 'backend-token-test-value';
const HMAC_KEY = 'hmac-secret-test-value';

interface FakeStub {
  fetch: ReturnType<typeof vi.fn>;
}
interface FakeNamespace {
  idFromName: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  __stubs: Map<string, FakeStub>;
}
const buildFakeNamespace = (): FakeNamespace => {
  const stubs = new Map<string, FakeStub>();
  const idFromName = vi.fn((name: string) => ({ name } as unknown));
  const get = vi.fn((id: { name: string }) => {
    let stub = stubs.get(id.name);
    if (!stub) {
      stub = { fetch: vi.fn().mockResolvedValue(new Response('{"success":true}', { status: 200 })) };
      stubs.set(id.name, stub);
    }
    return stub;
  });
  return {
    idFromName: idFromName as unknown as FakeNamespace['idFromName'],
    get: get as unknown as FakeNamespace['get'],
    __stubs: stubs,
  };
};

const buildEnv = (
  overrides: Partial<Env> = {},
  namespace: FakeNamespace = buildFakeNamespace(),
): Env =>
  ({
    NODE_ENV: 'test',
    MCP_BACKEND_TOKEN: BEARER,
    MCP_BACKEND_HMAC_KEY: HMAC_KEY,
    MCP_SESSION: namespace as unknown as Env['MCP_SESSION'],
    DB: {} as Env['DB'],
    ...overrides,
  } as Env);

const hex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

const signRequestBody = async (timestamp: number, body: string): Promise<string> => {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(HMAC_KEY),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${timestamp}.${body}`),
  );
  return hex(new Uint8Array(sig));
};

const buildEvent = (overrides: Record<string, unknown> = {}) => ({
  event_id: 42,
  event_type: 'invoice:paid',
  practice_id: 'practice-1',
  payload: { invoice_id: 'inv_01' },
  created_at: '2026-05-20T12:00:00.000Z',
  ...overrides,
});

const buildRequest = async (
  body: { events: unknown[] },
  headers: Partial<Record<'Authorization' | 'X-Backend-Timestamp' | 'X-Backend-Signature', string>> = {},
): Promise<Request> => {
  const bodyText = JSON.stringify(body);
  const timestamp = Date.now();
  const signature = await signRequestBody(timestamp, bodyText);
  return new Request('https://mcp.test/api/mcp/internal/events', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${BEARER}`,
      'X-Backend-Timestamp': String(timestamp),
      'X-Backend-Signature': signature,
      ...headers,
    },
    body: bodyText,
  });
};

const stubSessionList = (sessions: Parameters<typeof MCPSessionStore.prototype.listByPractice> extends infer _T ? Awaited<ReturnType<typeof MCPSessionStore.prototype.listByPractice>> : never) => {
  return vi
    .spyOn(MCPSessionStore.prototype, 'listByPractice')
    .mockResolvedValue(sessions);
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('handleMcpInternalEvents — auth factor (bearer + HMAC)', () => {
  it('rejects with 503 when MCP_BACKEND_TOKEN is unconfigured', async () => {
    const env = buildEnv({ MCP_BACKEND_TOKEN: undefined });
    const response = await handleMcpInternalEvents(await buildRequest({ events: [] }), env);
    expect(response.status).toBe(503);
  });

  it('rejects 403 when bearer mismatches', async () => {
    const env = buildEnv();
    const request = await buildRequest(
      { events: [buildEvent()] },
      { Authorization: 'Bearer wrong-bearer' },
    );
    const response = await handleMcpInternalEvents(request, env);
    expect(response.status).toBe(403);
  });

  it('rejects 400 when timestamp header is absent', async () => {
    const env = buildEnv();
    const request = await buildRequest(
      { events: [buildEvent()] },
      { 'X-Backend-Timestamp': '' },
    );
    const response = await handleMcpInternalEvents(request, env);
    expect(response.status).toBe(400);
  });

  it('rejects 403 when timestamp is older than ±60s tolerance', async () => {
    const env = buildEnv();
    const stale = Date.now() - 61_000;
    const body = JSON.stringify({ events: [buildEvent()] });
    const sig = await signRequestBody(stale, body);
    const request = new Request('https://mcp.test/api/mcp/internal/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${BEARER}`,
        'X-Backend-Timestamp': String(stale),
        'X-Backend-Signature': sig,
      },
      body,
    });
    const response = await handleMcpInternalEvents(request, env);
    expect(response.status).toBe(403);
  });

  it('rejects 403 when HMAC signature is forged', async () => {
    const env = buildEnv();
    const request = await buildRequest(
      { events: [buildEvent()] },
      { 'X-Backend-Signature': '00'.repeat(32) },
    );
    const response = await handleMcpInternalEvents(request, env);
    expect(response.status).toBe(403);
  });
});

describe('handleMcpInternalEvents — body validation', () => {
  it('rejects 400 on malformed JSON', async () => {
    const env = buildEnv();
    const bodyText = 'not json {';
    const timestamp = Date.now();
    const sig = await signRequestBody(timestamp, bodyText);
    const request = new Request('https://mcp.test/api/mcp/internal/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${BEARER}`,
        'X-Backend-Timestamp': String(timestamp),
        'X-Backend-Signature': sig,
      },
      body: bodyText,
    });
    const response = await handleMcpInternalEvents(request, env);
    expect(response.status).toBe(400);
  });

  it('rejects 400 when events array is empty (must be at least one)', async () => {
    const env = buildEnv();
    const request = await buildRequest({ events: [] });
    const response = await handleMcpInternalEvents(request, env);
    expect(response.status).toBe(400);
    const body = (await response.json()) as { errorCode: string };
    expect(body.errorCode).toBe('INVALID_BATCH');
  });

  it('rejects 400 when an event is missing required fields', async () => {
    const env = buildEnv();
    const bad = { event_id: 1 }; // missing event_type, practice_id, payload, created_at
    const request = await buildRequest({ events: [bad] });
    const response = await handleMcpInternalEvents(request, env);
    expect(response.status).toBe(400);
  });
});

describe('handleMcpInternalEvents — fan-out', () => {
  it('delivers an invoice:paid event to sessions with invoices:read scope', async () => {
    const namespace = buildFakeNamespace();
    const env = buildEnv({}, namespace);
    stubSessionList([
      {
        session_id: 'sess-with-scope',
        practice_id: 'practice-1',
        user_id: 'user-1',
        jti: 'jti-1',
        scopes: ['invoices:read'],
        protocol_version: '2025-11-25',
        client_name: null,
        last_event_id: 0,
        created_at: '2026-05-20T00:00:00.000Z',
        last_seen: '2026-05-20T00:00:00.000Z',
      },
      {
        session_id: 'sess-without-scope',
        practice_id: 'practice-1',
        user_id: 'user-2',
        jti: 'jti-2',
        scopes: ['intakes:read'],
        protocol_version: '2025-11-25',
        client_name: null,
        last_event_id: 0,
        created_at: '2026-05-20T00:00:00.000Z',
        last_seen: '2026-05-20T00:00:00.000Z',
      },
    ]);
    const response = await handleMcpInternalEvents(
      await buildRequest({ events: [buildEvent()] }),
      env,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { results: Array<Record<string, unknown>> };
    expect(body.results[0].delivered_to).toBe(1);
    expect(body.results[0].skipped_no_scope).toBe(1);
    expect(namespace.__stubs.has('sess-with-scope')).toBe(true);
    expect(namespace.__stubs.has('sess-without-scope')).toBe(false);
  });

  it('reports skipped_no_session=true when no sessions exist for the practice', async () => {
    const env = buildEnv();
    stubSessionList([]);
    const response = await handleMcpInternalEvents(
      await buildRequest({ events: [buildEvent()] }),
      env,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { results: Array<Record<string, unknown>> };
    expect(body.results[0].skipped_no_session).toBe(true);
    expect(body.results[0].delivered_to).toBe(0);
  });

  it('routes pending_action.completed scope from the embedded tool_name', async () => {
    const namespace = buildFakeNamespace();
    const env = buildEnv({}, namespace);
    stubSessionList([
      {
        session_id: 'sess-can-send-invoice',
        practice_id: 'practice-1',
        user_id: 'user-1',
        jti: 'jti-1',
        scopes: ['invoices:send'],
        protocol_version: '2025-11-25',
        client_name: null,
        last_event_id: 0,
        created_at: '2026-05-20T00:00:00.000Z',
        last_seen: '2026-05-20T00:00:00.000Z',
      },
      {
        session_id: 'sess-can-refund',
        practice_id: 'practice-1',
        user_id: 'user-2',
        jti: 'jti-2',
        scopes: ['payments:refund'],
        protocol_version: '2025-11-25',
        client_name: null,
        last_event_id: 0,
        created_at: '2026-05-20T00:00:00.000Z',
        last_seen: '2026-05-20T00:00:00.000Z',
      },
    ]);
    const event = buildEvent({
      event_type: 'pending_action.completed',
      payload: {
        pending_action_id: 'pa_01',
        tool_name: 'send_invoice',
        outcome: 'executed',
      },
    });
    const response = await handleMcpInternalEvents(
      await buildRequest({ events: [event] }),
      env,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { results: Array<Record<string, unknown>> };
    // send_invoice -> invoices:send. The refund session does NOT get it.
    expect(body.results[0].delivered_to).toBe(1);
    expect(namespace.__stubs.has('sess-can-send-invoice')).toBe(true);
    expect(namespace.__stubs.has('sess-can-refund')).toBe(false);
  });

  it('counts DO fetch errors but never throws', async () => {
    const namespace = buildFakeNamespace();
    const env = buildEnv({}, namespace);
    stubSessionList([
      {
        session_id: 'broken-session',
        practice_id: 'practice-1',
        user_id: 'user-1',
        jti: 'jti-1',
        scopes: ['invoices:read'],
        protocol_version: '2025-11-25',
        client_name: null,
        last_event_id: 0,
        created_at: '2026-05-20T00:00:00.000Z',
        last_seen: '2026-05-20T00:00:00.000Z',
      },
    ]);
    // Make the stub for this session reject.
    const stub: FakeStub = { fetch: vi.fn().mockRejectedValue(new Error('DO unreachable')) };
    namespace.__stubs.set('broken-session', stub);
    // namespace.get currently creates a fresh stub on first call — replace
    // with one that returns ours when asked for this id.
    (namespace.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (id: { name: string }) => {
        if (id.name === 'broken-session') return stub;
        return { fetch: vi.fn().mockResolvedValue(new Response('{}', { status: 200 })) };
      },
    );
    const response = await handleMcpInternalEvents(
      await buildRequest({ events: [buildEvent()] }),
      env,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { results: Array<Record<string, unknown>> };
    expect(body.results[0].errors).toBe(1);
    expect(body.results[0].delivered_to).toBe(0);
  });
});
