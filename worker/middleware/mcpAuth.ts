import { createRemoteJWKSet, errors as joseErrors, jwtVerify } from 'jose';
import type { JWTPayload, JWTVerifyResult } from 'jose';
import type { Env } from '../types.js';
import { MCPRevocationCache } from '../services/MCPRevocationCache.js';

/**
 * withMCPAuth — Bearer JWT validation, audience binding, scope check,
 * revocation epoch + jti denylist check.
 *
 * Plan R1, R2, R4. The Worker is the OAuth Resource Server; Backend
 * (Better Auth + @better-auth/oauth-provider) is the Authorization
 * Server. We never call Backend per-request — we verify the JWT
 * signature against Backend's JWKS (30s isolate cache) and read the
 * revocation epoch from KV (30s isolate cache via MCPRevocationCache).
 *
 * On success the middleware sets four request headers that the existing
 * U6 route surface already forwards to the McpSession DO:
 *   X-Mcp-Practice-Id
 *   X-Mcp-User-Id
 *   X-Mcp-Jti
 *   X-Mcp-Scopes (comma-separated)
 * and attaches an MCPAuthContext via WeakMap (same pattern as
 * middleware/compose.ts).
 *
 * Routes that need the resource discovery doc (`.well-known/oauth-
 * protected-resource`) must remain UNAUTHENTICATED — wrap only the
 * `/api/mcp` routes, not the well-known endpoint.
 *
 * Internal events route (`/api/mcp/internal/events`) is service-to-
 * service and authenticates via HMAC + bearer in U8, not via this
 * middleware.
 *
 * See docs/plans/2026-05-15-002-feat-blawby-mcp-agent-surface-plan.md.
 */

export interface MCPAuthContext {
  practice_id: string;
  user_id: string;
  jti: string;
  scopes: Set<string>;
  revocation_epoch_at_issue: number;
  raw_claims: JWTPayload;
}

const authContextStore = new WeakMap<Request, MCPAuthContext | null>();

export const getAttachedMCPAuthContext = (request: Request): MCPAuthContext | null =>
  authContextStore.get(request) ?? null;

/**
 * Test-only: attach an MCPAuthContext to a Request without going through
 * JWT validation. Mirrors compose.ts's `__setAuthContextForTest`.
 */
export const __setMCPAuthContextForTest = (
  request: Request,
  context: MCPAuthContext | null,
): void => {
  authContextStore.set(request, context);
};

interface JwksCacheEntry {
  jwks: ReturnType<typeof createRemoteJWKSet>;
  expiresAt: number;
}
const JWKS_TTL_MS = 30_000;
const jwksCache = new Map<string, JwksCacheEntry>();

const getJwks = (env: Env): ReturnType<typeof createRemoteJWKSet> => {
  const backend = env.BACKEND_API_URL?.replace(/\/$/, '');
  if (!backend) {
    throw new MCPAuthError(
      'server_error',
      'BACKEND_API_URL not configured; cannot fetch JWKS',
      'INTERNAL_CONFIG',
    );
  }
  // Better Auth's jwt plugin serves JWKS at /api/auth/jwks per its
  // documented convention. Backend PR #216 mounts /api/auth/* via Hono.
  const jwksUrl = `${backend}/api/auth/jwks`;
  const cached = jwksCache.get(jwksUrl);
  if (cached && cached.expiresAt > Date.now()) return cached.jwks;
  const jwks = createRemoteJWKSet(new URL(jwksUrl), {
    cacheMaxAge: JWKS_TTL_MS,
    cooldownDuration: 5_000,
  });
  jwksCache.set(jwksUrl, { jwks, expiresAt: Date.now() + JWKS_TTL_MS });
  return jwks;
};

const getAudience = (env: Env, request: Request): string => {
  if (env.MCP_BACKEND_AUDIENCE) return env.MCP_BACKEND_AUDIENCE;
  // Fallback for local dev: derive from the request's own origin.
  const url = new URL(request.url);
  return `${url.origin}/api/mcp`;
};

const extractBearer = (request: Request): string | null => {
  const auth = request.headers.get('Authorization');
  if (!auth) return null;
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  return match ? match[1].trim() : null;
};

const readStringClaim = (
  payload: JWTPayload,
  candidates: readonly string[],
): string | null => {
  for (const key of candidates) {
    const v = payload[key];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return null;
};

const readScopes = (payload: JWTPayload): Set<string> => {
  // OAuth 2.1 + Better Auth conventions: `scope` is space-separated; some
  // providers emit `scopes` as an array. Accept both.
  const raw = payload.scope ?? payload.scopes;
  if (typeof raw === 'string') {
    return new Set(raw.split(/\s+/).filter(Boolean));
  }
  if (Array.isArray(raw)) {
    return new Set(raw.filter((s): s is string => typeof s === 'string' && s.length > 0));
  }
  return new Set();
};

const readRevocationEpoch = (payload: JWTPayload): number => {
  // Backend U1 embeds practice_revocation_epoch_at_issue on token mint.
  // If absent (older backend revision), treat as 0 — the KV epoch is
  // also 0 by default, so the comparison is a no-op until backend
  // starts emitting the claim.
  const v = payload.practice_revocation_epoch_at_issue;
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v;
  return 0;
};

export class MCPAuthError extends Error {
  constructor(
    public readonly oauthError: string,
    public readonly description: string,
    public readonly dataCode: string,
  ) {
    super(description);
    this.name = 'MCPAuthError';
  }
}

const wwwAuthenticate = (env: Env, request: Request, oauthError?: string): string => {
  const audience = getAudience(env, request);
  const resourceMeta = `${new URL(request.url).origin}/.well-known/oauth-protected-resource`;
  const errorPart = oauthError ? `, error="${oauthError}"` : '';
  return `Bearer realm="${audience}", resource_metadata="${resourceMeta}"${errorPart}`;
};

const unauthorizedResponse = (
  env: Env,
  request: Request,
  oauthError: string,
  description: string,
  dataCode: string,
): Response =>
  new Response(
    JSON.stringify({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32001,
        message: description,
        data: { code: dataCode, retryable: false },
      },
    }),
    {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'WWW-Authenticate': wwwAuthenticate(env, request, oauthError),
      },
    },
  );

