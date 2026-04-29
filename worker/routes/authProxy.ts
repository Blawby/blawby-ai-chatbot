import type { Env } from '../types.js';
import { HttpErrors } from '../errorHandler.js';
import { getDomain } from 'tldts';
import { optionalAuth } from '../middleware/auth.js';
import { invalidatePracticeDetailsCache } from '../utils/practiceDetailsCache.js';
import { edgeCache } from '../utils/edgeCache.js';
import { Logger } from '../utils/logger.js';
import { redactErrorResponseBody, redactSensitiveFields } from '../utils/redactResponse.js';
import { policyTtlMs } from '../utils/cachePolicy.js';

const AUTH_PATH_PREFIX = '/api/auth';
const SUBSCRIPTIONS_CURRENT_PATH = '/api/subscriptions/current';
const SUBSCRIPTIONS_PLANS_PATH = '/api/subscriptions/plans';
const DOMAIN_PATTERN = /;\s*domain=[^;]+/i;


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

const getBaseDomain = (host: string): string | null => {
  const hostname = host.split(':')[0].toLowerCase();
  const domain = getDomain(hostname);
  return domain ?? null;
};

const normalizeCookieDomain = (value: string, requestHost: string): string => {
  const cookieName = value.split('=')[0]?.trim().toLowerCase() ?? '';
  if (cookieName.startsWith('__host-')) {
    return value.replace(DOMAIN_PATTERN, '');
  }

  const baseDomain = getBaseDomain(requestHost);
  if (!baseDomain) {
    return value.replace(DOMAIN_PATTERN, '');
  }

  const domainValue = `.${baseDomain}`;
  if (DOMAIN_PATTERN.test(value)) {
    return value.replace(DOMAIN_PATTERN, `; Domain=${domainValue}`);
  }

  return value;
};

const getForwardedHost = (headerValue: string): string | null => {
  const entries = headerValue.split(',').map((entry) => entry.trim());
  for (const entry of entries) {
    const match = entry.match(/host=([^;]+)/i);
    if (!match) {
      continue;
    }
    const rawHost = match[1].trim();
    const cleaned = rawHost.replace(/^"|"$|^'|'$/g, '');
    if (cleaned) {
      return cleaned;
    }
  }
  return null;
};

const resolveRequestHost = (request: Request): string => {
  const forwardedHost = request.headers.get('X-Forwarded-Host');
  if (forwardedHost) {
    return forwardedHost.split(',')[0].trim();
  }

  const forwarded = request.headers.get('Forwarded');
  if (forwarded) {
    const host = getForwardedHost(forwarded);
    if (host) {
      return host;
    }
  }

  return new URL(request.url).host;
};

const buildProxyHeaders = (
  response: Response,
  requestHost: string
): { headers: Headers; hasSetCookie: boolean } => {
  const proxyHeaders = new Headers(response.headers);
  proxyHeaders.delete('Set-Cookie');

  const headersWithSetCookie = response.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headersWithSetCookie.getSetCookie === 'function') {
    const cookies = headersWithSetCookie.getSetCookie();
    for (const cookie of cookies) {
      proxyHeaders.append('Set-Cookie', normalizeCookieDomain(cookie, requestHost));
    }
    return { headers: proxyHeaders, hasSetCookie: cookies.length > 0 };
  }

  const setCookie = response.headers.get('Set-Cookie');
  if (setCookie) {
    // Fallback for environments without getSetCookie().
    // Warning: Multiple cookies may be comma-joined here, which can cause incorrect processing.
    // Only the first cookie is properly analyzed for __Host- prefix, and domain replacement
    // may affect all cookies in the string. This is a known limitation when getSetCookie() is unavailable.
    proxyHeaders.set('Set-Cookie', normalizeCookieDomain(setCookie, requestHost));
    return { headers: proxyHeaders, hasSetCookie: true };
  }

  return { headers: proxyHeaders, hasSetCookie: false };
};

const appendDebugHeaders = (proxyHeaders: Headers, response: Response, request: Request, env: Env) => {
  try {
    const debugEnabled =
      String(env.DEBUG).toLowerCase() === 'true'
      || String(env.DEBUG) === '1'
      || String(env.ALLOW_DEBUG).toLowerCase() === 'true';
    const environment = (
      typeof (env as unknown as Record<string, unknown>).ENVIRONMENT === 'string'
        ? (env as unknown as Record<string, unknown>).ENVIRONMENT
        : env.NODE_ENV
    )?.toString().toLowerCase();
    const isProductionEnvironment = environment === 'production' || String(env.IS_PRODUCTION).toLowerCase() === 'true';
    if (!debugEnabled || isProductionEnvironment) return;

    const headersWithSetCookie = response.headers as Headers & { getSetCookie?: () => string[] };
    if (typeof headersWithSetCookie.getSetCookie !== 'function') {
      return;
    }
    const rawSetCookie = headersWithSetCookie.getSetCookie();

    const setCookieMeta: Array<Record<string, unknown>> = rawSetCookie.map((cookieStr) => {
      const parts = cookieStr.split(';').map((p) => p.trim());
      const [nameValue, ...attrs] = parts;
      const name = nameValue.split('=')[0] || '';
      const meta: Record<string, unknown> = { name };
      for (const attr of attrs) {
        const [k, v] = attr.split('=');
        const key = k.trim().toLowerCase();
        if (key === 'domain') meta.domain = (v ?? '').trim();
        if (key === 'path') meta.path = (v ?? '').trim();
        if (key === 'samesite') meta.sameSite = (v ?? '').trim();
        if (key === 'max-age') meta.maxAge = (v ?? '').trim();
        if (key === 'expires') meta.expires = (v ?? '').trim();
        if (key === 'httponly') meta.httpOnly = true;
        if (key === 'secure') meta.secure = true;
      }
      return meta;
    });

    if (setCookieMeta.length > 0) {
      proxyHeaders.set('X-Debug-Set-Cookie-Names', setCookieMeta.map((m) => String(m.name)).join(','));
      proxyHeaders.set('X-Debug-Set-Cookie-Meta', JSON.stringify(setCookieMeta));
    }

    const incomingCookieHeader = request.headers.get('Cookie') || '';
    const incomingNames = incomingCookieHeader
      .split(';')
      .map((c) => c.trim())
      .filter(Boolean)
      .map((c) => c.split('=')[0]);
    if (incomingNames.length > 0) {
      proxyHeaders.set('X-Debug-Request-Cookie-Names', incomingNames.join(','));
    }
  } catch (err) {
    console.warn('[proxy] failed to add debug headers', err);
  }
};


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
