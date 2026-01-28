import type { Env } from '../types.js';
import { RemoteApiService } from '../services/RemoteApiService.js';

const CACHE_TTL_SECONDS = 600;
const SLUG_CACHE_PREFIX = 'practice_slug:';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const extractDetailsContainer = (payload: unknown): Record<string, unknown> | null => {
  if (!isRecord(payload)) return null;
  if ('details' in payload && isRecord(payload.details)) {
    return payload.details as Record<string, unknown>;
  }
  if ('data' in payload && isRecord(payload.data) && isRecord(payload.data.details)) {
    return payload.data.details as Record<string, unknown>;
  }
  return payload;
};

const resolvePracticeSlug = async (
  env: Env,
  request: Request,
  practiceId: string,
  hint?: string | null
): Promise<string | null> => {
  const trimmedHint = hint?.trim();
  if (trimmedHint) {
    return trimmedHint;
  }

  const cacheKey = `${SLUG_CACHE_PREFIX}${practiceId}`;
  if (env.CHAT_SESSIONS) {
    const cached = await env.CHAT_SESSIONS.get(cacheKey, 'text');
    if (cached) {
      return cached;
    }
  }

  const practice = await RemoteApiService.getPractice(env, practiceId, request);
  const slug = typeof practice?.slug === 'string' ? practice.slug.trim() : '';
  if (slug && env.CHAT_SESSIONS) {
    await env.CHAT_SESSIONS.put(cacheKey, slug, { expirationTtl: CACHE_TTL_SECONDS });
  }
  return slug || null;
};

export const fetchPracticeDetailsWithCache = async (
  env: Env,
  request: Request,
  options: {
    practiceId: string;
    practiceSlug?: string | null;
  }
): Promise<{
  details: Record<string, unknown> | null;
  isPublic: boolean;
}> => {
  const practiceSlug = await resolvePracticeSlug(env, request, options.practiceId, options.practiceSlug);
  if (!practiceSlug) {
    return { details: null, isPublic: false };
  }
  const cacheKey = `practice_details:${practiceSlug}`;
  if (env.CHAT_SESSIONS) {
    const cached = await env.CHAT_SESSIONS.get(cacheKey, 'json') as { payload?: unknown } | null;
    if (cached?.payload) {
      const details = extractDetailsContainer(cached.payload);
      const isPublic = Boolean(details?.is_public ?? details?.isPublic);
      return { details, isPublic };
    }
  }

  const baseUrl = new URL(request.url);
  baseUrl.pathname = `/api/practice/details/${encodeURIComponent(practiceSlug)}`;
  baseUrl.search = '';

  const response = await fetch(baseUrl.toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    return { details: null, isPublic: false };
  }

  const payload = await response.json().catch(() => null);
  const details = extractDetailsContainer(payload);
  const isPublic = Boolean(details?.is_public ?? details?.isPublic);

  if (env.CHAT_SESSIONS && payload) {
    await env.CHAT_SESSIONS.put(cacheKey, JSON.stringify({ payload }), {
      expirationTtl: CACHE_TTL_SECONDS
    });
  }

  return { details, isPublic };
};
