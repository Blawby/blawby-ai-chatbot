import { Env, HttpError } from '../types.js';
import { HttpErrors, createRateLimitResponse } from '../errorHandler.js';
import { getClientId, rateLimit } from '../middleware/rateLimit.js';
import { RemoteApiService } from '../services/RemoteApiService.js';

const CACHE_TTL_SECONDS = 300;
const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX_REQUESTS = 60;

const buildWidgetDetailsResponse = (accentColor: string | null): Response =>
  new Response(JSON.stringify({ accentColor, accent_color: accentColor }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`,
    }
  });

const buildNoStoreErrorResponse = (
  status: number,
  statusText: string,
  bodyText: string,
  contentType: string | null
): Response => {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'Content-Type': contentType || 'application/json',
  });

  const fallbackBody = JSON.stringify({
    error: statusText || 'Upstream request failed'
  });

  return new Response(bodyText || fallbackBody, {
    status,
    statusText,
    headers,
  });
};

const getUpstreamResponseFromError = (error: unknown): Response | null => {
  if (!error || typeof error !== 'object') return null;
  const candidate = (error as { response?: unknown }).response;
  return candidate instanceof Response ? candidate : null;
};

export async function handleWidgetPracticeDetails(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') {
    throw HttpErrors.methodNotAllowed('Method not allowed');
  }

  const url = new URL(request.url);
  const prefix = '/api/widget/practice-details/';
  if (!url.pathname.startsWith(prefix)) {
    throw HttpErrors.notFound('Endpoint not found');
  }

  const slug = url.pathname.slice(prefix.length);
  if (!slug) {
    throw HttpErrors.badRequest('practice slug is required');
  }

  let decodedSlug: string;
  try {
    decodedSlug = decodeURIComponent(slug);
  } catch {
    throw HttpErrors.badRequest('Invalid slug encoding');
  }
  if (decodedSlug.includes('/') || decodedSlug.includes('\\')) {
    throw HttpErrors.badRequest('practice slug must be a single path segment');
  }

  const clientId = getClientId(request);
  if (!(await rateLimit(env, `widget_practice_details:${clientId}`, RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_SECONDS))) {
    return createRateLimitResponse(RATE_LIMIT_WINDOW_SECONDS, {
      limit: RATE_LIMIT_MAX_REQUESTS,
      remaining: 0,
      reset: Math.floor(Date.now() / 1000) + RATE_LIMIT_WINDOW_SECONDS,
      errorMessage: 'Rate limit exceeded. Please try again later.'
    });
  }

  const normalizedSlug = decodedSlug.trim().toLowerCase();
  if (!normalizedSlug) {
    throw HttpErrors.badRequest('practice slug is required');
  }
  const cacheKey = `widget_practice_details:${normalizedSlug}`;
  const cachedPayload = env.CHAT_SESSIONS
    ? await env.CHAT_SESSIONS.get(cacheKey, 'json').catch(() => null) as
      | { accentColor?: string | null }
      | null
    : null;
  if (cachedPayload && ('accentColor' in cachedPayload)) {
    return buildWidgetDetailsResponse(cachedPayload.accentColor ?? null);
  }

  let payload: Record<string, unknown> | null = null;
  try {
    // Fetch public practice details anonymously; do not forward caller cookies upstream.
    const remoteResponse = await RemoteApiService.getPublicPracticeDetails(env, decodedSlug);
    payload = await remoteResponse.json() as Record<string, unknown> | null;
  } catch (error) {
    const upstreamResponse = getUpstreamResponseFromError(error);
    if (upstreamResponse) {
      const upstreamBody = await upstreamResponse.text().catch(() => '');
      return buildNoStoreErrorResponse(
        upstreamResponse.status,
        upstreamResponse.statusText,
        upstreamBody,
        upstreamResponse.headers.get('Content-Type')
      );
    }

    if (error instanceof HttpError) {
      const detailsRecord = error.details && typeof error.details === 'object'
        ? error.details as Record<string, unknown>
        : null;
      const upstream = detailsRecord?.upstream;
      const errorBody =
        typeof upstream === 'string'
          ? upstream
          : upstream !== undefined
            ? JSON.stringify(upstream)
            : JSON.stringify({ error: error.message || 'Upstream request failed' });
      return buildNoStoreErrorResponse(
        error.status,
        'Upstream Error',
        errorBody,
        'application/json'
      );
    }

    throw error;
  }

  const dataRecord =
    payload && typeof payload.data === 'object' && payload.data !== null
      ? payload.data as Record<string, unknown>
      : null;
  const detailsRecord =
    payload && typeof payload.details === 'object' && payload.details !== null
      ? payload.details as Record<string, unknown>
      : null;
  const nestedDetailsRecord =
    dataRecord && typeof dataRecord.details === 'object' && dataRecord.details !== null
      ? dataRecord.details as Record<string, unknown>
      : null;

  const accentColor =
    (payload && typeof payload.accentColor === 'string' && payload.accentColor.trim()) ||
    (payload && typeof payload.accent_color === 'string' && payload.accent_color.trim()) ||
    (dataRecord && typeof dataRecord.accentColor === 'string' && dataRecord.accentColor.trim()) ||
    (dataRecord && typeof dataRecord.accent_color === 'string' && dataRecord.accent_color.trim()) ||
    (detailsRecord && typeof detailsRecord.accentColor === 'string' && detailsRecord.accentColor.trim()) ||
    (detailsRecord && typeof detailsRecord.accent_color === 'string' && detailsRecord.accent_color.trim()) ||
    (nestedDetailsRecord && typeof nestedDetailsRecord.accentColor === 'string' && nestedDetailsRecord.accentColor.trim()) ||
    (nestedDetailsRecord && typeof nestedDetailsRecord.accent_color === 'string' && nestedDetailsRecord.accent_color.trim()) ||
    null;

  if (env.CHAT_SESSIONS) {
    await env.CHAT_SESSIONS.put(cacheKey, JSON.stringify({ accentColor }), {
      expirationTtl: CACHE_TTL_SECONDS
    }).catch(() => undefined);
  }

  return buildWidgetDetailsResponse(accentColor);
}
