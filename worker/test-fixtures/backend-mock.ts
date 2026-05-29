import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import type { KeyObject } from 'crypto';

/**
 * Backend mock fixture (U6 deliverable per plan Phase 1).
 *
 * The Worker MCP stack proxies tool calls to `${BACKEND_API_URL}/...`.
 * In tests and local dogfooding we want to exercise the FULL transport
 * without spinning up the real Backend (which depends on backend U1-U5
 * landing). This fixture installs a `fetch` mock that responds to every
 * backend URL the Worker MCP code calls, with the response shape the
 * Worker expects.
 *
 * Treat this file as the contract surface — the response shapes here
 * are what backend U1-U5 must produce. When backend ships, swap the
 * mock for the real endpoint and integration tests should still pass.
 *
 * Usage:
 *   const mock = await installBackendMock();
 *   // exercise worker code...
 *   mock.uninstall();
 *
 * Capabilities:
 *   - Real RS256 keypair + JWKS at /api/auth/jwks (matches Better Auth
 *     jwt plugin convention; PR #216's well-known points here)
 *   - Mintable JWTs via `mock.mintToken(claims)` for direct withMCPAuth
 *     exercise
 *   - Replayable in-memory state for matters/intakes/invoices/etc. so
 *     a sequence of tool calls reads-its-own-writes
 *   - `mock.captureBackendCalls()` returns the list of URLs the Worker
 *     hit since installation (assertable for header forwarding,
 *     idempotency keys, etc.)
 */

import { vi } from 'vitest';

export interface MockBackendKeys {
  privateKey: KeyObject;
  publicJwk: Record<string, unknown>;
  kid: string;
}

interface MockCallRecord {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  idempotencyKey: string | null;
  timestamp: number;
}

export interface InstalledBackendMock {
  keys: MockBackendKeys;
  mintToken: (claims?: Record<string, unknown>) => Promise<string>;
  uninstall: () => void;
  captureBackendCalls: () => MockCallRecord[];
  resetCallHistory: () => void;
  /** Set a custom handler for a path. Overrides the default mock response. */
  override: (
    pattern: string | RegExp,
    handler: (input: Request, url: URL) => Promise<Response> | Response,
  ) => void;
  /** Direct access to the in-memory practice state for assertions. */
  state: MockState;
}

interface PendingAction {
  id: string;
  practice_id: string;
  tool_name: string;
  tool_params: Record<string, unknown>;
  state: 'pending' | 'approved' | 'executing' | 'executed' | 'failed' | 'expired' | 'rejected' | 'cancelled';
  approval_url: string;
  expires_at: string;
  amount_cents?: number;
  created_at: string;
}

interface MockState {
  intakes: Map<string, Record<string, unknown>>;
  matters: Map<string, Record<string, unknown>>;
  invoices: Map<string, Record<string, unknown>>;
  conversations: Map<string, Record<string, unknown>>;
  clients: Map<string, Record<string, unknown>>;
  pendingActions: Map<string, PendingAction>;
  /** Records the backend-side idempotency cache so repeats return the cached body. */
  idempotency: Map<string, { status: number; body: unknown }>;
  /** Flag a matter as trust-account so R16 refusal path can be exercised. */
  trustAccountMatters: Set<string>;
}

