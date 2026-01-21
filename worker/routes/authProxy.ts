import type { Env } from '../types.js';
import { HttpErrors } from '../errorHandler.js';
import { getDomain } from 'tldts';

const AUTH_PATH_PREFIX = '/api/auth';
const GET_SESSION_PATH = `${AUTH_PATH_PREFIX}/get-session`;
const SUBSCRIPTIONS_CURRENT_PATH = '/api/subscriptions/current';
const DOMAIN_PATTERN = /;\s*domain=[^;]+/i;
const SESSION_COOKIE_NAMES = ['__Secure-better-auth.session_token', 'better-auth.session_token'];
const SESSION_CACHE_TTL_MS = 5000;
const SESSION_CACHE_MAX_ENTRIES = 200;
const BACKEND_PATH_PREFIXES = [
  '/api/onboarding',
  '/api/conversations',
  '/api/practice',
  '/api/preferences',
  '/api/subscriptions',
  '/api/subscription',
  '/api/uploads'
];

type SessionCacheEntry = {
  body: ArrayBuffer;
  status: number;
  statusText: string;
  headers: Array<[string, string]>;
  expiresAt: number;
};

const sessionCache = new Map<string, SessionCacheEntry>();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

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

const resolveReferenceIdFromSession = async (env: Env, request: Request): Promise<string | null> => {
  const cookie = request.headers.get('Cookie');
  if (!cookie) return null;

  const response = await fetch(`${env.BACKEND_API_URL}/api/auth/get-session`, {
    method: 'GET',
    headers: { Cookie: cookie }
  });

  if (!response.ok) return null;
  const payload = await response.json().catch(() => null);
  if (!isRecord(payload)) return null;
  const container = isRecord(payload.data) ? payload.data : payload;
  if (!isRecord(container)) return null;
  const session = isRecord(container.session) ? container.session : null;
  if (!session) return null;

  const raw = session.active_organization_id ?? session.activeOrganizationId ?? null;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
};


const extractSessionCookie = (cookieHeader: string): string | null => {
  const cookies = cookieHeader.split(';');
  for (const cookie of cookies) {
    const trimmed = cookie.trim();
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const rawName = trimmed.slice(0, eqIndex);
    const rawValue = trimmed.slice(eqIndex + 1);
    if (!rawName || !rawValue) continue;
    if (SESSION_COOKIE_NAMES.includes(rawName)) {
      return `${rawName}=${rawValue}`;
    }
  }
  return null;
};

const getSessionCacheKey = (cookieHeader: string | null, requestHost: string): string | null => {
  if (!cookieHeader) return null;
  const sessionCookie = extractSessionCookie(cookieHeader);
  if (!sessionCookie) return null;
  return `${requestHost}|${sessionCookie}`;
};

const pruneSessionCache = (): void => {
  if (sessionCache.size <= SESSION_CACHE_MAX_ENTRIES) return;
  const now = Date.now();
  for (const [key, entry] of sessionCache) {
    if (entry.expiresAt <= now) {
      sessionCache.delete(key);
    }
    if (sessionCache.size <= SESSION_CACHE_MAX_ENTRIES) {
      return;
    }
  }
  while (sessionCache.size > SESSION_CACHE_MAX_ENTRIES) {
    const firstKey = sessionCache.keys().next().value as string | undefined;
    if (!firstKey) break;
    sessionCache.delete(firstKey);
  }
};

const getCachedSession = (cacheKey: string): SessionCacheEntry | null => {
  const cached = sessionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached;
  }
  if (cached) {
    sessionCache.delete(cacheKey);
  }
  return null;
};

const storeSessionCache = (cacheKey: string, entry: SessionCacheEntry): void => {
  sessionCache.set(cacheKey, entry);
  pruneSessionCache();
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
  const isGetSessionRequest = method === 'GET' && url.pathname === GET_SESSION_PATH;
  const cacheKey = isGetSessionRequest
    ? getSessionCacheKey(request.headers.get('Cookie'), requestHost)
    : null;

  if (cacheKey) {
    const cached = getCachedSession(cacheKey);
    if (cached) {
      return new Response(cached.body.slice(0), {
        status: cached.status,
        statusText: cached.statusText,
        headers: new Headers(cached.headers)
      });
    }
  }

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

  let response: Response;
  if (isGetSessionRequest) {
    const maxAttempts = 3;
    let retryDelayMs = 500;
    response = await fetch(targetUrl.toString(), init);
    for (let attempt = 1; attempt < maxAttempts && response.status === 429; attempt += 1) {
      const retryAfter = response.headers.get('Retry-After');
      const retryAfterMs = retryAfter ? Number(retryAfter) * 1000 : NaN;
      const waitMs = Number.isFinite(retryAfterMs)
        ? Math.max(retryAfterMs, retryDelayMs)
        : retryDelayMs;
      await new Promise(resolve => setTimeout(resolve, waitMs));
      retryDelayMs = Math.min(retryDelayMs * 2, 3000);
      response = await fetch(targetUrl.toString(), init);
    }
  } else {
    response = await fetch(targetUrl.toString(), init);
  }

  const { headers: proxyHeaders, hasSetCookie } = buildProxyHeaders(response, requestHost);

  if (isGetSessionRequest && cacheKey && response.ok && !hasSetCookie) {
    const body = await response.arrayBuffer();
    const cachedHeaders: Array<[string, string]> = [];
    proxyHeaders.forEach((value, key) => {
      cachedHeaders.push([key, value]);
    });
    storeSessionCache(cacheKey, {
      body,
      status: response.status,
      statusText: response.statusText,
      headers: cachedHeaders,
      expiresAt: Date.now() + SESSION_CACHE_TTL_MS
    });
    return new Response(body.slice(0), {
      status: response.status,
      statusText: response.statusText,
      headers: proxyHeaders
    });
  }

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
      resolvedReferenceId = await resolveReferenceIdFromSession(env, request);
      if (resolvedReferenceId) {
        url.searchParams.set('reference_id', resolvedReferenceId);
        url.searchParams.set('referenceId', resolvedReferenceId);
      }
    }
  }

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
  const { headers: proxyHeaders } = buildProxyHeaders(response, requestHost);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: proxyHeaders
  });
}
