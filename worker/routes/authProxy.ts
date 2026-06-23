import type { Env } from '../types.js';
import { HttpErrors } from '../errorHandler.js';
import { optionalAuth } from '../middleware/auth.js';
import { invalidatePracticeDetailsCache } from '../utils/practiceDetailsCache.js';
import { edgeCache } from '../utils/edgeCache.js';
import { Logger } from '../utils/logger.js';
import { redactSensitiveFields } from '../utils/redactResponse.js';
import { policyTtlMs } from '../utils/cachePolicy.js';
import { proxy } from '../utils/proxy.js';
import {
  isSearchablePath,
  deriveOp,
  normalizeForIndex,
} from '../utils/normalizeForIndex.js';
import { SearchIndexEventPublisher } from '../services/SearchIndexEventPublisher.js';

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
  '/api/engagement-contracts',
  '/api/invoices',
  '/api/conversations',
  '/api/practice-client-intakes',
  '/api/practice',
  '/api/preferences',
  '/api/subscriptions',
  '/api/subscription',
  '/api/tasks',
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

const jsonResponse = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });

const validateEngagementContractProxyResponse = async (
  request: Request,
  response: Response,
): Promise<Response | null> => {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/engagement-contracts')) return null;
  if (request.method.toUpperCase() === 'HEAD') return null;

  const contentType = response.headers.get('Content-Type') ?? '';
  const isJson = contentType.toLowerCase().includes('application/json');

  if (!isJson) {
    const bodyPreview = await response.clone().text()
      .then((text) => text.slice(0, 500))
      .catch((error) => `Unable to read response body: ${error instanceof Error ? error.message : String(error)}`);

    if (response.status < 200 || response.status >= 300) {
      Logger.error('[engagement-contracts] Upstream request failed with non-JSON response', {
        path: url.pathname,
        status: response.status,
        contentType,
        bodyPreview,
      });
      return jsonResponse({
        success: false,
        error: 'Engagement contract upstream request failed',
        details: {
          path: url.pathname,
          status: response.status,
          contentType,
          bodyPreview,
        },
      }, 500);
    }

    Logger.error('[engagement-contracts] Upstream returned non-JSON response', {
      path: url.pathname,
      status: response.status,
      contentType,
      bodyPreview,
    });
    return jsonResponse({
      success: false,
      error: 'Malformed engagement contract response',
      details: {
        path: url.pathname,
        reason: 'Upstream returned non-JSON response',
        contentType,
        bodyPreview,
      },
    }, 500);
  }

  try {
    await response.clone().json();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    Logger.error('[engagement-contracts] Upstream returned non-JSON response', {
      path: url.pathname,
      status: response.status,
      error: errorMessage,
    });
    return jsonResponse({
      success: false,
      error: 'Malformed engagement contract response',
      details: {
        path: url.pathname,
        reason: 'Upstream returned invalid JSON',
      },
    }, 500);
  }

  return null;
};

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

export async function handleBackendProxy(
  request: Request,
  env: Env,
  ctx?: ExecutionContext,
): Promise<Response> {
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
  const engagementContractError = await validateEngagementContractProxyResponse(request, result.response);
  if (engagementContractError) {
    return engagementContractError;
  }

  // Mutations on practice routes — invalidate the practice-details cache.
  if (result.status >= 200 && result.status < 300 && method !== 'GET' && method !== 'HEAD') {
    const practiceIdForCache = getPracticeIdForDetailsCacheInvalidation(url.pathname);
    if (practiceIdForCache) {
      await invalidatePracticeDetailsCache(env, practiceIdForCache);
    }
  }

  // Search index: capture write payload at the response boundary so the
  // queue consumer never has to refetch. Body is parsed once and re-emitted.
  if (
    result.status >= 200 && result.status < 300 &&
    method !== 'GET' && method !== 'HEAD' &&
    isSearchablePath(url.pathname) &&
    env.SEARCH_INDEX_EVENTS
  ) {
    return await dispatchSearchIndexEvent(request, env, ctx, result.response, method, url.pathname);
  }

  return result.response;
}

async function dispatchSearchIndexEvent(
  request: Request,
  env: Env,
  ctx: ExecutionContext | undefined,
  upstream: Response,
  method: string,
  pathname: string,
): Promise<Response> {
  let parsedBody: unknown = null;
  let buffer: ArrayBuffer | null = null;
  const publisher = new SearchIndexEventPublisher(env);
  const op = deriveOp(method);

  try {
    buffer = await upstream.clone().arrayBuffer();
    const text = new TextDecoder().decode(buffer);
    parsedBody = text.length > 0 ? JSON.parse(text) : null;
  } catch (error) {
    Logger.debug('search-index: response body not JSON; skipping enqueue', {
      pathname,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const headerPracticeId = readPracticeIdFromHeaders(request);

  if (op === 'delete') {
    const entityId = pathname.split('/').filter(Boolean).pop();
    const entityType = entityTypeForDelete(pathname);
    if (entityType && entityId && headerPracticeId) {
      const enqueue = publisher.publishCascadeDelete(entityType, entityId, headerPracticeId);
      if (ctx) ctx.waitUntil(enqueue);
      else await enqueue;
    } else if (entityType && entityId && !headerPracticeId) {
      // We CAN'T enqueue a cascade-delete without a practice id (the worker
      // never persists practice scoping per entity outside the index). Log
      // the miss so it's not silently dropped; don't throw — the upstream
      // delete succeeded and the client deserves the 2xx.
      Logger.warn('search-index: delete skipped, missing x-practice-id header', {
        pathname,
        entityType,
        entityId,
      });
    }
  } else if (parsedBody) {
    const normalized = normalizeForIndex(pathname, parsedBody, headerPracticeId);
    if (normalized) {
      const enqueue = publisher.publishUpsert(
        normalized.entityType,
        normalized.entityId,
        normalized.practiceId,
        normalized.payload,
      );
      if (ctx) ctx.waitUntil(enqueue);
      else await enqueue;
    } else if (!headerPracticeId) {
      // The normalizer falls through to header.practiceId only when the
      // response body lacks practice_id/organization_id. If we reach here
      // with no header value either, the upsert was definitely silently
      // dropped — surface it.
      Logger.warn('search-index: upsert skipped, no practice id in body or x-practice-id header', {
        pathname,
      });
    }
  }

  if (buffer) {
    return new Response(buffer, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: upstream.headers,
    });
  }
  return upstream;
}

function readPracticeIdFromHeaders(request: Request): string | null {
  return (
    request.headers.get('x-practice-id') ||
    request.headers.get('x-organization-id') ||
    null
  );
}

function entityTypeForDelete(pathname: string): import('../types/search.js').SearchEntityType | null {
  if (pathname.startsWith('/api/clients')) return 'client';
  if (pathname.startsWith('/api/matters')) return 'matter';
  if (pathname.startsWith('/api/invoices')) return 'invoice';
  if (pathname.startsWith('/api/practice-client-intakes')) return 'intake';
  // Conversations are worker-owned today so the proxy hook doesn't fire on
  // their DELETEs, but symmetry with the upsert path keeps this future-proof.
  if (pathname.startsWith('/api/conversations')) return 'conversation';
  if (pathname.startsWith('/api/uploads')) return 'file';
  return null;
}
