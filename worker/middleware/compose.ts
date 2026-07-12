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
import { incrementRateLimitCounter } from '../lib/kvCounters.js';
import { createRateLimitResponse } from '../errorHandler.js';

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

/**
 * Test-only seam for stashing an auth context onto a request without going
 * through withAuth's session validation. NEVER use this outside of unit tests.
 * Exported under a `__`-prefixed name so accidental production use stands out
 * in code review and lint.
 */
export const __setAuthContextForTest = (request: Request, context: AuthContext | null): void => {
  authContextStore.set(request, context);
};

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

const replayCached = (cached: CachedResponse): Response =>
  new Response(cached.body, { status: cached.status, headers: cached.headers });

const bufferResponse = async (response: Response): Promise<CachedResponse> => {
  const body = await response.clone().arrayBuffer();
  const headers: Array<[string, string]> = [];
  response.headers.forEach((value, key) => headers.push([key, value]));
  return { status: response.status, headers, body };
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

    // Fast path: cache hit replays the buffered response.
    const hit = edgeCache.get<CachedResponse>(key);
    if (hit) return replayCached(hit);

    // Miss: invoke the handler exactly once. If the response is
    // cacheable, buffer + store it; either way return a fresh Response
    // built from the buffer so we don't consume the body twice.
    const response = await handler(request, env, ctx);
    if (cacheable && !cacheable(response)) return response;
    const buffered = await bufferResponse(response);
    edgeCache.set(key, buffered, policyTtlMs(key));
    return replayCached(buffered);
  };
};

/**
 * `withRateLimit(handler, { keyFn, max, windowMs })` uses an atomic
 * ChatCounterObject for one-minute limits. KV is only a development fallback.
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
    if (opts.windowMs !== 60_000) {
      throw new RangeError('Only one-minute rate-limit windows are supported');
    }
    const key = opts.keyFn(request, env) ?? 'anonymous';
    const result = await incrementRateLimitCounter(env, `route:${key}`, opts.max);
    if (result.exceeded) {
      const retryAfter = Math.max(1, 60 - new Date().getSeconds());
      return createRateLimitResponse(retryAfter);
    }

    return handler(request, env, ctx);
  };
};

// Re-exported HttpErrors so route-table call sites can throw without
// importing the errorHandler separately.
export { HttpErrors };
