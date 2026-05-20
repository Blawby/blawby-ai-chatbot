import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dispatchToolCall, isOk } from '../../../../worker/routes/mcp/tools/dispatch.js';
import { HIGH_RISK_TOOLS } from '../../../../worker/routes/mcp/toolDefinitions.js';
import type { Env } from '../../../../worker/types.js';

/**
 * U11 — high-risk write tools.
 *
 * Covers: catalog completeness, scope enforcement, return-shape (pending
 * action id + approval URL, NEVER executes), 60s bucket idempotency,
 * trust-account refusal propagation (R16), backend pending field
 * validation.
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
  scopes: new Set(['invoices:send', 'payments:refund', 'events:subscribe']),
  env: buildEnv(),
  tool_call_seq: 11,
  ...overrides,
});

const sampleInvoiceArgs = {
  matter_id: 'mat_01',
  client_id: 'cli_01',
  line_items: [
    { description: 'Consultation', quantity: 1, unit_amount_cents: 20000 },
  ],
};

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

describe('HIGH_RISK_TOOLS catalog', () => {
  it('lists exactly the 3 money tools called out in R10', () => {
    const names = HIGH_RISK_TOOLS.map((t) => t.name).sort();
    expect(names).toEqual(['record_payment', 'refund_payment', 'send_invoice']);
  });

  it('every high-risk tool routes through the same backend pending-actions endpoint', () => {
    for (const tool of HIGH_RISK_TOOLS) {
      expect(tool._meta.risk_tier).toBe('high_risk');
      expect(tool._meta.backend_method).toBe('POST');
      expect(tool._meta.backend_path).toBe('/api/pending-actions');
    }
  });

  it('send_invoice and record_payment require invoices:send; refund_payment requires payments:refund', () => {
    expect(HIGH_RISK_TOOLS.find((t) => t.name === 'send_invoice')?.requiredScope).toBe('invoices:send');
    expect(HIGH_RISK_TOOLS.find((t) => t.name === 'record_payment')?.requiredScope).toBe('invoices:send');
    expect(HIGH_RISK_TOOLS.find((t) => t.name === 'refund_payment')?.requiredScope).toBe('payments:refund');
  });
});

describe('dispatchToolCall — high-risk — scope', () => {
  it('rejects send_invoice without invoices:send', async () => {
    const ctx = buildContext({ scopes: new Set(['invoices:read', 'events:subscribe']) });
    const outcome = await dispatchToolCall('send_invoice', sampleInvoiceArgs, ctx);
    if (isOk(outcome)) throw new Error('expected error');
    expect(outcome.error.data?.code).toBe('SCOPE_INSUFFICIENT');
    expect(outcome.error.data?.required_scope).toBe('invoices:send');
  });
});

describe('dispatchToolCall — high-risk — happy path', () => {
  it('send_invoice returns pending_action_id + approval_url and does NOT execute', async () => {
    stubFetchOnce({
      pending_action_id: 'pa_01',
      approval_url: 'https://app.blawby.com/approve/eyJhbGc...',
      expires_at: '2026-05-20T13:00:00.000Z',
    });
    const outcome = await dispatchToolCall('send_invoice', sampleInvoiceArgs, buildContext());
    expect(isOk(outcome)).toBe(true);
    if (!isOk(outcome)) throw new Error('expected ok');
    const result = outcome.result as { content: unknown[]; structuredContent: Record<string, unknown>; _meta: Record<string, unknown> };
    expect(result.structuredContent.pending_action_id).toBe('pa_01');
    expect(result.structuredContent.approval_url).toContain('approve');
    expect(result._meta.risk_tier).toBe('high_risk');
    expect(result._meta.idempotency_key).toMatch(/^[0-9a-f]{64}$/);

    // The fetch body must include the tool_name + tool_params so backend
    // knows what action this pending entry stands for.
    const fetchSpy = vi.mocked(globalThis.fetch);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe('https://backend.test/api/pending-actions');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.tool_name).toBe('send_invoice');
    expect(body.tool_params).toEqual(sampleInvoiceArgs);
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toMatch(/^[0-9a-f]{64}$/);
  });

  it('refund_payment returns the same pending-action envelope', async () => {
    stubFetchOnce({
      pending_action_id: 'pa_02',
      approval_url: 'https://app.blawby.com/approve/zzz',
      expires_at: '2026-05-20T13:30:00.000Z',
    });
    const outcome = await dispatchToolCall(
      'refund_payment',
      { payment_id: 'pi_xyz', amount_cents: 5000, reason: 'duplicate charge' },
      buildContext(),
    );
    if (!isOk(outcome)) throw new Error('expected ok');
    const result = outcome.result as { _meta: Record<string, unknown> };
    expect(result._meta.tool).toBe('refund_payment');
    expect(result._meta.pending_action_id).toBe('pa_02');
  });
});

describe('dispatchToolCall — high-risk — TRUST_ACCOUNT refusal (R16)', () => {
  it('propagates TRUST_ACCOUNT_NOT_SUPPORTED verbatim with no pending action created', async () => {
    stubFetchOnce(
      {
        code: 'TRUST_ACCOUNT_NOT_SUPPORTED',
        description: 'Matter mat_01 is flagged trust-account; use the web UI.',
      },
      { status: 422 },
    );
    const outcome = await dispatchToolCall('send_invoice', sampleInvoiceArgs, buildContext());
    expect(isOk(outcome)).toBe(false);
    if (isOk(outcome)) throw new Error('expected error');
    expect(outcome.error.data?.code).toBe('TRUST_ACCOUNT_NOT_SUPPORTED');
    expect(outcome.error.data?.retryable).toBe(false);
    expect(outcome.error.message).toContain('mat_01');
  });

  it('falls back to IDEMPOTENCY_KEY_MISMATCH on plain 422 (no trust-account code)', async () => {
    stubFetchOnce({ code: 'OTHER', description: 'something else' }, { status: 422 });
    const outcome = await dispatchToolCall('send_invoice', sampleInvoiceArgs, buildContext());
    if (isOk(outcome)) throw new Error('expected error');
    expect(outcome.error.data?.code).toBe('IDEMPOTENCY_KEY_MISMATCH');
  });
});

describe('dispatchToolCall — high-risk — idempotency bucket', () => {
  it('two identical calls within the same minute reuse the idempotency key', async () => {
    stubFetchOnce({
      pending_action_id: 'pa_01',
      approval_url: 'https://app.blawby.com/approve/xxx',
    });
    stubFetchOnce({
      pending_action_id: 'pa_01',
      approval_url: 'https://app.blawby.com/approve/xxx',
    });
    const ctx = buildContext();
    await dispatchToolCall('send_invoice', sampleInvoiceArgs, ctx);
    await dispatchToolCall('send_invoice', sampleInvoiceArgs, ctx);
    const fetchSpy = vi.mocked(globalThis.fetch);
    const k1 = ((fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<string, string>)[
      'Idempotency-Key'
    ];
    const k2 = ((fetchSpy.mock.calls[1][1] as RequestInit).headers as Record<string, string>)[
      'Idempotency-Key'
    ];
    // Both calls happen within ms of each other — same wall-clock bucket
    // → same key. Backend will return the cached create-pending response.
    expect(k1).toBe(k2);
  });
});

describe('dispatchToolCall — high-risk — error envelopes', () => {
  it('BACKEND_MALFORMED when backend returns success but missing pending_action_id', async () => {
    stubFetchOnce({ approval_url: 'https://...' /* no pending_action_id */ });
    const outcome = await dispatchToolCall('send_invoice', sampleInvoiceArgs, buildContext());
    if (isOk(outcome)) throw new Error('expected error');
    expect(outcome.error.data?.code).toBe('BACKEND_MALFORMED');
  });

  it('IDEMPOTENCY_IN_FLIGHT on backend 409', async () => {
    stubFetchOnce({ error: 'in flight' }, { status: 409 });
    const outcome = await dispatchToolCall('send_invoice', sampleInvoiceArgs, buildContext());
    if (isOk(outcome)) throw new Error('expected error');
    expect(outcome.error.data?.code).toBe('IDEMPOTENCY_IN_FLIGHT');
  });

  it('BACKEND_UNAVAILABLE when MCP_BACKEND_TOKEN is unset', async () => {
    const ctx = buildContext({ env: buildEnv({ MCP_BACKEND_TOKEN: undefined }) });
    const outcome = await dispatchToolCall('send_invoice', sampleInvoiceArgs, ctx);
    if (isOk(outcome)) throw new Error('expected error');
    expect(outcome.error.data?.code).toBe('BACKEND_UNAVAILABLE');
  });

  it('CONFIG_MISSING when IDEMPOTENCY_SALT is unset', async () => {
    const ctx = buildContext({ env: buildEnv({ IDEMPOTENCY_SALT: undefined }) });
    const outcome = await dispatchToolCall('send_invoice', sampleInvoiceArgs, ctx);
    if (isOk(outcome)) throw new Error('expected error');
    expect(outcome.error.data?.code).toBe('CONFIG_MISSING');
  });
});
