/**
 * Shared proxy infrastructure for the worker's BFF passthrough routes.
 *
 * Both `handleAuthProxy` and `handleBackendProxy` need to:
 *   1. Resolve the original client host so Set-Cookie domains are correct
 *      regardless of where Cloudflare terminated the connection.
 *   2. Rewrite Set-Cookie `domain=` to the request's base domain (or
 *      strip it for `__Host-` prefixed cookies).
 *   3. Optionally add debug-only X-Debug-* headers describing the cookie
 *      shape, gated on env.DEBUG && !production.
 *
 * Centralizing here means there's one implementation to audit. Callers
 * that need the BACKEND_API_URL forwarder still build their own fetch
 * — this module is the cookie/header utilities, not the fetch itself.
 */

import { getDomain } from 'tldts';
import type { Env } from '../types.js';

const DOMAIN_PATTERN = /;\s*domain=[^;]+/i;

const getBaseDomain = (host: string): string | null => {
  const hostname = host.split(':')[0].toLowerCase();
  const domain = getDomain(hostname);
  return domain ?? null;
};

/**
 * Rewrite a single Set-Cookie value's `domain=` attribute to the
 * request's base domain. `__Host-` prefixed cookies have their domain
 * attribute stripped per RFC 6265bis (host-only requirement).
 */
export const normalizeCookieDomain = (value: string, requestHost: string): string => {
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

/**
 * Resolve the original client host. Honors X-Forwarded-Host and
 * Forwarded headers (set by Cloudflare / upstream proxies); falls back
 * to the request URL's host.
 */
export const resolveRequestHost = (request: Request): string => {
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

/**
 * Build response headers for the proxied response: copies upstream
 * headers, replaces Set-Cookie with domain-normalized variants, and
 * reports whether any Set-Cookie was present (caller may use this to
 * skip caching).
 */
export const buildProxyHeaders = (
  response: Response,
  requestHost: string,
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

/**
 * Append X-Debug-* headers describing the Set-Cookie shape. Gated on
 * env.DEBUG (or env.ALLOW_DEBUG) AND non-production. Used by the proxy
 * routes to surface cookie attributes for debugging cross-origin auth
 * issues. No-op in production.
 */
export const appendDebugHeaders = (
  proxyHeaders: Headers,
  response: Response,
  request: Request,
  env: Env,
): void => {
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
