import type { Env } from '../types.js';
import { HttpError } from '../types.js';
import { RemoteApiService } from '../services/RemoteApiService.js';
import { edgeCache } from './edgeCache.js';

const CACHE_TTL_SECONDS = 600;
// In-isolate memoization tier in front of KV. KV stays as the cross-isolate
// persistent cache (10 min); edgeCache absorbs repeated lookups within one
// isolate so we don't pay a KV round-trip per request.
const MEMORY_TTL_MS = 60_000;

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
  if (!trimmed) return;

  // Drop the in-isolate memoization for this id (and any slug entries — we
  // don't track the slug here, so wipe the whole prefix to be safe).
  edgeCache.invalidate('practice:details:', /* prefix */ true);

  if (!env.CHAT_SESSIONS) return;
  const uuidKey = `practice_details:${trimmed}`;
  const slugKey = `practice_details:slug:${trimmed}`;
  await Promise.all([
    env.CHAT_SESSIONS.delete(uuidKey),
    env.CHAT_SESSIONS.delete(slugKey)
  ]);
};

type PracticeDetailsResult = {
  details: Record<string, unknown> | null;
  isPublic: boolean;
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
): Promise<PracticeDetailsResult> => {
  const trimmedSlug = practiceSlug?.trim() ?? '';

  // Require at least one identifier. Empty practiceId is allowed when slug is present
  // (anonymous prefetch path — practiceId not yet known).
  if (!practiceId && !trimmedSlug) {
    return { details: null, isPublic: false };
  }

  // Memoize per-isolate. The KV layer below remains the source of truth across
  // isolates; this just absorbs repeated reads inside one isolate's lifetime.
  // bypassCache also skips the in-memory tier so callers can force-refresh.
  const memoKey = `practice:details:${practiceId || `slug:${trimmedSlug}`}`;
  if (!options?.bypassCache) {
    const memoized = edgeCache.get<PracticeDetailsResult>(memoKey);
    if (memoized) return memoized;
  }
  const result = await fetchPracticeDetailsUncached(env, request, practiceId, trimmedSlug, options);
  if (!options?.bypassCache && result.details) {
    edgeCache.set(memoKey, result, MEMORY_TTL_MS);
  }
  return result;
};

const fetchPracticeDetailsUncached = async (
  env: Env,
  request: Request,
  practiceId: string,
  trimmedSlug: string,
  options?: {
    bypassCache?: boolean;
    preferPracticeIdLookup?: boolean;
  }
): Promise<PracticeDetailsResult> => {

  // Two cache namespaces:
  //   UUID key  — used when practiceId is a real UUID (primary, most callers)
  //   Slug key  — used when only practiceSlug is available (anonymous prefetch)
  // Reads check UUID first, slug as fallback.
  // Writes populate both keys whenever payload and both identifiers are available.
  const uuidKey = practiceId ? `practice_details:${practiceId}` : null;
  const slugKey = trimmedSlug ? `practice_details:slug:${trimmedSlug}` : null;

  const writeToCache = async (payload: unknown, isPublicResponse: boolean): Promise<void> => {
    if (options?.bypassCache || !env.CHAT_SESSIONS || !payload) return;
    const serialized = JSON.stringify({ payload });
    const ttl = { expirationTtl: CACHE_TTL_SECONDS };
    const writes: Promise<void>[] = [];
    
    // Always write to UUID key for authenticated responses
    if (uuidKey) writes.push(env.CHAT_SESSIONS.put(uuidKey, serialized, ttl));
    
    // Only write to slug key for public/canonical responses to prevent
    // auth-gated payloads from being accessible via slug namespace
    if (slugKey && isPublicResponse) {
      writes.push(env.CHAT_SESSIONS.put(slugKey, serialized, ttl));
    }
    
    await Promise.all(writes);
  };

  if (!options?.bypassCache && env.CHAT_SESSIONS) {
    // Check UUID key first, then slug key as fallback.
    const keysToTry = [uuidKey, slugKey].filter((k): k is string => k !== null);
    for (const key of keysToTry) {
      const cached = await env.CHAT_SESSIONS.get(key, 'json') as { payload?: unknown } | null;
      if (cached?.payload) {
        const details = extractDetailsContainer(cached.payload);
        if (details) {
          const isPublic = Boolean(details?.is_public ?? details?.isPublic);
          return { details, isPublic };
        }
        // Stale/corrupt entry — evict and fall through to a fresh fetch.
        await env.CHAT_SESSIONS.delete(key);
      }
    }
  }

  if (options?.preferPracticeIdLookup && practiceId) {
    try {
      const response = await RemoteApiService.getPracticeDetailsById(env, practiceId, request);
      const payload = await response.json().catch(() => null);
      const details = extractDetailsContainer(payload);
      const isPublic = Boolean(details?.is_public ?? details?.isPublic);
      await writeToCache(payload, isPublic);
      return { details, isPublic };
    } catch (error) {
      // Fall through to slug lookup on auth/not-found errors.
      if (!(error instanceof HttpError) || (error.status !== 404 && error.status !== 401 && error.status !== 403)) {
        throw error;
      }
    }
  }

  const isUuid = (value: string): boolean =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

  // Resolve the slug to use for the public API call.
  let resolvedSlug = trimmedSlug || practiceId;
  if (!trimmedSlug && practiceId && isUuid(practiceId)) {
    try {
      const practice = await RemoteApiService.getPractice(env, practiceId, request);
      if (practice?.slug) {
        resolvedSlug = practice.slug;
      }
    } catch {
      resolvedSlug = practiceId;
    }
  }

  let response: Response;
  try {
    response = await RemoteApiService.getPublicPracticeDetails(env, resolvedSlug, request);
  } catch (error) {
    if (error instanceof HttpError && resolvedSlug !== practiceId && practiceId) {
      response = await RemoteApiService.getPublicPracticeDetails(env, practiceId, request);
    } else {
      throw error;
    }
  }

  const payload = await response.json().catch(() => null);
  const details = extractDetailsContainer(payload);
  const isPublic = Boolean(details?.is_public ?? details?.isPublic);
  await writeToCache(payload, isPublic);

  return { details, isPublic };
};
