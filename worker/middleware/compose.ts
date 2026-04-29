/**
 * Middleware composition for the route table.
 *
 * Each middleware is a `(handler) => handler` higher-order function.
 * Compose them at route-declaration time so the route table reads as
 * `[withAuth, withCache, withRateLimit](handler)` — one explicit
 * arrangement per route, no per-handler boilerplate.
 *
 *   const handler = withCache(withAuth(myHandler, { required: true }), {
 *     keyFn: (req) => `mykey:${req.headers.get('x-id')}`,
 *   });
 *
 * Order matters and matches function-composition semantics: middleware
 * applied LAST runs FIRST. So `withAuth(withCache(handler))` runs auth
 * first, then cache, then handler.
 */

import type { Env } from '../types.js';
import { HttpErrors } from '../errorHandler.js';
import { optionalAuth, requireAuth, type AuthContext } from './auth.js';
import { edgeCache } from '../utils/edgeCache.js';
import { policyTtlMs } from '../utils/cachePolicy.js';

export type RouteHandler = (
  request: Request,
  env: Env,
  ctx: ExecutionContext,
) => Promise<Response>;

/**
 * `withAuth(handler, { required })` — runs `requireAuth` (throws 401 on
 * failure) or `optionalAuth` (allows anonymous) before invoking the
 * wrapped handler. The auth context is attached to a request-scoped
 * `WeakMap` so handlers can read it without re-parsing cookies; use
 * `getAttachedAuthContext(request)` from this module.
 *
 * Most existing handlers call `requireAuth` / `optionalAuth` directly
 * inline; this wrapper lets the route table declare the auth
 * requirement at the entry point instead, so it's visible alongside
 * the path matcher.
 */
const authContextStore = new WeakMap<Request, AuthContext | null>();

export const getAttachedAuthContext = (request: Request): AuthContext | null =>
  authContextStore.get(request) ?? null;

export const withAuth = (
  handler: RouteHandler,
  opts: { required: boolean } = { required: false },
): RouteHandler => {
  return async (request, env, ctx) => {
    const authContext = opts.required
      ? await requireAuth(request, env)
      : await optionalAuth(request, env);
    authContextStore.set(request, authContext);
    return handler(request, env, ctx);
  };
};

/**
 * `withCache(handler, { keyFn, methods, cacheable })` — wraps a GET
 * handler in the per-isolate edgeCache so identical requests within
 * the TTL share one upstream call.
 *
 * - `keyFn`: derives the cache key from the request. The key's prefix
 *   determines the TTL via cachePolicy.
 * - `methods`: HTTP methods to cache. Default ['GET'].
 * - `cacheable`: optional predicate on the resolved Response. Skips
 *   caching when false (e.g. for non-2xx responses).
 *
 * Caches a structural copy of the response so the original Response's
 * body isn't consumed when the cached result is replayed.
 */
type CachedResponse = {
  status: number;
  headers: Array<[string, string]>;
  body: ArrayBuffer;
};

export const withCache = (
  handler: RouteHandler,
  opts: {
    keyFn: (request: Request, env: Env) => string | null;
    methods?: ReadonlyArray<string>;
    cacheable?: (response: Response) => boolean;
  },
): RouteHandler => {
  const methods = opts.methods ?? ['GET'];
  const cacheable = opts.cacheable;

  return async (request, env, ctx) => {
    if (!methods.includes(request.method)) return handler(request, env, ctx);
    const key = opts.keyFn(request, env);
    if (!key) return handler(request, env, ctx);

    const cached = await edgeCache.get_or_fetch<CachedResponse | null>(
      key,
      async () => {
        const response = await handler(request, env, ctx);
        if (cacheable && !cacheable(response)) return null;
        // Buffer the body so the cached entry can be replayed without
        // consuming the original stream.
        const body = await response.clone().arrayBuffer();
        const headers: Array<[string, string]> = [];
        response.headers.forEach((value, key) => headers.push([key, value]));
        return {
          status: response.status,
          headers,
          body,
        };
      },
      {
        ttlMs: policyTtlMs(key),
        cacheable: (entry) => entry !== null,
      },
    );

    if (!cached) return handler(request, env, ctx);
    return new Response(cached.body, { status: cached.status, headers: cached.headers });
  };
};

/**
 * `withRateLimit(handler, { keyFn, max, windowMs })` — token-bucket
 * style rate limit using edgeCache as the counter store.
 *
 * Per-isolate scope means a request hitting a fresh isolate gets a
 * fresh budget; that's an explicit trade for simplicity vs. KV-backed
 * exact counting. Use this for UX guardrails (avoid one abusive client
 * spamming a single isolate), not for security-critical quotas.
 *
 * Returns 429 with a JSON body when the limit is exceeded; passes
 * through to the handler otherwise.
 */
export const withRateLimit = (
  handler: RouteHandler,
  opts: {
    keyFn: (request: Request, env: Env) => string | null;
    max: number;
    windowMs: number;
  },
): RouteHandler => {
  return async (request, env, ctx) => {
    const key = opts.keyFn(request, env);
    if (!key) return handler(request, env, ctx);

    const bucketKey = `ratelimit:${key}`;
    const now = Date.now();
    const bucket = edgeCache.get<{ count: number; expiresAt: number }>(bucketKey);

    if (bucket && bucket.expiresAt > now) {
      if (bucket.count >= opts.max) {
        const retryAfter = Math.max(1, Math.ceil((bucket.expiresAt - now) / 1000));
        return new Response(
          JSON.stringify({ success: false, error: 'Rate limit exceeded', retryAfter }),
          { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) } },
        );
      }
      edgeCache.set(bucketKey, { count: bucket.count + 1, expiresAt: bucket.expiresAt }, bucket.expiresAt - now);
    } else {
      edgeCache.set(bucketKey, { count: 1, expiresAt: now + opts.windowMs }, opts.windowMs);
    }

    return handler(request, env, ctx);
  };
};

// Re-exported HttpErrors so route-table call sites can throw without
// importing the errorHandler separately.
export { HttpErrors };
