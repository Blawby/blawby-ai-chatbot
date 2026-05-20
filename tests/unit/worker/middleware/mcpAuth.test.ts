import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SignJWT,
  exportJWK,
  generateKeyPair,
} from 'jose';
import type { KeyObject } from 'crypto';
import {
  withMCPAuth,
  getAttachedMCPAuthContext,
  __resetMCPAuthJwksCacheForTest,
  requireScope,
} from '../../../../worker/middleware/mcpAuth.js';
import { __resetMCPRevocationCacheForTest } from '../../../../worker/services/MCPRevocationCache.js';
import type { Env } from '../../../../worker/types.js';

/**
 * U7 auth middleware tests.
 *
 * We mint real RS256 JWTs against a per-test keypair and serve the JWK
 * via a stubbed fetch (jose's createRemoteJWKSet pulls over HTTPS; we
 * intercept it at the global fetch boundary). Tests cover the
 * happy-path verify, audience binding, expiry, claim shape, scope
 * derivation, and the two KV-backed revocation signals.
 */

interface TestKeyMaterial {
  privateKey: KeyObject;
  publicJwk: Record<string, unknown>;
  kid: string;
}

const generateTestKeys = async (): Promise<TestKeyMaterial> => {
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
  const publicJwk = await exportJWK(publicKey);
  const kid = 'test-key-1';
  return {
    privateKey: privateKey as unknown as KeyObject,
    publicJwk: { ...publicJwk, kid, use: 'sig', alg: 'RS256' },
    kid,
  };
};

interface MintTokenOptions {
  claims?: Record<string, unknown>;
  expiresInSeconds?: number;
  audience?: string;
  issuer?: string;
  notBefore?: number;
}

const mintToken = async (
  keys: TestKeyMaterial,
  opts: MintTokenOptions = {},
): Promise<string> => {
  const claims = {
    sub: 'user-1',
    practice_id: 'practice-1',
    jti: 'jti-1',
    scope: 'intakes:read events:subscribe',
    practice_revocation_epoch_at_issue: 0,
    ...opts.claims,
  };
  const expiresIn = opts.expiresInSeconds ?? 300;
  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: keys.kid })
    .setIssuedAt(now + (opts.notBefore ?? 0))
    .setExpirationTime(now + expiresIn)
    .setAudience(opts.audience ?? 'https://mcp.test/api/mcp')
    .setIssuer(opts.issuer ?? 'https://backend.test')
    .sign(keys.privateKey);
  return jwt;
};

const createFakeKv = (
  initial: Record<string, string> = {},
): { kv: Env['CHAT_SESSIONS']; setRaw: (key: string, value: string | null) => void } => {
  const store = new Map<string, string>(Object.entries(initial));
  const kv = {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    list: vi.fn(async () => ({ keys: [] })),
    getWithMetadata: vi.fn(),
  } as unknown as Env['CHAT_SESSIONS'];
  return {
    kv,
    setRaw: (key, value) => {
      if (value === null) store.delete(key);
      else store.set(key, value);
    },
  };
};

const buildEnv = (
  overrides: Partial<Env> = {},
  kv: Env['CHAT_SESSIONS'] = createFakeKv().kv,
): Env =>
  ({
    NODE_ENV: 'test',
    BACKEND_API_URL: 'https://backend.test',
    MCP_BACKEND_AUDIENCE: 'https://mcp.test/api/mcp',
    CHAT_SESSIONS: kv,
    ...overrides,
  } as Env);

const buildRequest = (headers: Record<string, string> = {}): Request =>
  new Request('https://mcp.test/api/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
  });

