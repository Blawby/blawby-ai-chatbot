import type { Env } from '../types.js';
import { getDomain } from 'tldts';
import { HttpErrors } from '../errorHandler.js';
import { requirePracticeMember } from '../middleware/auth.js';
import { handleBackendProxy } from './authProxy.js';
import { ConversationService } from '../services/ConversationService.js';
import { withPracticeContext, getPracticeId } from '../middleware/practiceContext.js';

const UPDATE_PATTERN = /^\/api\/matters\/([^/]+)\/update\/([^/]+)$/;
const ACTIVITY_PATTERN = /^\/api\/matters\/([^/]+)\/matters\/([^/]+)\/activity$/;
const CONVERSATIONS_PATTERN = /^\/api\/matters\/([^/]+)\/([^/]+)\/conversations$/;
const DOMAIN_PATTERN = /;\s*domain=[^;]+/i;

const resolveRequestHost = (request: Request): string => {
  const forwardedHost = request.headers.get('X-Forwarded-Host');
  if (forwardedHost) {
    return forwardedHost.split(',')[0].trim();
  }
  const forwarded = request.headers.get('Forwarded');
  if (forwarded) {
    const entries = forwarded.split(',').map((entry) => entry.trim());
    for (const entry of entries) {
      const match = entry.match(/host=([^;]+)/i);
      if (match) {
        const rawHost = match[1].trim();
        return rawHost.replace(/^"|"$|^'|'$/g, '');
      }
    }
  }
  return new URL(request.url).host;
};

const normalizeCookieDomain = (value: string, requestHost: string, env?: Env): string => {
  const cookieName = value.split('=')[0]?.trim().toLowerCase() ?? '';
  if (cookieName.startsWith('__host-')) {
    return value.replace(DOMAIN_PATTERN, '');
  }

  // Use configured DOMAIN if available
  if (env?.DOMAIN) {
    const domainValue = env.DOMAIN.startsWith('.') ? env.DOMAIN : `.${env.DOMAIN}`;
    if (DOMAIN_PATTERN.test(value)) {
      return value.replace(DOMAIN_PATTERN, `; Domain=${domainValue}`);
    }
    return value;
  }

  // Use tldts to get the registrable domain (e.g. example.co.uk)
  const registrable = getDomain(requestHost);
  if (!registrable) {
    return value.replace(DOMAIN_PATTERN, '');
  }

  const domainValue = `.${registrable}`;
  if (DOMAIN_PATTERN.test(value)) {
    return value.replace(DOMAIN_PATTERN, `; Domain=${domainValue}`);
  }
  return value;
};

const buildProxyHeaders = (response: Response, requestHost: string, env?: Env): Headers => {
  const proxyHeaders = new Headers(response.headers);
  proxyHeaders.delete('Set-Cookie');
  const headersWithSetCookie = response.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headersWithSetCookie.getSetCookie === 'function') {
    const cookies = headersWithSetCookie.getSetCookie();
    for (const cookie of cookies) {
      proxyHeaders.append('Set-Cookie', normalizeCookieDomain(cookie, requestHost, env));
    }
    return proxyHeaders;
  }
  const setCookie = response.headers.get('Set-Cookie');
  if (setCookie) {
    // Note: response.headers.get('Set-Cookie') in many environments only returns the first cookie.
    // If headers.raw() or headers.getSetCookie() (available above) are not supported,
    // subsequent cookies may be lost. append() is used here to stay as standard as possible.
    proxyHeaders.append('Set-Cookie', normalizeCookieDomain(setCookie, requestHost, env));
  }
  return proxyHeaders;
};

const resolveBackendUrl = (env: Env): string => {
  if (!env.BACKEND_API_URL) {
    throw HttpErrors.internalServerError('BACKEND_API_URL must be configured for matters proxy');
  }
  return env.BACKEND_API_URL;
};

const createJsonResponse = (data: unknown): Response => (
  new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
);

const fetchBackend = async (
  env: Env,
  headers: Headers,
  targetPath: string,
  init?: { method?: string; body?: BodyInit | null; signal?: AbortSignal }
): Promise<Response> => {
  const backendUrl = resolveBackendUrl(env);
  const timeoutMs = 10000;
  let signal: AbortSignal;
  let cleanup: (() => void) | undefined;

  // Use AbortSignal.any if available (Node 20+, recent browsers, Cloudflare Workers)
  if (typeof AbortSignal.any === 'function') {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    signal = init?.signal 
      ? AbortSignal.any([init.signal, timeoutSignal])
      : timeoutSignal;
  } else {
    // Fallback: Create manual controller that races custom signal + timer
    const controller = new AbortController();
    signal = controller.signal;
    
    // 1. Timeout timer
    const timerId = setTimeout(() => controller.abort(), timeoutMs);

    // 2. Listener for user signal
    const onAbort = () => controller.abort();
    if (init?.signal) {
      if (init.signal.aborted) {
        controller.abort();
        clearTimeout(timerId);
      } else {
        init.signal.addEventListener('abort', onAbort);
      }
    }

    cleanup = () => {
      clearTimeout(timerId);
      init?.signal?.removeEventListener('abort', onAbort);
    };
  }

  return fetch(`${backendUrl}${targetPath}`, {
    method: init?.method ?? 'GET',
    headers,
    body: init?.body,
    signal
  }).finally(() => {
    cleanup?.();
  });
};

