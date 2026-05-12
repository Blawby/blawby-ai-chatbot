/**
 * Per-practice "which conversations have an accepted intake" lookup.
 *
 * Backend is the source of truth for intake state. The worker doesn't mirror
 * intake records into D1, so visibility decisions on the conversation list
 * require asking the backend which `conversation_id`s currently have an
 * accepted intake. Cached briefly per-practice — every page load of an
 * inbox would otherwise round-trip to staging-api.
 *
 * Same source used by:
 *   - GET /api/conversations (visibility filter; this module)
 *   - GET /api/practice/:id/sidebar/counts (badge counts)
 *
 * See: project_conversation_visibility memory.
 */

import type { Env } from '../types.js';
import { edgeCache } from './edgeCache.js';
import { Logger } from './logger.js';

const MAX_LIST_PAGES = 10;
const MAX_LIST_PAGE_SIZE = 100;
const CACHE_TTL_MS = 60_000;

/**
 * Recursively look for an array under any of `candidateKeys`, descending into
 * `.data` wrappers. Mirrors the loose extractor used in sidebarCounts so
 * shape drift in the backend response doesn't silently zero-out the set.
 */
const extractListArray = (raw: unknown, candidateKeys: readonly string[]): Record<string, unknown>[] => {
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  if (!raw || typeof raw !== 'object') return [];
  const record = raw as Record<string, unknown>;
  for (const key of candidateKeys) {
    const value = record[key];
    if (Array.isArray(value)) return value as Record<string, unknown>[];
  }
  if (record.data) return extractListArray(record.data, candidateKeys);
  return [];
};

const fetchAcceptedIntakeConversationIdsUncached = async (
  backendUrl: string,
  practiceId: string,
  headers: Record<string, string>,
): Promise<string[]> => {
  const ids: string[] = [];
  for (let page = 1; page <= MAX_LIST_PAGES; page += 1) {
    try {
      const url = `${backendUrl}/api/practice-client-intakes/${encodeURIComponent(practiceId)}?page=${page}&limit=${MAX_LIST_PAGE_SIZE}&status=accepted`;
      const resp = await fetch(url, { headers });
      if (!resp.ok) {
        Logger.warn('intakeVisibility: accepted intakes fetch non-OK', {
          practiceId,
          page,
          status: resp.status,
        });
        break;
      }
      const json = await resp.json();
      const items = extractListArray(json, ['intakes', 'items']);
      for (const item of items) {
        const cid = typeof item.conversation_id === 'string' ? item.conversation_id.trim() : '';
        if (cid) ids.push(cid);
      }
      if (items.length < MAX_LIST_PAGE_SIZE) break;
    } catch (error) {
      Logger.warn('intakeVisibility: accepted intakes fetch threw', {
        practiceId,
        page,
        error: error instanceof Error ? error.message : String(error),
      });
      break;
    }
  }
  return ids;
};

/**
 * Build the headers used to forward the requester's auth to backend. Cookie
 * is required (better-auth session); Authorization is forwarded if present
 * for non-cookie auth (widget tokens etc.).
 */
export const buildForwardHeaders = (request: Request): Record<string, string> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const cookie = request.headers.get('Cookie');
  if (cookie) headers['Cookie'] = cookie;
  const authorization = request.headers.get('Authorization');
  if (authorization) headers['Authorization'] = authorization;
  return headers;
};

/**
 * Returns the set of conversation_ids in this practice whose intake has been
 * accepted. Cached at the edge for `CACHE_TTL_MS` per (practice, requester-
 * cookie-hash) — the backend scopes by the caller's auth, so we can't share
 * the cache across users without leaking visibility.
 *
 * On any error: returns null (caller falls back to lifecycle_status='visible'
 * only — degraded but safe).
 */
/**
 * Lazy materialization: for each conversation_id in the accepted set whose
 * row is still `lifecycle_status='pending_visibility'`, flip it to `'visible'`
 * and stamp `intake_accepted_at = now()`. Idempotent — re-runs are no-ops.
 *
 * Why: the OR-IN clause in the SQL filter handles visibility correctly even
 * if the column is stale, but the column should reflect truth so that the
 * steady-state filter is `WHERE lifecycle_status='visible'` (cheaper) and
 * external tooling can rely on the column directly.
 *
 * One write per list call. Bounded by the accepted set size (~hundreds).
 */
export const materializeAcceptedConversations = async (
  env: Env,
  practiceId: string,
  acceptedIds: Set<string>,
): Promise<void> => {
  if (acceptedIds.size === 0) return;
  const ids = Array.from(acceptedIds);
  const placeholders = ids.map(() => '?').join(', ');
  try {
    await env.DB.prepare(
      `UPDATE conversations
         SET lifecycle_status = 'visible',
             intake_accepted_at = COALESCE(intake_accepted_at, CURRENT_TIMESTAMP),
             updated_at = CURRENT_TIMESTAMP
       WHERE practice_id = ?
         AND lifecycle_status = 'pending_visibility'
         AND id IN (${placeholders})`
    )
      .bind(practiceId, ...ids)
      .run();
  } catch (error) {
    // Materialization is a cache-priming write — failure must not break the
    // list response. The OR-IN clause in the read query still returns the
    // right rows; the column just stays stale until the next attempt.
    Logger.warn('intakeVisibility: lifecycle_status materialization failed', {
      practiceId,
      idCount: ids.length,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

export const getAcceptedIntakeConversationIds = async (
  env: Env,
  practiceId: string,
  request: Request,
): Promise<Set<string> | null> => {
  if (!env.BACKEND_API_URL) return null;
  const headers = buildForwardHeaders(request);
  const cookieKeyMaterial = headers['Cookie'] ?? headers['Authorization'] ?? 'anon';
  // Hash the cookie value to keep the cache key bounded and not leak the
  // session token directly into log lines.
  let authHash = 'anon';
  try {
    const encoded = new TextEncoder().encode(cookieKeyMaterial);
    const digest = await crypto.subtle.digest('SHA-256', encoded);
    authHash = Array.from(new Uint8Array(digest).slice(0, 8))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    // crypto.subtle not available in this runtime context (extremely rare on
    // workers) — fall back to a stable bucket so we still cache, just less
    // granularly.
    authHash = 'fallback';
  }
  const cacheKey = `intake-visibility:accepted:${practiceId}:${authHash}`;
  try {
    const ids = await edgeCache.get_or_fetch<string[]>(
      cacheKey,
      () => fetchAcceptedIntakeConversationIdsUncached(env.BACKEND_API_URL, practiceId, headers),
      { ttlMs: CACHE_TTL_MS },
    );
    return new Set(ids);
  } catch (error) {
    Logger.warn('intakeVisibility: cache fetch failed', {
      practiceId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};
