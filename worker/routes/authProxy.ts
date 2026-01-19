import type { Env } from '../types.js';
import { HttpErrors } from '../errorHandler.js';

const AUTH_PATH_PREFIX = '/api/auth';

const stripCookieDomain = (value: string): string => {
  return value.replace(/;\s*domain=[^;]+/gi, '');
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

  proxyHeaders.delete('Set-Cookie');
  if (response.headers.getSetCookie) {
    const cookies = response.headers.getSetCookie();
    for (const cookie of cookies) {
      proxyHeaders.append('Set-Cookie', stripCookieDomain(cookie));
    }
  } else {
    const setCookie = response.headers.get('Set-Cookie');
    if (setCookie) {
      proxyHeaders.set('Set-Cookie', stripCookieDomain(setCookie));
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: proxyHeaders
  });
}