export async function handleMatters(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/matters')) {
    throw HttpErrors.notFound('Matters route not found');
  }

  const conversationsMatch = url.pathname.match(CONVERSATIONS_PATTERN);
  if (conversationsMatch) {
    if (request.method.toUpperCase() !== 'GET') {
      return new Response('Method not allowed', {
        status: 405,
        headers: { 'Allow': 'GET' }
      });
    }

    const requestWithContext = await withPracticeContext(request, env, {
      requirePractice: true
    });
    const practiceId = getPracticeId(requestWithContext);
    const rawPracticeId = conversationsMatch[1];
    const matterId = conversationsMatch[2];

    if (rawPracticeId && rawPracticeId !== practiceId) {
      console.warn('[Matters] Practice ID mismatch in conversations route', {
        practiceId,
        rawPracticeId
      });
      return new Response(JSON.stringify({ error: 'Practice ID mismatch' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    await requirePracticeMember(requestWithContext, env, practiceId, 'paralegal');

    const conversationService = new ConversationService(env);
    const conversations = await conversationService.listByMatterId(matterId, practiceId);

    return createJsonResponse(conversations);
  }

  const updateMatch = url.pathname.match(UPDATE_PATTERN);
  if (updateMatch) {
    if (!['PUT', 'PATCH', 'POST'].includes(request.method.toUpperCase())) {
      return new Response('Method not allowed', { 
        status: 405,
        headers: { 'Allow': 'PUT, PATCH, POST' }
      });
    }
    const [, rawPracticeId, rawMatterId] = updateMatch;
    const requestWithContext = await withPracticeContext(request, env, {
      requirePractice: true
    });
    const practiceId = getPracticeId(requestWithContext);
    const matterId = rawMatterId;

    if (rawPracticeId && rawPracticeId !== practiceId) {
      console.warn('[Matters] Practice ID mismatch in update route', {
        practiceId,
        rawPracticeId
      });
      return new Response(JSON.stringify({ error: 'Practice ID mismatch' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    await requirePracticeMember(requestWithContext, env, practiceId, 'paralegal');
    const requestHost = resolveRequestHost(requestWithContext);
    const headers = new Headers(requestWithContext.headers);
    const requestBody = await requestWithContext.arrayBuffer();
    const backendPath = `/api/matters/${encodeURIComponent(practiceId)}/update/${encodeURIComponent(matterId)}${url.search}`;

    const updateResponse = await fetchBackend(
      env,
      headers,
      backendPath,
      {
        method: request.method,
        body: requestBody
      }
    );

    const proxyHeaders = buildProxyHeaders(updateResponse, requestHost, env);
    const updateBuffer = await updateResponse.arrayBuffer();

    return new Response(updateBuffer, {
      status: updateResponse.status,
      statusText: updateResponse.statusText,
      headers: proxyHeaders
    });
  }

  const activityMatch = url.pathname.match(ACTIVITY_PATTERN);
  if (activityMatch) {
    if (request.method.toUpperCase() !== 'GET') {
      return new Response('Method not allowed', { 
        status: 405,
        headers: { 'Allow': 'GET' }
      });
    }
    const [, _practiceId] = activityMatch;
    
    const requestWithContext = await withPracticeContext(request, env, {
      requirePractice: true
    });
    const practiceId = getPracticeId(requestWithContext);
    
    if (_practiceId && _practiceId !== practiceId) {
      console.warn('[Matters] Practice ID mismatch in activity route', {
        practiceId,
        _practiceId
      });
      return new Response(JSON.stringify({ error: 'Practice ID mismatch' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    await requirePracticeMember(requestWithContext, env, practiceId, 'paralegal');
    const requestHost = resolveRequestHost(requestWithContext);
    const headers = new Headers(requestWithContext.headers);
    const backendResponse = await fetchBackend(env, headers, url.pathname + url.search, {
      method: 'GET'
    });
    const proxyHeaders = buildProxyHeaders(backendResponse, requestHost, env);
    const responseBody = await backendResponse.arrayBuffer();
    return new Response(responseBody, {
      status: backendResponse.status,
      statusText: backendResponse.statusText,
      headers: proxyHeaders
    });
  }

  return handleBackendProxy(request, env);
}
