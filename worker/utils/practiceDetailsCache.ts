import type { Env } from '../types.js';
import { HttpError } from '../types.js';
import { RemoteApiService } from '../services/RemoteApiService.js';
const CACHE_TTL_SECONDS = 600;

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

export const invalidatePracticeDetailsCache = async (
  env: Env,
  practiceId: string | null | undefined
): Promise<void> => {
  const trimmed = typeof practiceId === 'string' ? practiceId.trim() : '';
  if (!trimmed || !env.CHAT_SESSIONS) return;
  await env.CHAT_SESSIONS.delete(`practice_details:${trimmed}`);
};

export const fetchPracticeDetailsWithCache = async (
  env: Env,
  request: Request,
  practiceId: string,
  practiceSlug?: string | null,
  options?: {
    bypassCache?: boolean;
    preferPracticeIdLookup?: boolean;
  }
): Promise<{
  details: Record<string, unknown> | null;
  isPublic: boolean;
}> => {
  if (!practiceId) {
    return { details: null, isPublic: false };
  }
  const cacheKey = `practice_details:${practiceId}`;
  if (!options?.bypassCache && env.CHAT_SESSIONS) {
    const cached = await env.CHAT_SESSIONS.get(cacheKey, 'json') as { payload?: unknown } | null;
    if (cached?.payload) {
      const details = extractDetailsContainer(cached.payload);
      const isPublic = Boolean(details?.is_public ?? details?.isPublic);
      return { details, isPublic };
    }
  }

  if (options?.preferPracticeIdLookup) {
    try {
      const baseUrl = new URL(request.url);
      baseUrl.pathname = `/api/practice/${encodeURIComponent(practiceId)}/details`;
      baseUrl.search = '';
      const response = await fetch(baseUrl.toString(), {
        method: 'GET',
        headers: {
          Accept: 'application/json'
        }
      });
      if (!response.ok) {
        if (response.status === 404) {
          return { details: null, isPublic: false };
        }
        return { details: null, isPublic: false };
      }
      const payload = await response.json().catch(() => null);
      const details = extractDetailsContainer(payload);
      const isPublic = Boolean(details?.is_public ?? details?.isPublic);

      if (!options?.bypassCache && env.CHAT_SESSIONS && payload) {
        await env.CHAT_SESSIONS.put(cacheKey, JSON.stringify({ payload }), {
          expirationTtl: CACHE_TTL_SECONDS
        });
      }

      return { details, isPublic };
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) {
        return { details: null, isPublic: false };
      }
      return { details: null, isPublic: false };
    }
  }

  const isUuid = (value: string): boolean =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

  let resolvedSlug = practiceSlug?.trim() || practiceId;
  if (!practiceSlug && isUuid(practiceId)) {
    try {
      const practice = await RemoteApiService.getPractice(env, practiceId, request);
      if (practice?.slug) {
        resolvedSlug = practice.slug;
      }
    } catch {
      resolvedSlug = practiceId;
    }
  }

  const baseUrl = new URL(request.url);
  baseUrl.pathname = `/api/practice/details/${encodeURIComponent(resolvedSlug)}`;
  baseUrl.search = '';

  let response = await fetch(baseUrl.toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok && resolvedSlug !== practiceId) {
    baseUrl.pathname = `/api/practice/details/${encodeURIComponent(practiceId)}`;
    response = await fetch(baseUrl.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json'
      }
    });
  }

  if (!response.ok) {
    return { details: null, isPublic: false };
  }

  const payload = await response.json().catch(() => null);
  const details = extractDetailsContainer(payload);
  const isPublic = Boolean(details?.is_public ?? details?.isPublic);

  if (!options?.bypassCache && env.CHAT_SESSIONS && payload) {
    await env.CHAT_SESSIONS.put(cacheKey, JSON.stringify({ payload }), {
      expirationTtl: CACHE_TTL_SECONDS
    });
  }

  return { details, isPublic };
};
