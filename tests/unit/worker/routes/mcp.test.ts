import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleMcp,
  handleMcpWebSocket,
  handleMcpInternalEvents,
  handleOAuthProtectedResource,
  SCOPES_SUPPORTED,
} from '../../../../worker/routes/mcp/index.js';
import type { Env } from '../../../../worker/types.js';

interface FakeStub {
  fetch: ReturnType<typeof vi.fn>;
}

interface FakeNamespace {
  idFromName: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  __stub: FakeStub;
  __lastIdName?: string;
}

const buildFakeNamespace = (stubResponse: Response): FakeNamespace => {
  const stub: FakeStub = {
    fetch: vi.fn().mockResolvedValue(stubResponse),
  };
  const idFromName = vi.fn();
  const get = vi.fn(() => stub);
  const namespace: FakeNamespace = {
    idFromName: idFromName as unknown as FakeNamespace['idFromName'],
    get: get as unknown as FakeNamespace['get'],
    __stub: stub,
  };
  idFromName.mockImplementation((name: string) => {
    namespace.__lastIdName = name;
    return { name } as unknown as ReturnType<typeof idFromName>;
  });
  return namespace;
};

const buildEnv = (overrides: Partial<Env> = {}, namespace?: FakeNamespace): Env => {
  const ns = namespace ?? buildFakeNamespace(new Response('default', { status: 200 }));
  return {
    NODE_ENV: 'test',
    BACKEND_API_URL: 'https://staging-api.blawby.com',
    ALLOWED_WS_ORIGINS: 'https://local.blawby.com,http://localhost:5137',
    MCP_SESSION: ns as unknown as Env['MCP_SESSION'],
    ...overrides,
  } as Env;
};

const buildRequest = (
  method: string,
  path: string,
  init: { headers?: Record<string, string>; body?: string } = {},
): Request =>
  new Request(`https://local.blawby.com${path}`, {
    method,
    headers: init.headers,
    body: init.body,
  });

describe('handleOAuthProtectedResource', () => {
  it('returns RFC 9728 metadata with scopes from the plan', async () => {
    const env = buildEnv({ MCP_BACKEND_AUDIENCE: 'https://mcp.blawby.com/api/mcp' });
    const response = await handleOAuthProtectedResource(
      buildRequest('GET', '/.well-known/oauth-protected-resource'),
      env,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.resource).toBe('https://mcp.blawby.com/api/mcp');
    expect(body.authorization_servers).toEqual(['https://staging-api.blawby.com']);
    expect(body.bearer_methods_supported).toEqual(['header']);
    expect(body.scopes_supported).toEqual(SCOPES_SUPPORTED);
  });

  it('derives resource from request origin when MCP_BACKEND_AUDIENCE is unset', async () => {
    const env = buildEnv({ MCP_BACKEND_AUDIENCE: undefined });
    const response = await handleOAuthProtectedResource(
      buildRequest('GET', '/.well-known/oauth-protected-resource'),
      env,
    );
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.resource).toBe('https://local.blawby.com/api/mcp');
  });

  it('rejects non-GET methods', async () => {
    const env = buildEnv();
    const response = await handleOAuthProtectedResource(
      buildRequest('POST', '/.well-known/oauth-protected-resource'),
      env,
    );
    expect(response.status).toBe(405);
  });

  it('emits empty authorization_servers when BACKEND_API_URL is missing', async () => {
    const env = buildEnv({ BACKEND_API_URL: undefined });
    const response = await handleOAuthProtectedResource(
      buildRequest('GET', '/.well-known/oauth-protected-resource'),
      env,
    );
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.authorization_servers).toEqual([]);
  });
});

describe('handleMcp — initialize', () => {
  beforeEach(() => vi.resetAllMocks());

  it('routes initialize (no Mcp-Session-Id) to a new DO and tags the response with a fresh session id', async () => {
    const stubResponse = new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        result: { protocolVersion: '2025-11-25', serverInfo: { name: 'blawby-mcp' } },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
    const namespace = buildFakeNamespace(stubResponse);
    const env = buildEnv({}, namespace);

    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'Test' } },
    });

    const response = await handleMcp(
      buildRequest('POST', '/api/mcp', {
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://local.blawby.com',
          'X-Mcp-Practice-Id': 'practice-1',
          'X-Mcp-User-Id': 'user-1',
          'X-Mcp-Jti': 'jti-1',
          'X-Mcp-Scopes': 'intakes:read,events:subscribe',
        },
        body,
      }),
      env,
    );

    expect(response.status).toBe(200);
    const sessionId = response.headers.get('Mcp-Session-Id');
    expect(sessionId).toMatch(/^[a-f0-9-]{36}$/);
    // The DO id was derived from the same UUID we returned to the client.
    expect(namespace.__lastIdName).toBe(sessionId);
    // The DO received the initialize body with identity headers.
    expect(namespace.__stub.fetch).toHaveBeenCalledTimes(1);
    const doRequest = namespace.__stub.fetch.mock.calls[0][0] as Request;
    expect(doRequest.url).toBe('https://mcp-do/initialize');
    expect(doRequest.headers.get('X-Mcp-Practice-Id')).toBe('practice-1');
    expect(doRequest.headers.get('X-Mcp-Jti')).toBe('jti-1');
    expect(doRequest.headers.get('X-Mcp-Scopes')).toBe('intakes:read,events:subscribe');
  });

  it('returns 403 when Origin is foreign', async () => {
    const env = buildEnv();
    const response = await handleMcp(
      buildRequest('POST', '/api/mcp', {
        headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example.com' },
        body: '{}',
      }),
      env,
    );
    expect(response.status).toBe(403);
  });

  it('allows initialize from a native MCP client that omits Origin', async () => {
    const stubResponse = new Response(
      JSON.stringify({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2025-11-25' } }),
      { status: 200 },
    );
    const namespace = buildFakeNamespace(stubResponse);
    const env = buildEnv({}, namespace);
    const response = await handleMcp(
      buildRequest('POST', '/api/mcp', {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }),
      }),
      env,
    );
    expect(response.status).toBe(200);
  });
});

