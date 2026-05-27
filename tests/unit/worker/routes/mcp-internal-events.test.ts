import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleMcpInternalEvents } from '../../../../worker/routes/mcp/index.js';
import { MCPSessionStore } from '../../../../worker/services/MCPSessionStore.js';
import type { Env } from '../../../../worker/types.js';

/**
 * Backend->Worker event ingest tests.
 *
 * Auth: single-factor `x-worker-secret` header. Covers auth, body
 * validation, scope filtering, and per-event delivery counts.
 */

const SECRET = 'worker-event-secret-test';

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
    WORKER_EVENT_SECRET: SECRET,
    MCP_SESSION: namespace as unknown as Env['MCP_SESSION'],
    DB: {} as Env['DB'],
    ...overrides,
  } as Env);

const buildEvent = (overrides: Record<string, unknown> = {}) => ({
  event_id: 42,
  event_type: 'invoice:paid',
  practice_id: 'practice-1',
  payload: { invoice_id: 'inv_01' },
  created_at: '2026-05-20T12:00:00.000Z',
  ...overrides,
});

const buildRequest = (
  body: { events: unknown[] },
  headerOverrides: Record<string, string> = {},
): Request =>
  new Request('https://mcp.test/api/mcp/internal/events', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-worker-secret': SECRET,
      ...headerOverrides,
    },
    body: JSON.stringify(body),
  });

const stubSessionList = (sessions: Parameters<typeof MCPSessionStore.prototype.listByPractice> extends infer _T ? Awaited<ReturnType<typeof MCPSessionStore.prototype.listByPractice>> : never) => {
  return vi
    .spyOn(MCPSessionStore.prototype, 'listByPractice')
    .mockResolvedValue(sessions);
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('handleMcpInternalEvents — auth', () => {
  it('rejects with 503 when WORKER_EVENT_SECRET is unconfigured', async () => {
    const env = buildEnv({ WORKER_EVENT_SECRET: undefined });
    const response = await handleMcpInternalEvents(buildRequest({ events: [buildEvent()] }), env);
    expect(response.status).toBe(503);
    const body = (await response.json()) as { errorCode: string };
    expect(body.errorCode).toBe('CONFIG_MISSING');
  });

  it('rejects 403 when x-worker-secret mismatches', async () => {
    const env = buildEnv();
    const response = await handleMcpInternalEvents(
      buildRequest({ events: [buildEvent()] }, { 'x-worker-secret': 'wrong-secret' }),
      env,
    );
    expect(response.status).toBe(403);
  });

  it('rejects 403 when x-worker-secret header is absent', async () => {
    const env = buildEnv();
    const request = new Request('https://mcp.test/api/mcp/internal/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: [buildEvent()] }),
    });
    const response = await handleMcpInternalEvents(request, env);
    expect(response.status).toBe(403);
  });
});

describe('handleMcpInternalEvents — body validation', () => {
  it('rejects 400 on malformed JSON', async () => {
    const env = buildEnv();
    const request = new Request('https://mcp.test/api/mcp/internal/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-worker-secret': SECRET,
      },
      body: 'not json {',
    });
    const response = await handleMcpInternalEvents(request, env);
    expect(response.status).toBe(400);
  });

  it('rejects 400 when events array is empty (must be at least one)', async () => {
    const env = buildEnv();
    const response = await handleMcpInternalEvents(buildRequest({ events: [] }), env);
    expect(response.status).toBe(400);
    const body = (await response.json()) as { errorCode: string };
    expect(body.errorCode).toBe('INVALID_BATCH');
  });

  it('rejects 400 when an event is missing required fields', async () => {
    const env = buildEnv();
    const bad = { event_id: 1 }; // missing event_type, practice_id, payload, created_at
    const response = await handleMcpInternalEvents(buildRequest({ events: [bad] }), env);
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
    const response = await handleMcpInternalEvents(buildRequest({ events: [buildEvent()] }), env);
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
    const response = await handleMcpInternalEvents(buildRequest({ events: [buildEvent()] }), env);
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
    const response = await handleMcpInternalEvents(buildRequest({ events: [event] }), env);
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
    const stub: FakeStub = { fetch: vi.fn().mockRejectedValue(new Error('DO unreachable')) };
    namespace.__stubs.set('broken-session', stub);
    (namespace.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (id: { name: string }) => {
        if (id.name === 'broken-session') return stub;
        return { fetch: vi.fn().mockResolvedValue(new Response('{}', { status: 200 })) };
      },
    );
    const response = await handleMcpInternalEvents(buildRequest({ events: [buildEvent()] }), env);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { results: Array<Record<string, unknown>> };
    expect(body.results[0].errors).toBe(1);
    expect(body.results[0].delivered_to).toBe(0);
  });
});