const newMockState = (): MockState => ({
  intakes: new Map([
    [
      'intake_seed1',
      {
        id: 'intake_seed1',
        practice_id: 'practice-1',
        triage_status: 'untriaged',
        description: 'Need a will',
        client_email: 'client@example.com',
      },
    ],
  ]),
  matters: new Map([
    [
      'mat_seed1',
      {
        id: 'mat_seed1',
        practice_id: 'practice-1',
        title: 'Estate planning — Doe',
        status: 'active',
        notes: [],
      },
    ],
  ]),
  invoices: new Map([
    [
      'inv_seed1',
      { id: 'inv_seed1', practice_id: 'practice-1', status: 'overdue', amount_cents: 50000 },
    ],
  ]),
  conversations: new Map([
    [
      'conv_seed1',
      { id: 'conv_seed1', practice_id: 'practice-1', last_message_preview: 'Hi' },
    ],
  ]),
  clients: new Map([
    [
      'cli_seed1',
      {
        id: 'cli_seed1',
        practice_id: 'practice-1',
        display_name: 'Jane Doe',
        primary_contact_channel: 'email',
        intake_status: 'accepted',
        // Defense-in-depth: backend would expose PII fields here; the
        // worker is responsible for projecting them out per R19.
        dob: '1980-01-01',
        address_street_encrypted: 'secret',
        household_income: 75000,
      },
    ],
  ]),
  pendingActions: new Map(),
  idempotency: new Map(),
  trustAccountMatters: new Set(),
});

const generateBackendKeys = async (): Promise<MockBackendKeys> => {
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
  const publicJwk = await exportJWK(publicKey);
  const kid = 'mock-backend-key';
  return {
    privateKey: privateKey as unknown as KeyObject,
    publicJwk: { ...publicJwk, kid, use: 'sig', alg: 'RS256' },
    kid,
  };
};

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const matchPath = (pattern: string | RegExp, path: string): boolean => {
  if (typeof pattern === 'string') {
    if (pattern.includes(':')) {
      const re = new RegExp(
        '^' + pattern.replace(/:[a-zA-Z_]+/g, '[^/]+') + '$',
      );
      return re.test(path);
    }
    return path === pattern;
  }
  return pattern.test(path);
};

interface MockRouter {
  state: MockState;
  overrides: Array<{ pattern: string | RegExp; handler: (input: Request, url: URL) => Promise<Response> | Response }>;
}

const handleListResource = <K, V extends { practice_id?: string }>(
  store: Map<K, V>,
  url: URL,
  filterFn?: (record: V) => boolean,
): Response => {
  const practiceId = url.searchParams.get('practice_id') ?? 'practice-1';
  const results = Array.from(store.values()).filter((r) => {
    if (r.practice_id && r.practice_id !== practiceId) return false;
    if (filterFn && !filterFn(r)) return false;
    return true;
  });
  return json({ results, next_cursor: null });
};