type RouteHandler = (request: Request, env: Env, ctx: ExecutionContext) => Promise<Response>;

/**
 * Wraps a handler with MCP Bearer-JWT auth. Authoritative validation
 * sequence — order matters, each step is a fast-fail:
 *   1. Extract Bearer
 *   2. Verify JWT signature, audience, expiry via jose+JWKS
 *   3. Read required claims (sub/practice/jti/scope)
 *   4. Check practice revocation epoch (KV)
 *   5. Check jti denylist (KV)
 *   6. Attach context + forward X-Mcp-* headers to inner handler
 */
export const withMCPAuth = (handler: RouteHandler): RouteHandler => {
  return async (request, env, ctx) => {
    const token = extractBearer(request);
    if (!token) {
      return unauthorizedResponse(env, request, 'invalid_request', 'Missing Bearer token', 'MISSING_BEARER');
    }

    let verification: JWTVerifyResult<JWTPayload>;
    try {
      const jwks = getJwks(env);
      verification = await jwtVerify(token, jwks, {
        audience: getAudience(env, request),
        algorithms: ['RS256', 'ES256'],
      });
    } catch (error) {
      if (error instanceof MCPAuthError) {
        return unauthorizedResponse(env, request, 'server_error', error.description, error.dataCode);
      }
      if (error instanceof joseErrors.JWTExpired) {
        return unauthorizedResponse(env, request, 'invalid_token', 'Token expired', 'TOKEN_EXPIRED');
      }
      if (error instanceof joseErrors.JWTClaimValidationFailed) {
        return unauthorizedResponse(env, request, 'invalid_token', error.message, 'CLAIM_INVALID');
      }
      if (error instanceof joseErrors.JWSSignatureVerificationFailed) {
        return unauthorizedResponse(env, request, 'invalid_token', 'Signature verification failed', 'SIGNATURE_INVALID');
      }
      // Surface jose error messages but never raw stack traces.
      const message = error instanceof Error ? error.message : 'Token validation failed';
      return unauthorizedResponse(env, request, 'invalid_token', message, 'TOKEN_INVALID');
    }

    const payload = verification.payload;
    const jti = readStringClaim(payload, ['jti']);
    const subject = readStringClaim(payload, ['sub']);
    const practiceId = readStringClaim(payload, [
      'practice_id',
      'org_id',
      'reference_id',
      'activeOrganizationId',
    ]);

    if (!jti || !subject || !practiceId) {
      return unauthorizedResponse(
        env,
        request,
        'invalid_token',
        'Token missing required claims (jti, sub, practice_id)',
        'CLAIMS_INCOMPLETE',
      );
    }

    const cache = new MCPRevocationCache(env);
    const tokenEpoch = readRevocationEpoch(payload);
    const currentEpoch = await cache.getPracticeEpoch(practiceId);
    if (currentEpoch > tokenEpoch) {
      return unauthorizedResponse(
        env,
        request,
        'invalid_token',
        'Session revoked',
        'SESSION_REVOKED',
      );
    }

    if (await cache.isJtiRevoked(jti)) {
      return unauthorizedResponse(
        env,
        request,
        'invalid_token',
        'Token has been revoked',
        'JTI_REVOKED',
      );
    }

    const scopes = readScopes(payload);
    const context: MCPAuthContext = {
      practice_id: practiceId,
      user_id: subject,
      jti,
      scopes,
      revocation_epoch_at_issue: tokenEpoch,
      raw_claims: payload,
    };
    authContextStore.set(request, context);

    // Mutating request headers in place isn't possible (Request.headers
    // is read-only in some runtimes). Forward by constructing a wrapped
    // request the inner handler sees.
    const forwarded = new Request(request, request);
    forwarded.headers.set('X-Mcp-Practice-Id', context.practice_id);
    forwarded.headers.set('X-Mcp-User-Id', context.user_id);
    forwarded.headers.set('X-Mcp-Jti', context.jti);
    forwarded.headers.set('X-Mcp-Scopes', Array.from(context.scopes).join(','));
    authContextStore.set(forwarded, context);

    return handler(forwarded, env, ctx);
  };
};

/**
 * requireScope — JSON-RPC error helper for tool-call scope enforcement.
 * Returns null if the auth context covers the required scope; otherwise
 * a Response with the standard SCOPE_INSUFFICIENT envelope.
 */
export const requireScope = (
  context: MCPAuthContext,
  requiredScope: string,
  jsonRpcId: string | number | null,
): { code: number; message: string; data: Record<string, unknown> } | null => {
  if (context.scopes.has(requiredScope)) return null;
  return {
    code: -32002,
    message: `Insufficient scope: ${requiredScope}`,
    data: {
      code: 'SCOPE_INSUFFICIENT',
      retryable: false,
      required_scope: requiredScope,
      granted_scopes: Array.from(context.scopes),
      jsonrpc_id: jsonRpcId,
    },
  };
};

/**
 * Test-only: drop the JWKS isolate cache.
 */
export const __resetMCPAuthJwksCacheForTest = (): void => {
  jwksCache.clear();
};
