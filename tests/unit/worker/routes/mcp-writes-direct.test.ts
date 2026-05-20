import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dispatchToolCall, isOk } from '../../../../worker/routes/mcp/tools/dispatch.js';
import { DIRECT_WRITE_TOOLS } from '../../../../worker/routes/mcp/toolDefinitions.js';
import type { Env } from '../../../../worker/types.js';

/**
 * U10 — direct-execution write tools.
 *
 * Covers: scope enforcement on every direct-write tool; URL building +
 * Idempotency-Key forwarding to backend; idempotency-related error
 * codes (409 in-flight, 422 mismatch); auth/permission/validation
 * propagation; structural completeness of the catalog.
 */

const buildEnv = (overrides: Partial<Env> = {}): Env =>
  ({
    NODE_ENV: 'test',
    BACKEND_API_URL: 'https://backend.test',
    MCP_BACKEND_TOKEN: 'svc-token',
    IDEMPOTENCY_SALT: 'test-salt',
    DB: {} as Env['DB'],
    MCP_SESSION: {
      idFromName: vi.fn((n: string) => ({ name: n })),
      get: vi.fn(() => ({ fetch: vi.fn().mockResolvedValue(new Response('{}', { status: 200 })) })),
    } as unknown as Env['MCP_SESSION'],
    CHAT_SESSIONS: {} as unknown as Env['CHAT_SESSIONS'],
    ...overrides,
  } as Env);

const buildContext = (overrides: Record<string, unknown> = {}) => ({
  session_id: 'sess-1',
  practice_id: 'practice-1',
  user_id: 'user-1',
  jti: 'jti-1',
  scopes: new Set([
    'intakes:write',
    'matters:write',
    'messages:send_as_practice',
    'events:subscribe',
  ]),
  env: buildEnv(),
  tool_call_seq: 7,
  ...overrides,
});

const stubFetchOnce = (body: unknown, init: ResponseInit = { status: 200 }): void => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    }),
  );
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('DIRECT_WRITE_TOOLS catalog', () => {
  it('lists exactly the 7 tools called out in R9', () => {
    const names = DIRECT_WRITE_TOOLS.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        'add_matter_note',
        'convert_intake_to_matter',
        'log_time_entry',
        'message_client',
        'request_documents_from_client',
        'triage_intake',
        'update_matter',
      ].sort(),
    );
  });

  it('every direct-write tool requires an intakes/matters/messages scope', () => {
    for (const tool of DIRECT_WRITE_TOOLS) {
      expect(tool.requiredScope).toMatch(/^(intakes:write|matters:write|messages:send_as_practice)$/);
      expect(tool._meta.risk_tier).toBe('direct_write');
      expect(tool._meta.backend_method).toMatch(/^(POST|PATCH|PUT|DELETE)$/);
      expect(typeof tool._meta.backend_path).toBe('string');
    }
  });
});

describe('dispatchToolCall — direct writes — scope', () => {
  it('rejects when the required scope is absent', async () => {
    const ctx = buildContext({ scopes: new Set(['intakes:read', 'events:subscribe']) });
    const outcome = await dispatchToolCall('triage_intake', { intake_id: 'intake_01', decision: 'accepted' }, ctx);
    expect(isOk(outcome)).toBe(false);
    if (isOk(outcome)) throw new Error('expected error');
    expect(outcome.error.data?.code).toBe('SCOPE_INSUFFICIENT');
  });
});

describe('dispatchToolCall — direct writes — URL + headers + idempotency', () => {
  it('triage_intake POSTs to the backend with Idempotency-Key header', async () => {
    stubFetchOnce({ id: 'intake_01', triage_status: 'accepted' });
    await dispatchToolCall(
      'triage_intake',
      { intake_id: 'intake_01', decision: 'accepted', note: 'ok' },
      buildContext(),
    );
    const fetchSpy = vi.mocked(globalThis.fetch);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe('https://backend.test/api/practice-client-intakes/intake_01/triage');
    expect((init as RequestInit).method).toBe('POST');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer svc-token');
    expect(headers['X-Mcp-Practice-Id']).toBe('practice-1');
    expect(headers['Idempotency-Key']).toMatch(/^[0-9a-f]{64}$/);
    expect(headers['Content-Type']).toBe('application/json');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.decision).toBe('accepted');
    expect(body.note).toBe('ok');
    // intake_id is consumed by path substitution and NOT in body
    expect(body.intake_id).toBeUndefined();
  });

  it('add_matter_note PATH-substitutes matter_id and sends body in JSON', async () => {
    stubFetchOnce({ id: 'note_01', matter_id: 'mat_01' });
    await dispatchToolCall(
      'add_matter_note',
      { matter_id: 'mat_01', body: 'Reviewed retainer; balance OK.' },
      buildContext(),
    );
    const fetchSpy = vi.mocked(globalThis.fetch);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe('https://backend.test/api/matters/mat_01/notes');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.body).toBe('Reviewed retainer; balance OK.');
    expect(body.matter_id).toBeUndefined();
  });

  it('reuses the same Idempotency-Key for identical (practice, tool, params, session, seq)', async () => {
    stubFetchOnce({ id: 'note_01' });
    stubFetchOnce({ id: 'note_01' });
    const args = { matter_id: 'mat_01', body: 'note' };
    const ctx = buildContext();
    await dispatchToolCall('add_matter_note', args, ctx);
    await dispatchToolCall('add_matter_note', args, ctx);
    const fetchSpy = vi.mocked(globalThis.fetch);
    const k1 = ((fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<string, string>)[
      'Idempotency-Key'
    ];
    const k2 = ((fetchSpy.mock.calls[1][1] as RequestInit).headers as Record<string, string>)[
      'Idempotency-Key'
    ];
    expect(k1).toBe(k2);
  });

  it('produces a different Idempotency-Key when tool_call_seq changes', async () => {
    stubFetchOnce({});
    stubFetchOnce({});
    const args = { matter_id: 'mat_01', body: 'note' };
    await dispatchToolCall('add_matter_note', args, { ...buildContext(), tool_call_seq: 1 });
    await dispatchToolCall('add_matter_note', args, { ...buildContext(), tool_call_seq: 2 });
    const fetchSpy = vi.mocked(globalThis.fetch);
    const k1 = ((fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<string, string>)[
      'Idempotency-Key'
    ];
    const k2 = ((fetchSpy.mock.calls[1][1] as RequestInit).headers as Record<string, string>)[
      'Idempotency-Key'
    ];
    expect(k1).not.toBe(k2);
  });
});

