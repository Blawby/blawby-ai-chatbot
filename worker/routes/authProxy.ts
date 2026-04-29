import type { Env } from '../types.js';
import { HttpErrors } from '../errorHandler.js';
import { optionalAuth } from '../middleware/auth.js';
import { invalidatePracticeDetailsCache } from '../utils/practiceDetailsCache.js';
import { edgeCache } from '../utils/edgeCache.js';
import { Logger } from '../utils/logger.js';
import { redactErrorResponseBody, redactSensitiveFields } from '../utils/redactResponse.js';
import { policyTtlMs } from '../utils/cachePolicy.js';
import { resolveRequestHost, buildProxyHeaders, appendDebugHeaders } from '../utils/proxy.js';

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

  const method = request.method.toUpperCase();
  const requestHost = resolveRequestHost(request);
  const targetUrl = new URL(url.pathname + url.search, env.BACKEND_API_URL);
  const headers = new Headers(request.headers);

  const init: globalThis.RequestInit = {
    method,
    headers,
    redirect: 'manual'
  };

  if (method !== 'GET' && method !== 'HEAD') {
    init.body = await request.arrayBuffer();
  }

  const response = await fetch(targetUrl.toString(), init);

  if (!response.ok) {
    let responseSnippet = 'response body withheld';
    const contentType = response.headers.get('Content-Type') || '';
    
    if (contentType.includes('application/json')) {
      try {
        const json = await response.clone().json() as unknown;
        responseSnippet = JSON.stringify(redactErrorResponseBody(json));
      } catch {
        // Fallback to "withheld" if parsing fails
      }
    }

    console.error(`[Auth Proxy Error] ${method} ${url.pathname}`, {
      status: response.status,
      statusText: response.statusText,
      hasRequestBody: Boolean(init.body),
      contentType,
      hasAuthorization: Boolean(headers.get('Authorization')),
      responseSnippet: responseSnippet.slice(0, 500)
    });
  }

  const { headers: proxyHeaders } = buildProxyHeaders(response, requestHost);

  appendDebugHeaders(proxyHeaders, response, request, env);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: proxyHeaders
  });
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
  const requestHost = resolveRequestHost(request);
  const isSubscriptionsPlansRequest = method === 'GET' && url.pathname === SUBSCRIPTIONS_PLANS_PATH;
  let plansAuthContext: Awaited<ReturnType<typeof optionalAuth>> | null = null;
  if (isSubscriptionsPlansRequest) {
    try {
      plansAuthContext = await optionalAuth(request, env);
    } catch (error) {
      // Log auth errors for subscriptions plans endpoint
      // Distinguish between transient errors and invalid token errors
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isTransientError = 
        errorMessage.includes('network') || 
        errorMessage.includes('timeout') || 
        errorMessage.includes('ECONNREFUSED') ||
        errorMessage.includes('Connection');
      
      if (isTransientError) {
        console.error(
          `[authProxy] Transient auth error for ${url.pathname}:`,
          { message: errorMessage, requestPath: url.pathname }
        );
        // For transient errors, treat as unauthenticated to return cached/fresh response
        plansAuthContext = null;
      } else {
        console.error(
          `[authProxy] Auth validation error for ${url.pathname}:`,
          { message: errorMessage, requestPath: url.pathname }
        );
        // For invalid token errors, also treat as unauthenticated
        plansAuthContext = null;
      }
    }
  }
  const plansCacheKey = isSubscriptionsPlansRequest
    ? `subscriptions:plans:${url.pathname}${url.search}:${plansAuthContext?.user?.id ?? 'anonymous'}`
    : null;

  let resolvedReferenceId: string | null = null;
  if (url.pathname === SUBSCRIPTIONS_CURRENT_PATH) {
    const hasReferenceId =
      url.searchParams.has('reference_id') || url.searchParams.has('referenceId');
    if (!hasReferenceId) {
      const authContext = await optionalAuth(request, env);
      resolvedReferenceId = authContext?.activeOrganizationId ?? null;
      if (resolvedReferenceId) {
        url.searchParams.set('reference_id', resolvedReferenceId);
        url.searchParams.set('referenceId', resolvedReferenceId);
      }
    }
  }

  /* 
   * Validating that the matters endpoint works correctly without the workaround.
   * If practice_id is needed, it should be handled by the backend routing/validation, 
   * or client should send it correctly if required (though path param is standard).
   */
  const targetUrl = new URL(url.pathname + url.search, env.BACKEND_API_URL);
  const headers = new Headers(request.headers);

  const init: globalThis.RequestInit = {
    method,
    headers,
    redirect: 'manual'
  };

  if (method !== 'GET' && method !== 'HEAD') {
    init.body = await request.arrayBuffer();
  }

  const fetchBackendResponse = async (): Promise<Response> => {
    // Debug logging for PUT /matters/ with redaction, gated by DEBUG flag
    if (
      method === 'PUT' &&
      url.pathname.match(/\/matters\//) &&
      (env.DEBUG === '1' || env.DEBUG === 'true')
    ) {
      try {
        let bodyObj: unknown = null;
        if (init.body instanceof ArrayBuffer) {
          const text = new TextDecoder().decode(init.body);
          bodyObj = JSON.parse(text);
        } else if (typeof init.body === 'string') {
          bodyObj = JSON.parse(init.body);
        }
        if (bodyObj && typeof bodyObj === 'object') {
          Logger.debug('PUT /matters/ payload', redactSensitiveFields(bodyObj));
        }
      } catch (e) {
        Logger.debug('PUT /matters/ payload (unparseable)', { error: String(e) });
      }
    }
    const response = await fetch(targetUrl.toString(), init);

    // Log errors for debugging
    if (!response.ok) {
      let responseSnippet = 'response body withheld';
      const contentType = response.headers.get('Content-Type') || '';

      if (contentType.includes('application/json')) {
        try {
          const json = await response.clone().json() as unknown;
          responseSnippet = JSON.stringify(redactErrorResponseBody(json));
        } catch {
          // ignore parsing failures
        }
      }

      console.error(`[Backend Proxy Error] ${method} ${url.pathname}`, {
        status: response.status,
        statusText: response.statusText,
        hasRequestBody: Boolean(init.body),
        contentType,
        hasAuthorization: Boolean(headers.get('Authorization')),
        responseSnippet: responseSnippet.slice(0, 500)
      });
    }

    return response;
  };

  if (isSubscriptionsPlansRequest && plansCacheKey) {
    const cached = await edgeCache.get_or_fetch<CachedProxyResponse>(
      plansCacheKey,
      async () => {
        const response = await fetchBackendResponse();
        const { headers: proxyHeaders, hasSetCookie } = buildProxyHeaders(response, requestHost);
        const body = await response.arrayBuffer();
        const serializedHeaders: Array<[string, string]> = [];
        proxyHeaders.forEach((value, key) => { serializedHeaders.push([key, value]); });
        return {
          status: response.status,
          statusText: response.statusText,
          headers: serializedHeaders,
          body,
          hasSetCookie,
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

  const response = await fetchBackendResponse();
  if (response.ok && method !== 'GET' && method !== 'HEAD') {
    const practiceIdForCache = getPracticeIdForDetailsCacheInvalidation(url.pathname);
    if (practiceIdForCache) {
      await invalidatePracticeDetailsCache(env, practiceIdForCache);
    }
  }
  const { headers: proxyHeaders } = buildProxyHeaders(response, requestHost);

  appendDebugHeaders(proxyHeaders, response, request, env);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: proxyHeaders
  });
}