const installJwksFetchStub = (keys: TestKeyMaterial): void => {
  const originalFetch = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : (input as Request).url ?? String(input);
    if (url.endsWith('/api/auth/jwks')) {
      return new Response(JSON.stringify({ keys: [keys.publicJwk] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return originalFetch(input);
  });
};

let keys: TestKeyMaterial;
const ctx = {} as ExecutionContext;
const okHandler = vi.fn(
  async (_req: Request, _env: Env, _ctx: ExecutionContext) => new Response('OK', { status: 200 }),
);

beforeEach(async () => {
  __resetMCPAuthJwksCacheForTest();
  __resetMCPRevocationCacheForTest();
  vi.restoreAllMocks();
  keys = await generateTestKeys();
  installJwksFetchStub(keys);
  okHandler.mockClear();
});

describe('withMCPAuth — happy path', () => {
  it('verifies a valid Bearer JWT and forwards X-Mcp-* identity headers', async () => {
    const token = await mintToken(keys);
    const env = buildEnv();
    const guarded = withMCPAuth(okHandler);
    const response = await guarded(
      buildRequest({ Authorization: `Bearer ${token}` }),
      env,
      ctx,
    );
    expect(response.status).toBe(200);
    expect(okHandler).toHaveBeenCalledTimes(1);
    const forwarded = okHandler.mock.calls[0][0] as Request;
    expect(forwarded.headers.get('X-Mcp-Practice-Id')).toBe('practice-1');
    expect(forwarded.headers.get('X-Mcp-User-Id')).toBe('user-1');
    expect(forwarded.headers.get('X-Mcp-Jti')).toBe('jti-1');
    expect(forwarded.headers.get('X-Mcp-Scopes')?.split(',').sort()).toEqual(
      ['events:subscribe', 'intakes:read'].sort(),
    );
    const context = getAttachedMCPAuthContext(forwarded);
    expect(context).not.toBeNull();
    expect(context?.scopes.has('intakes:read')).toBe(true);
  });

  it('accepts a scope claim emitted as an array (some providers)', async () => {
    const token = await mintToken(keys, {
      claims: { scope: undefined, scopes: ['matters:read', 'invoices:read'] },
    });
    const env = buildEnv();
    const response = await withMCPAuth(okHandler)(
      buildRequest({ Authorization: `Bearer ${token}` }),
      env,
      ctx,
    );
    expect(response.status).toBe(200);
    const ctxObj = getAttachedMCPAuthContext(okHandler.mock.calls[0][0] as Request);
    expect(ctxObj?.scopes.has('matters:read')).toBe(true);
    expect(ctxObj?.scopes.has('invoices:read')).toBe(true);
  });
});

describe('withMCPAuth — failure modes', () => {
  it('returns 401 with WWW-Authenticate when Authorization header is absent', async () => {
    const env = buildEnv();
    const response = await withMCPAuth(okHandler)(buildRequest(), env, ctx);
    expect(response.status).toBe(401);
    expect(response.headers.get('WWW-Authenticate')).toContain('Bearer');
    expect(response.headers.get('WWW-Authenticate')).toContain('resource_metadata=');
    expect(okHandler).not.toHaveBeenCalled();
    const body = (await response.json()) as { error: { data: { code: string } } };
    expect(body.error.data.code).toBe('MISSING_BEARER');
  });

  it('returns 401 for a token with the wrong audience', async () => {
    const token = await mintToken(keys, { audience: 'https://wrong.example/api/mcp' });
    const env = buildEnv();
    const response = await withMCPAuth(okHandler)(
      buildRequest({ Authorization: `Bearer ${token}` }),
      env,
      ctx,
    );
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { data: { code: string } } };
    expect(body.error.data.code).toBe('CLAIM_INVALID');
  });

  it('returns 401 with TOKEN_EXPIRED for an expired token', async () => {
    const token = await mintToken(keys, { expiresInSeconds: -60 });
    const env = buildEnv();
    const response = await withMCPAuth(okHandler)(
      buildRequest({ Authorization: `Bearer ${token}` }),
      env,
      ctx,
    );
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { data: { code: string } } };
    expect(body.error.data.code).toBe('TOKEN_EXPIRED');
  });

  it('returns 401 SIGNATURE_INVALID when a token is signed by a different key', async () => {
    const otherKeys = await generateTestKeys();
    const token = await mintToken(otherKeys); // signed by alien key
    // JWKS endpoint still serves the *original* keys, so verify fails.
    const env = buildEnv();
    const response = await withMCPAuth(okHandler)(
      buildRequest({ Authorization: `Bearer ${token}` }),
      env,
      ctx,
    );
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { data: { code: string } } };
    expect(body.error.data.code).toBe('SIGNATURE_INVALID');
  });

  it('returns 401 CLAIMS_INCOMPLETE when required claims are missing', async () => {
    const token = await mintToken(keys, { claims: { jti: '', practice_id: '' } });
    const env = buildEnv();
    const response = await withMCPAuth(okHandler)(
      buildRequest({ Authorization: `Bearer ${token}` }),
      env,
      ctx,
    );
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { data: { code: string } } };
    expect(body.error.data.code).toBe('CLAIMS_INCOMPLETE');
  });
});

describe('withMCPAuth — revocation', () => {
  it('rejects when the practice revocation epoch advanced past the token', async () => {
    const token = await mintToken(keys, {
      claims: { practice_revocation_epoch_at_issue: 5 },
    });
    const { kv } = createFakeKv({ 'mcp:rev:practice-1': '7' });
    const env = buildEnv({}, kv);
    const response = await withMCPAuth(okHandler)(
      buildRequest({ Authorization: `Bearer ${token}` }),
      env,
      ctx,
    );
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { data: { code: string } } };
    expect(body.error.data.code).toBe('SESSION_REVOKED');
  });

  it('passes when the token epoch equals the current epoch (not strictly less)', async () => {
    const token = await mintToken(keys, {
      claims: { practice_revocation_epoch_at_issue: 5 },
    });
    const { kv } = createFakeKv({ 'mcp:rev:practice-1': '5' });
    const env = buildEnv({}, kv);
    const response = await withMCPAuth(okHandler)(
      buildRequest({ Authorization: `Bearer ${token}` }),
      env,
      ctx,
    );
    expect(response.status).toBe(200);
  });

  it('rejects when the jti is on the denylist', async () => {
    const token = await mintToken(keys);
    const { kv } = createFakeKv({ 'mcp:jti:jti-1': '1' });
    const env = buildEnv({}, kv);
    const response = await withMCPAuth(okHandler)(
      buildRequest({ Authorization: `Bearer ${token}` }),
      env,
      ctx,
    );
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { data: { code: string } } };
    expect(body.error.data.code).toBe('JTI_REVOKED');
  });
});

describe('requireScope', () => {
  it('returns null when the required scope is present', () => {
    const result = requireScope(
      { scopes: new Set(['intakes:read', 'events:subscribe']) } as ReturnType<
        typeof getAttachedMCPAuthContext
      > extends infer T
        ? Exclude<T, null>
        : never,
      'intakes:read',
      1,
    );
    expect(result).toBeNull();
  });

  it('returns SCOPE_INSUFFICIENT JSON-RPC error envelope when missing', () => {
    const result = requireScope(
      { scopes: new Set(['events:subscribe']) } as ReturnType<
        typeof getAttachedMCPAuthContext
      > extends infer T
        ? Exclude<T, null>
        : never,
      'invoices:send',
      42,
    );
    expect(result).not.toBeNull();
    expect(result?.code).toBe(-32002);
    expect(result?.data.code).toBe('SCOPE_INSUFFICIENT');
    expect(result?.data.required_scope).toBe('invoices:send');
    expect(result?.data.jsonrpc_id).toBe(42);
  });
});
