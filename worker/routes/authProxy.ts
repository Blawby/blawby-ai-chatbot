import type { Env } from '../types.js';
import { HttpErrors } from '../errorHandler.js';
import { getDomain } from 'tldts';
import { optionalAuth } from '../middleware/auth.js';

const AUTH_PATH_PREFIX = '/api/auth';
const SUBSCRIPTIONS_CURRENT_PATH = '/api/subscriptions/current';
const DOMAIN_PATTERN = /;\s*domain=[^;]+/i;
const BACKEND_PATH_PREFIXES = [
  '/api/onboarding',
  '/api/matters',
  '/api/conversations',
  '/api/practice',
  '/api/preferences',
  '/api/subscriptions',
  '/api/subscription',
  '/api/uploads',
  '/api/user-details'
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
    let responseSnippet: string | undefined;
    try {
      responseSnippet = await response.clone().text();
    } catch (error) {
      responseSnippet = error instanceof Error ? error.message : String(error);
    }
    console.error(`[Auth Proxy Error] ${method} ${url.pathname}`, {
      status: response.status,
      statusText: response.statusText,
      hasRequestBody: Boolean(init.body),
      contentType: headers.get('Content-Type'),
      hasAuthorization: Boolean(headers.get('Authorization')),
      responseSnippet: responseSnippet ? responseSnippet.slice(0, 500) : undefined
    });
  }

  const { headers: proxyHeaders } = buildProxyHeaders(response, requestHost);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: proxyHeaders
  });
}

const isBackendProxyPath = (path: string): boolean =>
  BACKEND_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));

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

  const response = await fetch(targetUrl.toString(), init);

  // Log errors for debugging
  if (!response.ok) {
    let responseSnippet: string | undefined;
    try {
      responseSnippet = await response.clone().text();
    } catch (error) {
      responseSnippet = error instanceof Error ? error.message : String(error);
    }
    console.error(`[Backend Proxy Error] ${method} ${url.pathname}`, {
      status: response.status,
      statusText: response.statusText,
      hasRequestBody: Boolean(init.body),
      contentType: headers.get('Content-Type'),
      hasAuthorization: Boolean(headers.get('Authorization')),
      responseSnippet: responseSnippet ? responseSnippet.slice(0, 500) : undefined
    });
  }
  
  const { headers: proxyHeaders } = buildProxyHeaders(response, requestHost);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: proxyHeaders
  });
}
