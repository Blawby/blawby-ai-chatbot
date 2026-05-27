import type { Request as WorkerRequest } from '@cloudflare/workers-types';
import type { Env } from '../../types.js';
import { McpEventBatchSchema, fanOutEventToSessions } from '../../services/MCPEventBus.js';

/**
 * MCP route handlers — U6 scaffolding.
 *
 * Plan: docs/plans/2026-05-15-002-feat-blawby-mcp-agent-surface-plan.md.
 *
 * Routes registered here:
 *
 *   POST   /api/mcp                            — JSON-RPC client->server (Streamable HTTP)
 *   GET    /api/mcp/ws                         — WebSocket upgrade (server-push, hibernating)
 *   DELETE /api/mcp                            — explicit session termination
 *   POST   /api/mcp/internal/events            — Backend->Worker event ingest (U8 plugs in real auth)
 *   GET    /.well-known/oauth-protected-resource — RFC 9728 protected-resource metadata
 *
 * Auth surface (U7's `withMCPAuth`) is NOT yet attached. Until U7 lands,
 * routes pass identity headers (X-Mcp-Practice-Id, X-Mcp-User-Id, X-Mcp-Jti,
 * X-Mcp-Scopes) straight through to the DO; the DO's `/initialize` handler
 * rejects requests without them. Without those headers (e.g., a real
 * unauthenticated request from Claude Desktop in production), initialize
 * returns JSON-RPC error -32001 — effectively unreachable without backend
 * authorization, matching the plan's "default off" posture.
 *
 * U8 will replace the 501 from /api/mcp/internal/events with HMAC+bearer
 * dual-factor auth and real fan-out logic; the DO already accepts the event
 * shape via its `/internal/event` handler.
 */

const MCP_SESSION_HEADER = 'Mcp-Session-Id';
const MCP_PROTOCOL_HEADER = 'Mcp-Protocol-Version';

const SCOPES_SUPPORTED = [
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
] as const;

const SESSION_ID_PATTERN = /^[a-f0-9-]{8,64}$/i;

/**
 * Validates the Origin header per the MCP spec's DNS rebinding mitigation.
 * Native MCP clients (Claude Desktop) don't send Origin; allow those.
 * Browser-based clients must match the ALLOWED_WS_ORIGINS allowlist used
 * elsewhere for WebSocket routes.
 */