const defaultRouter = async (request: Request, router: MockRouter): Promise<Response> => {
  const url = new URL(request.url);
  const path = url.pathname;

  // Overrides first.
  for (const override of router.overrides) {
    if (matchPath(override.pattern, path)) {
      return Promise.resolve(override.handler(request, url));
    }
  }

  const state = router.state;

  // Idempotency cache for write paths — replay the cached response if
  // the same Idempotency-Key was used before.
  const idemKey = request.headers.get('Idempotency-Key');
  const idemCacheKey = idemKey
    ? `${request.method}:${new URL(request.url).pathname}:${idemKey}`
    : null;
  if (idemCacheKey && (request.method === 'POST' || request.method === 'PATCH')) {
    const cached = state.idempotency.get(idemCacheKey);
    if (cached) return json(cached.body, cached.status);
  }

  // --- Reads ---
  if (path === '/api/practice-client-intakes' && request.method === 'GET') {
    const triageStatus = url.searchParams.get('triage_status');
    return handleListResource(state.intakes, url, (r) => {
      if (!triageStatus || triageStatus === 'all') return true;
      return (r as { triage_status?: string }).triage_status === triageStatus;
    });
  }
  const intakeMatch = /^\/api\/practice-client-intakes\/([^/]+)$/.exec(path);
  if (intakeMatch && request.method === 'GET') {
    const record = state.intakes.get(intakeMatch[1]);
    return record ? json(record) : json({ error: 'not found' }, 404);
  }

  if (path === '/api/matters' && request.method === 'GET') {
    const status = url.searchParams.get('status');
    return handleListResource(state.matters, url, (r) => {
      if (!status || status === 'all') return true;
      return (r as { status?: string }).status === status;
    });
  }
  const matterMatch = /^\/api\/matters\/([^/]+)$/.exec(path);
  if (matterMatch && request.method === 'GET') {
    const record = state.matters.get(matterMatch[1]);
    return record ? json(record) : json({ error: 'not found' }, 404);
  }

  if (path === '/api/invoices' && request.method === 'GET') {
    const status = url.searchParams.get('status');
    return handleListResource(state.invoices, url, (r) => {
      if (!status || status === 'all') return true;
      return (r as { status?: string }).status === status;
    });
  }
  const invoiceMatch = /^\/api\/invoices\/([^/]+)$/.exec(path);
  if (invoiceMatch && request.method === 'GET') {
    const record = state.invoices.get(invoiceMatch[1]);
    return record ? json(record) : json({ error: 'not found' }, 404);
  }

  if (path === '/api/clients' && request.method === 'GET') {
    return handleListResource(state.clients, url);
  }

  if (path === '/api/conversations' && request.method === 'GET') {
    return handleListResource(state.conversations, url);
  }
  const convMatch = /^\/api\/conversations\/([^/]+)$/.exec(path);
  if (convMatch && request.method === 'GET') {
    const record = state.conversations.get(convMatch[1]);
    return record ? json(record) : json({ error: 'not found' }, 404);
  }

  // Stripe/payments — backend_pending tools land here. Default to 503
  // so the worker's BACKEND_ERROR envelope is exercised even with mock.
  if (path === '/api/payments' && request.method === 'GET') {
    return json({ error: 'Stripe Connect not yet enabled for this practice' }, 503);
  }
  if (path === '/api/payments/balance' && request.method === 'GET') {
    return json({ error: 'Stripe Connect not yet enabled' }, 503);
  }

  // --- Writes ---
  const triageMatch = /^\/api\/practice-client-intakes\/([^/]+)\/triage$/.exec(path);
  if (triageMatch && request.method === 'POST') {
    const intake = state.intakes.get(triageMatch[1]);
    if (!intake) return json({ error: 'not found' }, 404);
    const body = (await request.json()) as { decision: string };
    (intake as Record<string, unknown>).triage_status = body.decision;
    const responseBody = { ...intake };
    if (idemCacheKey) state.idempotency.set(idemCacheKey, { status: 200, body: responseBody });
    return json(responseBody);
  }

  const noteMatch = /^\/api\/matters\/([^/]+)\/notes$/.exec(path);
  if (noteMatch && request.method === 'POST') {
    const matter = state.matters.get(noteMatch[1]);
    if (!matter) return json({ error: 'not found' }, 404);
    const body = (await request.json()) as { body: string };
    const note = {
      id: `note_${crypto.randomUUID().slice(0, 8)}`,
      matter_id: noteMatch[1],
      body: body.body,
      created_at: new Date().toISOString(),
    };
    const notes = ((matter as Record<string, unknown>).notes ?? []) as Array<unknown>;
    notes.push(note);
    (matter as Record<string, unknown>).notes = notes;
    if (idemCacheKey) state.idempotency.set(idemCacheKey, { status: 201, body: note });
    return json(note, 201);
  }

  // Conversation-visibility: mock backend rejects non-visible conversations
  // with the exact code the Worker propagates as BACKEND_FORBIDDEN.
  const msgMatch = /^\/api\/conversations\/([^/]+)\/messages$/.exec(path);
  if (msgMatch && request.method === 'POST') {
    if (!state.conversations.has(msgMatch[1])) {
      return json({ code: 'CONVERSATION_NOT_VISIBLE' }, 403);
    }
    const body = (await request.json()) as { body: string };
    const message = {
      id: `msg_${crypto.randomUUID().slice(0, 8)}`,
      conversation_id: msgMatch[1],
      body: body.body,
      sender: 'practice',
    };
    if (idemCacheKey) state.idempotency.set(idemCacheKey, { status: 201, body: message });
    return json(message, 201);
  }

  // --- High-risk: pending actions ---
  if (path === '/api/pending-actions' && request.method === 'POST') {
    const body = (await request.json()) as {
      tool_name: string;
      tool_params: Record<string, unknown>;
    };

    // R16 trust-account refusal — if the request targets a flagged matter.
    const matterId = body.tool_params.matter_id as string | undefined;
    if (matterId && state.trustAccountMatters.has(matterId)) {
      return json(
        {
          code: 'TRUST_ACCOUNT_NOT_SUPPORTED',
          description: `Matter ${matterId} is flagged trust-account; use the web UI.`,
        },
        422,
      );
    }

    const id = `pa_${crypto.randomUUID().slice(0, 8)}`;
    const action: PendingAction = {
      id,
      practice_id: 'practice-1',
      tool_name: body.tool_name,
      tool_params: body.tool_params,
      state: 'pending',
      approval_url: `https://app.blawby.com/approve/mock-jwt-${id}`,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      amount_cents:
        typeof body.tool_params.amount_cents === 'number'
          ? (body.tool_params.amount_cents as number)
          : undefined,
      created_at: new Date().toISOString(),
    };
    state.pendingActions.set(id, action);
    const responseBody = {
      pending_action_id: id,
      approval_url: action.approval_url,
      expires_at: action.expires_at,
    };
    if (idemCacheKey) state.idempotency.set(idemCacheKey, { status: 201, body: responseBody });
    return json(responseBody, 201);
  }
  const paMatch = /^\/api\/pending-actions\/([^/]+)$/.exec(path);
  if (paMatch && request.method === 'GET') {
    const action = state.pendingActions.get(paMatch[1]);
    return action ? json(action) : json({ error: 'not found' }, 404);
  }

  // JWKS — installed in installBackendMock via fetch interception, not
  // routed here. Falling through means an unknown endpoint.

  return json({ error: `Mock backend: no route for ${request.method} ${path}` }, 501);
};

