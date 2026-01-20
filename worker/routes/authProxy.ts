import type { Env } from '../types.js';
import { HttpErrors } from '../errorHandler.js';
import { getDomain } from 'tldts';

const AUTH_PATH_PREFIX = '/api/auth';

const DOMAIN_PATTERN = /;\s*domain=[^;]+/i;

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

  const origin = request.headers.get('Origin');
  if (origin) {
    try {
      return new URL(origin).host;
    } catch {
      // Fall through to other headers.
    }
  }

  const referer = request.headers.get('Referer');
  if (referer) {
    try {
      return new URL(referer).host;
    } catch {
      // Fall through to URL host.
    }
  }

  return new URL(request.url).host;
};

export async function handleAuthProxy(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(AUTH_PATH_PREFIX)) {
    throw HttpErrors.notFound('Auth proxy route not found');
  }

  if (!env.BACKEND_API_URL) {
    throw HttpErrors.internalServerError('BACKEND_API_URL must be configured for auth proxy');
  }

  const targetUrl = new URL(url.pathname + url.search, env.BACKEND_API_URL);
  const headers = new Headers(request.headers);

  const method = request.method.toUpperCase();
  const init: globalThis.RequestInit = {
    method,
    headers,
    redirect: 'manual'
  };

  if (method !== 'GET' && method !== 'HEAD') {
    init.body = await request.arrayBuffer();
  }

  const response = await fetch(targetUrl.toString(), init);
  const proxyHeaders = new Headers(response.headers);
  const requestHost = resolveRequestHost(request);

  proxyHeaders.delete('Set-Cookie');
  if (response.headers.getSetCookie) {
    const cookies = response.headers.getSetCookie();
    for (const cookie of cookies) {
      proxyHeaders.append('Set-Cookie', normalizeCookieDomain(cookie, requestHost));
    }
  } else {
    const setCookie = response.headers.get('Set-Cookie');
    if (setCookie) {
      // Fallback for environments without getSetCookie(); multiple cookies may be joined and ambiguous.
      proxyHeaders.set('Set-Cookie', normalizeCookieDomain(setCookie, requestHost));
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: proxyHeaders
  });
}
