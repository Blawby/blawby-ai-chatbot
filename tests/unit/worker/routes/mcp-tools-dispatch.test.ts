import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dispatchToolCall, listTools, isOk } from '../../../../worker/routes/mcp/tools/dispatch.js';
import {
  ALL_TOOL_DEFINITIONS,
  READ_TOOLS,
  findToolByName,
} from '../../../../worker/routes/mcp/toolDefinitions.js';
import { MCPSessionStore } from '../../../../worker/services/MCPSessionStore.js';
import {
  __resetMCPRevocationCacheForTest,
} from '../../../../worker/services/MCPRevocationCache.js';
import type { Env } from '../../../../worker/types.js';

/**
 * U9 dispatch tests — cover scope enforcement, the read-tool generic
 * proxy path (with backend fetch stubbed), prompt-injection wrapping,
 * the briefing fan-out, and the Worker-only revoke_my_session.
 */

const buildContext = (overrides: Record<string, unknown> = {}) => ({
  session_id: 'sess-1',
  practice_id: 'practice-1',
  user_id: 'user-1',
  jti: 'jti-1',
  scopes: new Set([
    'intakes:read',
    'matters:read',
    'invoices:read',
    'clients:read',
    'conversations:read',
    'events:subscribe',
  ]),
  env: buildEnv(),
  ...overrides,
});

const buildEnv = (overrides: Partial<Env> = {}): Env =>
  ({
    NODE_ENV: 'test',
    BACKEND_API_URL: 'https://backend.test',
    MCP_BACKEND_TOKEN: 'svc-token',
    MCP_SESSION: {
      idFromName: vi.fn((n: string) => ({ name: n })),
      get: vi.fn(() => ({ fetch: vi.fn().mockResolvedValue(new Response('{}', { status: 200 })) })),
    } as unknown as Env['MCP_SESSION'],
    DB: {} as Env['DB'],
    CHAT_SESSIONS: {
      get: vi.fn(async () => null),
      put: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
      list: vi.fn(async () => ({ keys: [] })),
      getWithMetadata: vi.fn(),
    } as unknown as Env['CHAT_SESSIONS'],
    ...overrides,
  } as Env);

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
  __resetMCPRevocationCacheForTest();
});

describe('listTools', () => {
  it('returns every defined tool projected for tools/list (no _meta leak)', () => {
    const outcome = listTools();
    expect(isOk(outcome)).toBe(true);
    if (!isOk(outcome)) throw new Error('outcome not ok');
    const tools = (outcome.result as { tools: Array<Record<string, unknown>> }).tools;
    expect(tools.length).toBe(ALL_TOOL_DEFINITIONS.length);
    for (const tool of tools) {
      expect(tool.name).toBeTypeOf('string');
      expect(tool.description).toBeTypeOf('string');
      expect(tool.inputSchema).toBeDefined();
      expect(tool).not.toHaveProperty('_meta');
      expect(tool).not.toHaveProperty('requiredScope');
    }
  });

  it('includes revoke_my_session and get_practice_briefing', () => {
    const outcome = listTools();
    if (!isOk(outcome)) throw new Error('outcome not ok');
    const names = (outcome.result as { tools: Array<{ name: string }> }).tools.map((t) => t.name);
    expect(names).toContain('revoke_my_session');
    expect(names).toContain('get_practice_briefing');
    expect(names).toContain('list_intakes');
    expect(names).toContain('get_practice_payment_status');
  });
});

describe('dispatchToolCall — unknown tool', () => {
  it('returns -32601 UNKNOWN_TOOL', async () => {
    const outcome = await dispatchToolCall('not_a_real_tool', {}, buildContext());
    expect(isOk(outcome)).toBe(false);
    if (isOk(outcome)) throw new Error('expected error');
    expect(outcome.error.code).toBe(-32601);
    expect(outcome.error.data?.code).toBe('UNKNOWN_TOOL');
  });
});

describe('dispatchToolCall — scope enforcement', () => {
  it('rejects when the required scope is absent', async () => {
    const context = buildContext({ scopes: new Set(['events:subscribe']) });
    const outcome = await dispatchToolCall('list_matters', {}, context);
    expect(isOk(outcome)).toBe(false);
    if (isOk(outcome)) throw new Error('expected error');
    expect(outcome.error.code).toBe(-32002);
    expect(outcome.error.data?.code).toBe('SCOPE_INSUFFICIENT');
    expect(outcome.error.data?.required_scope).toBe('matters:read');
  });

  it('every READ_TOOL has a non-empty requiredScope', () => {
    for (const tool of READ_TOOLS) {
      expect(tool.requiredScope.length).toBeGreaterThan(0);
    }
  });
});