export const installBackendMock = async (): Promise<InstalledBackendMock> => {
  const keys = await generateBackendKeys();
  const state = newMockState();
  const router: MockRouter = { state, overrides: [] };
  const calls: MockCallRecord[] = [];

  const originalFetch = globalThis.fetch;
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;
    const parsed = new URL(url);
    const request =
      input instanceof Request
        ? input
        : new Request(url, init as RequestInit);
    const method = request.method;
    const headers: Record<string, string> = {};
    request.headers.forEach((v, k) => {
      headers[k] = v;
    });

    let bodyText: string | null = null;
    if (method !== 'GET' && method !== 'HEAD') {
      try {
        bodyText = await request.clone().text();
      } catch {
        // body may already be consumed in some cases
      }
    }

    calls.push({
      url,
      method,
      headers,
      body: bodyText,
      idempotencyKey: headers['idempotency-key'] ?? headers['Idempotency-Key'] ?? null,
      timestamp: Date.now(),
    });

    // JWKS endpoint — Better Auth jwt plugin default path.
    if (parsed.pathname === '/api/auth/jwks') {
      return json({ keys: [keys.publicJwk] });
    }

    return defaultRouter(request, router);
  });

  const mintToken = async (claimsOverrides: Record<string, unknown> = {}): Promise<string> => {
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      sub: 'user-1',
      organization_id: 'practice-1',
      scope:
        'intakes:read intakes:write matters:read matters:write invoices:read invoices:send invoices:refund clients:read conversations:read messages:send_as_practice payments:read payments:refund team:read events:subscribe',
      ...claimsOverrides,
    };
    return new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: keys.kid })
      .setIssuedAt(now)
      .setExpirationTime(now + 300)
      .setAudience('https://mcp.test/api/mcp')
      .setIssuer('https://backend.test')
      .sign(keys.privateKey);
  };

  return {
    keys,
    mintToken,
    uninstall: () => {
      fetchSpy.mockRestore();
      globalThis.fetch = originalFetch;
    },
    captureBackendCalls: () => [...calls],
    resetCallHistory: () => {
      calls.length = 0;
    },
    override: (pattern, handler) => {
      router.overrides.push({ pattern, handler });
    },
    state,
  };
};
