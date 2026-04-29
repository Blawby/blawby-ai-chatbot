import type { Env } from '../types.js';
import { HttpErrors } from '../errorHandler.js';
import { optionalAuth } from '../middleware/auth.js';
import { invalidatePracticeDetailsCache } from '../utils/practiceDetailsCache.js';
import { edgeCache } from '../utils/edgeCache.js';
import { Logger } from '../utils/logger.js';
import { redactSensitiveFields } from '../utils/redactResponse.js';
import { policyTtlMs } from '../utils/cachePolicy.js';
import { proxy } from '../utils/proxy.js';

const AUTH_PATH_PREFIX = '/api/auth';
const SUBSCRIPTIONS_CURRENT_PATH = '/api/subscriptions/current';
const SUBSCRIPTIONS_PLANS_PATH = '/api/subscriptions/plans';


type CachedProxyResponse = {
  status: number;
  statusText: string;
  headers: Array<[string, string]>;
  body: ArrayBuffer;
  hasSetCookie: boolean;
};
const BACKEND_PATH_PREFIXES = [
  '/api/onboarding',
  '/api/matters',
  '/api/invoices',
  '/api/conversations',
  '/api/practice',
  '/api/preferences',
  '/api/subscriptions',
  '/api/subscription',
  '/api/uploads',
  '/api/clients'
];

export async function handleAuthProxy(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(AUTH_PATH_PREFIX)) {
    throw HttpErrors.notFound('Auth proxy route not found');
  }
  if (!env.BACKEND_API_URL) {
    throw HttpErrors.internalServerError('BACKEND_API_URL must be configured for auth proxy');
  }
  const { response } = await proxy(request, env, { label: 'Auth Proxy' });
  return response;
}

const isBackendProxyPath = (path: string): boolean =>
  BACKEND_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));

const getPracticeIdForDetailsCacheInvalidation = (pathname: string): string | null => {
  const segments = pathname.split('/').filter(Boolean);
  // /api/practice/:id and /api/practice/:id/details
  if (segments.length >= 3 && segments[0] === 'api' && segments[1] === 'practice') {
    const candidate = segments[2]?.trim();
    if (candidate && candidate !== 'details') {
      return candidate;
    }
  }
  return null;
};

const responseFromCache = (cached: CachedProxyResponse): Response =>
  new Response(cached.body.slice(0), {
    status: cached.status,
    statusText: cached.statusText,
    headers: new Headers(cached.headers)
  });

export async function handleBackendProxy(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (!isBackendProxyPath(url.pathname)) {
    throw HttpErrors.notFound('Backend proxy route not found');
  }

  if (!env.BACKEND_API_URL) {
    throw HttpErrors.internalServerError('BACKEND_API_URL must be configured for backend proxy');
  }

  const method = request.method.toUpperCase();
  const isSubscriptionsPlansRequest = method === 'GET' && url.pathname === SUBSCRIPTIONS_PLANS_PATH;

  // Pre-resolve auth for the subscriptions/plans cache key (anonymous vs. user-scoped).
  let plansAuthContext: Awaited<ReturnType<typeof optionalAuth>> | null = null;
  if (isSubscriptionsPlansRequest) {
    try {
      plansAuthContext = await optionalAuth(request, env);
    } catch (error) {
      // Transient or invalid-token failures both fall back to anonymous so we
      // serve a fresh/cached response rather than 500 the request.
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[authProxy] Auth validation error for ${url.pathname}:`, {
        message: errorMessage,
        requestPath: url.pathname,
      });
      plansAuthContext = null;
    }
  }
  const plansCacheKey = isSubscriptionsPlansRequest
    ? `subscriptions:plans:${url.pathname}${url.search}:${plansAuthContext?.user?.id ?? 'anonymous'}`
    : null;

  // /api/subscriptions/current — backend wants reference_id; resolve from session.
  const transformUrl = url.pathname === SUBSCRIPTIONS_CURRENT_PATH
    ? async (original: URL): Promise<URL> => {
        const hasReferenceId =
          original.searchParams.has('reference_id') || original.searchParams.has('referenceId');
        if (hasReferenceId) return original;
        const authContext = await optionalAuth(request, env);
        const resolvedReferenceId = authContext?.activeOrganizationId ?? null;
        if (resolvedReferenceId) {
          original.searchParams.set('reference_id', resolvedReferenceId);
          original.searchParams.set('referenceId', resolvedReferenceId);
        }
        return original;
      }
    : undefined;

  // Debug body logging for PUT /matters/, gated on env.DEBUG.
  const onBeforeFetch = (init: globalThis.RequestInit) => {
    if (
      method !== 'PUT' ||
      !url.pathname.match(/\/matters\//) ||
      (env.DEBUG !== '1' && env.DEBUG !== 'true')
    ) return;
    try {
      let bodyObj: unknown = null;
      if (init.body instanceof ArrayBuffer) {
        bodyObj = JSON.parse(new TextDecoder().decode(init.body));
      } else if (typeof init.body === 'string') {
        bodyObj = JSON.parse(init.body);
      }
      if (bodyObj && typeof bodyObj === 'object') {
        Logger.debug('PUT /matters/ payload', redactSensitiveFields(bodyObj));
      }
    } catch (e) {
      Logger.debug('PUT /matters/ payload (unparseable)', { error: String(e) });
    }
  };

  // Subscriptions/plans cached path — wrap proxy() in edgeCache.
  if (isSubscriptionsPlansRequest && plansCacheKey) {
    const cached = await edgeCache.get_or_fetch<CachedProxyResponse>(
      plansCacheKey,
      async () => {
        const result = await proxy(request, env, {
          label: 'Backend Proxy',
          transformUrl,
          onBeforeFetch,
        });
        const body = await result.response.arrayBuffer();
        const serializedHeaders: Array<[string, string]> = [];
        result.response.headers.forEach((value, key) => { serializedHeaders.push([key, value]); });
        return {
          status: result.response.status,
          statusText: result.response.statusText,
          headers: serializedHeaders,
          body,
          hasSetCookie: result.hasSetCookie,
        };
      },
      {
        ttlMs: policyTtlMs(plansCacheKey),
        // Don't pollute the cache with auth-mutating responses (Set-Cookie)
        // or upstream errors.
        cacheable: (r) => r.status >= 200 && r.status < 300 && !r.hasSetCookie,
      },
    );
    return responseFromCache(cached);
  }

  const result = await proxy(request, env, {
    label: 'Backend Proxy',
    transformUrl,
    onBeforeFetch,
  });

  // Mutations on practice routes — invalidate the practice-details cache.
  if (result.status >= 200 && result.status < 300 && method !== 'GET' && method !== 'HEAD') {
    const practiceIdForCache = getPracticeIdForDetailsCacheInvalidation(url.pathname);
    if (practiceIdForCache) {
      await invalidatePracticeDetailsCache(env, practiceIdForCache);
    }
  }

  return result.response;
}