describe('handleMcp — subsequent requests', () => {
  beforeEach(() => vi.resetAllMocks());

  it('routes RPC by Mcp-Session-Id to the matching DO', async () => {
    const namespace = buildFakeNamespace(
      new Response('{"jsonrpc":"2.0","id":2,"result":{}}', { status: 200 }),
    );
    const env = buildEnv({}, namespace);
    const sessionId = '12345678-1234-1234-1234-123456789abc';
    await handleMcp(
      buildRequest('POST', '/api/mcp', {
        headers: { 'Mcp-Session-Id': sessionId, 'Content-Type': 'application/json' },
        body: '{"jsonrpc":"2.0","id":2,"method":"ping"}',
      }),
      env,
    );
    expect(namespace.__lastIdName).toBe(sessionId);
    const doRequest = namespace.__stub.fetch.mock.calls[0][0] as Request;
    expect(doRequest.url).toBe('https://mcp-do/rpc');
  });

  it('rejects subsequent POST with a malformed session id', async () => {
    const env = buildEnv();
    const response = await handleMcp(
      buildRequest('POST', '/api/mcp', {
        headers: { 'Mcp-Session-Id': 'not a session id!', 'Content-Type': 'application/json' },
        body: '{}',
      }),
      env,
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, unknown>;
    expect((body.error as { code: number }).code).toBe(-32600);
  });

  it('DELETE without a session id returns 400', async () => {
    const env = buildEnv();
    const response = await handleMcp(buildRequest('DELETE', '/api/mcp'), env);
    expect(response.status).toBe(400);
  });

  it('DELETE with a valid session id routes terminate to the DO', async () => {
    const namespace = buildFakeNamespace(
      new Response('{"success":true}', { status: 200 }),
    );
    const env = buildEnv({}, namespace);
    const sessionId = '12345678-1234-1234-1234-123456789abc';
    const response = await handleMcp(
      buildRequest('DELETE', '/api/mcp', { headers: { 'Mcp-Session-Id': sessionId } }),
      env,
    );
    expect(response.status).toBe(200);
    const doRequest = namespace.__stub.fetch.mock.calls[0][0] as Request;
    expect(doRequest.url).toBe('https://mcp-do/terminate');
  });

  it('PUT and other unsupported methods return 405', async () => {
    const env = buildEnv();
    const response = await handleMcp(buildRequest('PUT', '/api/mcp'), env);
    expect(response.status).toBe(405);
  });
});

describe('handleMcpWebSocket', () => {
  beforeEach(() => vi.resetAllMocks());

  it('requires an Upgrade: websocket header', async () => {
    const env = buildEnv();
    const response = await handleMcpWebSocket(
      buildRequest('GET', '/api/mcp/ws', {
        headers: { 'Mcp-Session-Id': '12345678-1234-1234-1234-123456789abc' },
      }),
      env,
    );
    expect(response.status).toBe(426);
  });

  it('returns 401 with WWW-Authenticate when Mcp-Session-Id is missing', async () => {
    const env = buildEnv();
    const response = await handleMcpWebSocket(
      buildRequest('GET', '/api/mcp/ws', {
        headers: { Upgrade: 'websocket' },
      }),
      env,
    );
    expect(response.status).toBe(401);
    const wwwAuth = response.headers.get('WWW-Authenticate');
    expect(wwwAuth).toContain('Bearer');
    expect(wwwAuth).toContain('resource_metadata=');
  });

  it('rejects non-GET methods with 405', async () => {
    const env = buildEnv();
    const response = await handleMcpWebSocket(buildRequest('POST', '/api/mcp/ws'), env);
    expect(response.status).toBe(405);
  });
});

describe('handleMcpInternalEvents', () => {
  // Full auth + fan-out coverage lives in mcp-internal-events.test.ts.
  // These tests are the route-table surface checks only.
  it('returns 503 CONFIG_MISSING when WORKER_EVENT_SECRET is unset', async () => {
    const env = buildEnv();
    const response = await handleMcpInternalEvents(
      buildRequest('POST', '/api/mcp/internal/events', { body: '{}' }),
      env,
    );
    expect(response.status).toBe(503);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.errorCode).toBe('CONFIG_MISSING');
  });

  it('rejects non-POST methods with 405', async () => {
    const env = buildEnv();
    const response = await handleMcpInternalEvents(
      buildRequest('GET', '/api/mcp/internal/events'),
      env,
    );
    expect(response.status).toBe(405);
  });
});

describe('SCOPES_SUPPORTED', () => {
  it('matches the R2 vocabulary from the plan (14 scopes)', () => {
    expect(SCOPES_SUPPORTED).toEqual([
      'intakes:read',
      'intakes:write',
      'matters:read',
      'matters:write',
      'invoices:read',
      'invoices:send',
      'invoices:refund',
      'clients:read',
      'conversations:read',
      'messages:send_as_practice',
      'payments:read',
      'payments:refund',
      'team:read',
      'events:subscribe',
    ]);
  });
});