const isMcpOriginAllowed = (origin: string | null, env: Env): boolean => {
  if (!origin) return true;
  const allowlist = (env.ALLOWED_WS_ORIGINS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (allowlist.length === 0) {
    // No allowlist configured — only permit in dev to avoid silent prod
    // exposure. Mirrors ChatRoom.isOriginAllowed.
    return env.NODE_ENV !== 'production';
  }
  return allowlist.includes(origin);
};

const getResourceMetadataUrl = (request: Request, env: Env): string => {
  if (env.MCP_BACKEND_AUDIENCE) {
    try {
      return `${new URL(env.MCP_BACKEND_AUDIENCE).origin}/.well-known/oauth-protected-resource`;
    } catch {
      // Malformed audience — fall through to request origin.
    }
  }
  return `${new URL(request.url).origin}/.well-known/oauth-protected-resource`;
};

const unauthorizedResponse = (request: Request, env: Env, message = 'Unauthorized'): Response =>
  new Response(JSON.stringify({ error: message, errorCode: 'UNAUTHORIZED' }), {
    status: 401,
    headers: {
      'Content-Type': 'application/json',
      'WWW-Authenticate': `Bearer realm="${env.MCP_BACKEND_AUDIENCE ?? 'mcp.blawby.com'}", resource_metadata="${getResourceMetadataUrl(request, env)}"`,
    },
  });

const isValidSessionId = (value: string | null): value is string => {
  return typeof value === 'string' && SESSION_ID_PATTERN.test(value);
};

/**
 * Forwards relevant headers to the DO. Identity headers are passed through
 * verbatim — U7's withMCPAuth populates them from the validated JWT; until
 * then the DO's initialize handler hard-fails when they're missing.
 */
const buildDoRequest = (
  url: string,
  request: Request,
  init?: { method?: string; body?: BodyInit | null },
): Request => {
  const headers = new Headers();
  // Pass through identity headers (set by withMCPAuth).
  for (const name of ['X-Mcp-Practice-Id', 'X-Mcp-User-Id', 'X-Mcp-Jti', 'X-Mcp-Scopes']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  // Pass through MCP transport headers.
  for (const name of [
    'Mcp-Protocol-Version',
    'Mcp-Session-Id',
    'Last-Event-ID',
    'Upgrade',
    'Connection',
    'Sec-WebSocket-Key',
    'Sec-WebSocket-Version',
    'Sec-WebSocket-Protocol',
    'Sec-WebSocket-Extensions',
  ]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Request(url, {
    method: init?.method ?? request.method,
    headers,
    body: init?.body ?? null,
  });
};

export async function handleMcp(request: Request, env: Env): Promise<Response> {
  if (!isMcpOriginAllowed(request.headers.get('Origin'), env)) {
    return new Response('Forbidden', { status: 403 });
  }

  const sessionHeader = request.headers.get(MCP_SESSION_HEADER);

  if (request.method === 'POST') {
    if (!sessionHeader) {
      // Initialize: new session. Generate a session id and route to a fresh
      // DO instance.
      const sessionId = crypto.randomUUID();
      const stub = env.MCP_SESSION.get(env.MCP_SESSION.idFromName(sessionId));
      const bodyText = await request.text();
      const doRequest = buildDoRequest('https://mcp-do/initialize', request, {
        method: 'POST',
        body: bodyText,
      });
      doRequest.headers.set('Content-Type', 'application/json');
      const response = (await stub.fetch(
        doRequest as unknown as WorkerRequest,
      )) as unknown as Response;
      // If the DO accepted the initialize call, propagate the session id back
      // in the response header. The DO emits its own Mcp-Session-Id (derived
      // from its DurableObjectId) — prefer the one we created here so the
      // header stays consistent with the path we used to look the DO up.
      if (response.status === 200) {
        const newHeaders = new Headers(response.headers);
        newHeaders.set(MCP_SESSION_HEADER, sessionId);
        return new Response(response.body, {
          status: response.status,
          headers: newHeaders,
        });
      }
      return response;
    }

    if (!isValidSessionId(sessionHeader)) {
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32600, message: 'Invalid Mcp-Session-Id header' },
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const stub = env.MCP_SESSION.get(env.MCP_SESSION.idFromName(sessionHeader));
    const bodyText = await request.text();
    const doRequest = buildDoRequest('https://mcp-do/rpc', request, {
      method: 'POST',
      body: bodyText,
    });
    doRequest.headers.set('Content-Type', 'application/json');
    return (await stub.fetch(doRequest as unknown as WorkerRequest)) as unknown as Response;
  }

  if (request.method === 'DELETE') {
    if (!isValidSessionId(sessionHeader)) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid Mcp-Session-Id header' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }
    const stub = env.MCP_SESSION.get(env.MCP_SESSION.idFromName(sessionHeader));
    const doRequest = buildDoRequest('https://mcp-do/terminate', request, { method: 'DELETE' });
    return (await stub.fetch(doRequest as unknown as WorkerRequest)) as unknown as Response;
  }

  return new Response('Method not allowed', { status: 405 });
}

export async function handleMcpWebSocket(request: Request, env: Env): Promise<Response> {
  if (!isMcpOriginAllowed(request.headers.get('Origin'), env)) {
    return new Response('Forbidden', { status: 403 });
  }
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
    return new Response('Expected WebSocket upgrade', { status: 426 });
  }
  const sessionHeader = request.headers.get(MCP_SESSION_HEADER);
  if (!isValidSessionId(sessionHeader)) {
    return unauthorizedResponse(request, env, 'Missing or invalid Mcp-Session-Id');
  }
  const stub = env.MCP_SESSION.get(env.MCP_SESSION.idFromName(sessionHeader));
  const doRequest = buildDoRequest('https://mcp-do/ws', request, { method: 'GET' });
  return (await stub.fetch(doRequest as unknown as WorkerRequest)) as unknown as Response;
}

/**
 * Backend → Worker event ingest.
 *
 * Single-factor auth: `x-worker-secret` header matched constant-time
 * against `WORKER_EVENT_SECRET`. Backend sends this header; no HMAC,
 * no timestamp — the shared secret is the only gate.
 *
 * Body validates against `McpEventBatch` (zod). Each event is fanned
 * out to every active McpSession DO for the practice whose granted
 * scopes cover the event class. At-least-once delivery; per-session
 * dedup happens inside the DO via `event_id` PK.
 */
const constantTimeEquals = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
};

export async function handleMcpInternalEvents(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  if (!env.WORKER_EVENT_SECRET) {
    return new Response(
      JSON.stringify({ error: 'Event ingest not configured', errorCode: 'CONFIG_MISSING' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const secret = request.headers.get('x-worker-secret') ?? '';
  if (!constantTimeEquals(secret, env.WORKER_EVENT_SECRET)) {
    return new Response('Forbidden', { status: 403 });
  }

  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const batchResult = McpEventBatchSchema.safeParse(parsed);
  if (!batchResult.success) {
    return new Response(
      JSON.stringify({
        error: 'Invalid event batch',
        errorCode: 'INVALID_BATCH',
        issues: batchResult.error.issues.slice(0, 10),
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const results = await Promise.all(
    batchResult.data.events.map((event) => fanOutEventToSessions(env, event)),
  );

  return new Response(
    JSON.stringify({ accepted_count: batchResult.data.events.length, results }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

export async function handleOAuthProtectedResource(
  request: Request,
  env: Env,
): Promise<Response> {
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const url = new URL(request.url);
  const resource = env.MCP_BACKEND_AUDIENCE ?? `${url.origin}/api/mcp`;
  const backendBase = env.BACKEND_API_URL?.replace(/\/$/, '');
  const authorizationServers = backendBase ? [backendBase] : [];

  const doc = {
    resource,
    authorization_servers: authorizationServers,
    bearer_methods_supported: ['header'],
    scopes_supported: [...SCOPES_SUPPORTED],
    resource_documentation:
      'https://github.com/Blawby/blawby-ai-chatbot/blob/main/docs/plans/2026-05-15-002-feat-blawby-mcp-agent-surface-plan.md',
  };

  return new Response(JSON.stringify(doc), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      // RFC 9728 metadata is reasonably static — short TTL is enough.
      'Cache-Control': 'public, max-age=60',
    },
  });
}

export { MCP_SESSION_HEADER, MCP_PROTOCOL_HEADER, SCOPES_SUPPORTED };