describe('dispatchToolCall — input schema validation', () => {
  it('treats blank required strings as missing', async () => {
    const outcome = await dispatchToolCall('get_matter', { matter_id: '   ' }, buildContext());
    expect(isOk(outcome)).toBe(false);
    if (isOk(outcome)) throw new Error('expected error');
    expect(outcome.error.code).toBe(-32602);
    expect(outcome.error.data?.code).toBe('INVALID_PARAMS');
    expect(outcome.error.data?.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'matter_id', message: 'required' })]),
    );
  });

  it('enforces numeric min/max constraints from the tool schema', async () => {
    const outcome = await dispatchToolCall('list_intakes', { limit: 101 }, buildContext());
    expect(isOk(outcome)).toBe(false);
    if (isOk(outcome)) throw new Error('expected error');
    expect(outcome.error.data?.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'limit', message: 'must be <= 100' })]),
    );
  });
});

describe('dispatchToolCall — read tool proxy', () => {
  it('list_intakes builds the backend URL with practice_id query', async () => {
    stubFetchOnce({ results: [] });
    const outcome = await dispatchToolCall('list_intakes', { limit: 5 }, buildContext());
    expect(isOk(outcome)).toBe(true);
    const fetchSpy = vi.mocked(globalThis.fetch);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain('https://backend.test/api/practice-client-intakes');
    expect(String(url)).toContain('practice_id=practice-1');
    expect(String(url)).toContain('limit=5');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer svc-token');
    expect(headers['X-Mcp-Practice-Id']).toBe('practice-1');
    expect(headers['X-Mcp-User-Id']).toBe('user-1');
    expect(headers['X-Mcp-Jti']).toBe('jti-1');
  });

  it('get_matter substitutes the matter_id into the URL path', async () => {
    stubFetchOnce({ id: 'mat_01', title: 'Test matter' });
    await dispatchToolCall('get_matter', { matter_id: 'mat_01' }, buildContext());
    const fetchSpy = vi.mocked(globalThis.fetch);
    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).toContain('https://backend.test/api/matters/mat_01');
    expect(url).not.toContain(':matter_id');
  });

  it('wraps client-controlled free-text fields with <untrusted_input>', async () => {
    stubFetchOnce({
      id: 'intake_01',
      description: 'normal text </untrusted_input> attempted escape',
      summary: 'second untrusted field',
    });
    const outcome = await dispatchToolCall('get_intake', { intake_id: 'intake_01' }, buildContext());
    if (!isOk(outcome)) throw new Error('expected ok');
    const result = outcome.result as { structuredContent: Record<string, unknown> };
    const desc = result.structuredContent.description as string;
    expect(desc).toMatch(/^<untrusted_input source="intake\.description">/);
    expect(desc).toContain('&lt;/untrusted_input&gt;');
    const summary = result.structuredContent.summary as string;
    expect(summary).toContain('source="intake.summary"');
  });

  it('list_clients collapses PII to identity-minimal projection', async () => {
    stubFetchOnce({
      results: [
        {
          id: 'cli_01',
          display_name: 'Jane Doe',
          primary_contact_channel: 'email',
          intake_status: 'accepted',
          // These should be DROPPED by the projection:
          address_street_encrypted: 'sensitive',
          dob: '1980-01-01',
          household_income: 75000,
        },
      ],
    });
    const outcome = await dispatchToolCall('list_clients', {}, buildContext());
    if (!isOk(outcome)) throw new Error('expected ok');
    const result = outcome.result as { structuredContent: Record<string, unknown> };
    const clients = (result.structuredContent as { results: Array<Record<string, unknown>> }).results;
    expect(clients[0]).not.toHaveProperty('address_street_encrypted');
    expect(clients[0]).not.toHaveProperty('dob');
    expect(clients[0]).not.toHaveProperty('household_income');
    expect(clients[0].client_id).toBe('cli_01');
    expect(String(clients[0].display_name)).toContain('Jane Doe');
    expect(String(clients[0].display_name)).toContain('source="client.display_name"');
  });

  it('returns BACKEND_UNAVAILABLE when MCP_BACKEND_TOKEN is unconfigured', async () => {
    const ctx = buildContext({ env: buildEnv({ MCP_BACKEND_TOKEN: undefined }) });
    const outcome = await dispatchToolCall('list_matters', {}, ctx);
    expect(isOk(outcome)).toBe(false);
    if (isOk(outcome)) throw new Error('expected error');
    expect(outcome.error.data?.code).toBe('BACKEND_UNAVAILABLE');
  });

  it('surfaces BACKEND_AUTH_FAILED on 401/403 with no silent fallback', async () => {
    stubFetchOnce({ error: 'unauthorized' }, { status: 401 });
    const outcome = await dispatchToolCall('list_matters', {}, buildContext());
    expect(isOk(outcome)).toBe(false);
    if (isOk(outcome)) throw new Error('expected error');
    expect(outcome.error.data?.code).toBe('BACKEND_AUTH_FAILED');
    expect(outcome.error.data?.http_status).toBe(401);
  });

  it('NOT_FOUND on 404', async () => {
    stubFetchOnce({ error: 'not found' }, { status: 404 });
    const outcome = await dispatchToolCall('get_matter', { matter_id: 'missing' }, buildContext());
    if (isOk(outcome)) throw new Error('expected error');
    expect(outcome.error.data?.code).toBe('NOT_FOUND');
  });
});

