import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import {
  getUserDetail,
  updateUserDetail,
  type UpdateUserDetailPayload,
  type UserDetailRecord,
} from '@/shared/lib/apiClient';

export interface UseUserDetailOptions {
  /** When false, the hook skips fetching (still returns data: null). */
  enabled?: boolean;
}

export interface UseUserDetailResult {
  data: UserDetailRecord | null;
  isLoading: boolean;
  error: string | null;
  /** Patch the user record. Refreshes local data + cache on success.
   *  Rejects (throws) on failure so callers can show inline error UX. */
  mutate: (patch: UpdateUserDetailPayload) => Promise<void>;
  /** Force a network re-fetch, bypassing the cache. */
  refresh: () => Promise<void>;
}

/** Module-level cache keyed by `practiceId:userId`. Survives unmount/remount
 *  so switching inspectors across navigations reuses already-fetched data. */
const userDetailCache = new Map<string, UserDetailRecord | null>();
const cacheKey = (practiceId: string, userId: string) => `${practiceId}:${userId}`;

/**
 * Hook wrapping `getUserDetail` + `updateUserDetail` with abort-safe
 * fetching and module-level caching.
 *
 * Used by the per-feature inspectors (ClientInspector, ConversationInspector)
 * after the InspectorPanel split. See `docs/design-system-migration.md` PR-4
 * scope for context.
 */
export function useUserDetail(
  practiceId: string | null,
  userId: string | null,
  options: UseUserDetailOptions = {},
): UseUserDetailResult {
  const { enabled = true } = options;
  const [data, setData] = useState<UserDetailRecord | null>(() => {
    if (!practiceId || !userId) return null;
    return userDetailCache.get(cacheKey(practiceId, userId)) ?? null;
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchDetail = useCallback(async (force: boolean): Promise<void> => {
    if (!practiceId || !userId || !enabled) {
      setData(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    const key = cacheKey(practiceId, userId);
    if (!force && userDetailCache.has(key)) {
      setData(userDetailCache.get(key) ?? null);
      setError(null);
      setIsLoading(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);
    try {
      const detail = await getUserDetail(practiceId, userId, { signal: controller.signal });
      if (controller.signal.aborted) return;
      userDetailCache.set(key, detail);
      setData(detail);
    } catch (err: unknown) {
      if ((err as DOMException)?.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Failed to load user detail');
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [practiceId, userId, enabled]);

  useEffect(() => {
    void fetchDetail(false);
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchDetail]);

  const mutate = useCallback(async (patch: UpdateUserDetailPayload): Promise<void> => {
    if (!practiceId || !userId) return;
    setError(null);
    try {
      await updateUserDetail(practiceId, userId, patch);
      const key = cacheKey(practiceId, userId);
      const applyPatch = (record: UserDetailRecord | null): UserDetailRecord | null => {
        if (!record) return record;
        const next: UserDetailRecord = { ...record };
        if (patch.status !== undefined) {
          (next as Record<string, unknown>).status = patch.status;
        }
        if (patch.address !== undefined) {
          (next as Record<string, unknown>).address = patch.address;
        }
        // Other fields (name/email/phone/currency) live on next.user — preserve
        // the existing nested user object unless the patch explicitly updates
        // them. The backend always returns the canonical record on success, so
        // a full refresh is the source of truth for those fields.
        return next;
      };
      setData((prev) => applyPatch(prev));
      const cached = userDetailCache.get(key);
      if (cached !== undefined) {
        userDetailCache.set(key, applyPatch(cached));
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update user detail';
      setError(message);
      throw err;
    }
  }, [practiceId, userId]);

  const refresh = useCallback(() => fetchDetail(true), [fetchDetail]);

  return { data, isLoading, error, mutate, refresh };
}