describe('dispatchToolCall — direct writes — error envelopes', () => {
  it('IDEMPOTENCY_IN_FLIGHT on backend 409', async () => {
    stubFetchOnce({ error: 'in flight' }, { status: 409 });
    const outcome = await dispatchToolCall(
      'add_matter_note',
      { matter_id: 'mat_01', body: 'note' },
      buildContext(),
    );
    if (isOk(outcome)) throw new Error('expected error');
    expect(outcome.error.data?.code).toBe('IDEMPOTENCY_IN_FLIGHT');
    expect(outcome.error.data?.retryable).toBe(true);
    expect(outcome.error.data?.http_status).toBe(409);
  });

  it('IDEMPOTENCY_KEY_MISMATCH on backend 422', async () => {
    stubFetchOnce({ error: 'mismatch' }, { status: 422 });
    const outcome = await dispatchToolCall(
      'add_matter_note',
      { matter_id: 'mat_01', body: 'note' },
      buildContext(),
    );
    if (isOk(outcome)) throw new Error('expected error');
    expect(outcome.error.data?.code).toBe('IDEMPOTENCY_KEY_MISMATCH');
    expect(outcome.error.data?.retryable).toBe(false);
  });

  it('BACKEND_FORBIDDEN on 403 (visibility check would surface here)', async () => {
    stubFetchOnce({ error: 'conversation not visible' }, { status: 403 });
    const outcome = await dispatchToolCall(
      'message_client',
      { conversation_id: 'conv_01', body: 'hi' },
      buildContext(),
    );
    if (isOk(outcome)) throw new Error('expected error');
    expect(outcome.error.data?.code).toBe('BACKEND_FORBIDDEN');
  });

  it('BACKEND_UNAVAILABLE when MCP_BACKEND_TOKEN unset', async () => {
    const ctx = buildContext({ env: buildEnv({ MCP_BACKEND_TOKEN: undefined }) });
    const outcome = await dispatchToolCall(
      'add_matter_note',
      { matter_id: 'mat_01', body: 'note' },
      ctx,
    );
    if (isOk(outcome)) throw new Error('expected error');
    expect(outcome.error.data?.code).toBe('BACKEND_UNAVAILABLE');
  });

  it('CONFIG_MISSING when IDEMPOTENCY_SALT unset (refuse to issue salt-less key)', async () => {
    const ctx = buildContext({ env: buildEnv({ IDEMPOTENCY_SALT: undefined }) });
    const outcome = await dispatchToolCall(
      'add_matter_note',
      { matter_id: 'mat_01', body: 'note' },
      ctx,
    );
    if (isOk(outcome)) throw new Error('expected error');
    expect(outcome.error.data?.code).toBe('CONFIG_MISSING');
  });

  it('BACKEND_MALFORMED when backend returns non-JSON success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('<html>not json</html>', { status: 200, headers: { 'Content-Type': 'text/html' } }),
    );
    const outcome = await dispatchToolCall(
      'update_matter',
      { matter_id: 'mat_01', status: 'closed' },
      buildContext(),
    );
    if (isOk(outcome)) throw new Error('expected error');
    expect(outcome.error.data?.code).toBe('BACKEND_MALFORMED');
  });
});

describe('dispatchToolCall — direct writes — happy paths', () => {
  it('returns structuredContent with Idempotency-Key in _meta', async () => {
    stubFetchOnce({ id: 'note_01', body: 'Done.' });
    const outcome = await dispatchToolCall(
      'add_matter_note',
      { matter_id: 'mat_01', body: 'Done.' },
      buildContext(),
    );
    expect(isOk(outcome)).toBe(true);
    if (!isOk(outcome)) throw new Error('expected ok');
    const result = outcome.result as { _meta: Record<string, unknown>; structuredContent: Record<string, unknown> };
    expect(result._meta.tool).toBe('add_matter_note');
    expect(result._meta.idempotency_key).toMatch(/^[0-9a-f]{64}$/);
    expect(result.structuredContent.id).toBe('note_01');
  });
});