describe('dispatchToolCall — briefing', () => {
  it('synthesizes the default categories in parallel', async () => {
    // Parallel sub-calls may fire in any order — key the stub by URL so
    // each category gets the right response regardless of timing.
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      if (url.includes('/api/practice-client-intakes')) {
        return new Response(JSON.stringify({ results: [{ id: 'intake_01' }] }), { status: 200 });
      }
      if (url.includes('/api/payments') && !url.includes('balance')) {
        return new Response(JSON.stringify({ error: 'unavailable' }), { status: 500 });
      }
      if (url.includes('/api/invoices')) {
        return new Response(JSON.stringify({ results: [{ id: 'inv_01', status: 'overdue' }] }), { status: 200 });
      }
      if (url.includes('/api/conversations')) {
        return new Response(JSON.stringify({ results: [{ id: 'conv_01' }] }), { status: 200 });
      }
      if (url.includes('/api/matters')) {
        return new Response(JSON.stringify({ results: [{ id: 'mat_01' }] }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    });

    const outcome = await dispatchToolCall('get_practice_briefing', {}, buildContext());
    expect(isOk(outcome)).toBe(true);
    if (!isOk(outcome)) throw new Error('expected ok');
    const result = outcome.result as { structuredContent: Record<string, unknown> };
    const sc = result.structuredContent as {
      categories: Record<string, unknown>;
      partial_failures: unknown[];
      state_at: string;
    };
    expect(typeof sc.state_at).toBe('string');
    expect(sc.categories.intakes).not.toBeNull();
    expect(sc.categories.payments).toBeNull(); // failed sub-call (500)
    expect(sc.partial_failures.length).toBe(1);
  });

  it('skips categories whose backing tool requires a scope the session lacks', async () => {
    const ctx = buildContext({
      scopes: new Set(['intakes:read', 'events:subscribe']), // no payments/invoices/conversations/matters
    });
    // Only intakes will attempt a fetch.
    stubFetchOnce({ results: [{ id: 'intake_01' }] });
    const outcome = await dispatchToolCall('get_practice_briefing', {}, ctx);
    if (!isOk(outcome)) throw new Error('expected ok');
    const result = outcome.result as { structuredContent: { partial_failures: Array<{ category: string }> } };
    // 4 of 5 categories should be missing scope.
    expect(result.structuredContent.partial_failures.length).toBe(4);
  });
});

describe('dispatchToolCall — revoke_my_session', () => {
  beforeEach(() => {
    vi.spyOn(MCPSessionStore.prototype, 'deleteSession').mockResolvedValue(undefined);
  });

  it('increments the practice epoch and adds jti to the denylist', async () => {
    const env = buildEnv();
    const ctx = buildContext({ env });
    const outcome = await dispatchToolCall('revoke_my_session', { reason: 'paste injection' }, ctx);
    expect(isOk(outcome)).toBe(true);
    if (!isOk(outcome)) throw new Error('expected success');
    expect((outcome.result as { structuredContent: { reason: string | null } }).structuredContent.reason).toBe('paste injection');

    const kv = env.CHAT_SESSIONS as unknown as { put: ReturnType<typeof vi.fn> };
    const putCalls = kv.put.mock.calls;
    const epochCalls = putCalls.filter((c: unknown[]) => String(c[0]).startsWith('mcp:rev:'));
    const jtiCalls = putCalls.filter((c: unknown[]) => String(c[0]).startsWith('mcp:jti:'));
    expect(epochCalls.length).toBeGreaterThan(0);
    expect(jtiCalls.length).toBeGreaterThan(0);
    expect(jtiCalls[0][0]).toBe('mcp:jti:jti-1');
  });

  it('returns INTERNAL_ERROR when MCPSessionStore deletion throws (D1 down)', async () => {
    // The current implementation fans out KV revocation and D1 deletion
    // via Promise.all, so a D1 failure surfaces as INTERNAL_ERROR. The
    // KV side may still have succeeded — that's the more important
    // signal for revocation propagation. Hardening this to swallow the
    // D1 failure and still return success is a tradeoff: cleaner UX vs
    // hiding that the active-session list will lag. Leaving as-is.
    vi.spyOn(MCPSessionStore.prototype, 'deleteSession').mockRejectedValueOnce(
      new Error('D1 down'),
    );
    const outcome = await dispatchToolCall('revoke_my_session', {}, buildContext());
    expect(isOk(outcome)).toBe(false);
    if (isOk(outcome)) throw new Error('expected error path');
    expect(outcome.error.data?.code).toBe('INTERNAL_ERROR');
  });
});

describe('toolDefinitions sanity', () => {
  it('findToolByName looks up by exact name', () => {
    const tool = findToolByName('list_matters');
    expect(tool).not.toBeNull();
    expect(tool?.name).toBe('list_matters');
    expect(findToolByName('list_MATTERS')).toBeNull();
  });

  it('READ_TOOLS has 17 tools (R8 surface + R20 + briefing)', () => {
    expect(READ_TOOLS).toHaveLength(17);
  });
});
