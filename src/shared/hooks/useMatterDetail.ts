import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { getMatter, type BackendMatter } from '@/features/matters/services/mattersApi';

export interface UseMatterDetailOptions {
  /** When false, the hook skips fetching (still returns data: null). */
  enabled?: boolean;
}

export interface UseMatterDetailResult {
  data: BackendMatter | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/** Module-level cache keyed by `practiceId:matterId`. Survives unmount/remount. */
const matterDetailCache = new Map<string, BackendMatter | null>();
const cacheKey = (practiceId: string, matterId: string) => `${practiceId}:${matterId}`;

/**
 * Hook wrapping `getMatter` with abort-safe fetching and module-level caching.
 *
 * Matter mutations (status/field updates) flow through `onMatterStatusChange` /
 * `onMatterPatchChange` props on the inspector components, so this hook is
 * read-only. Cache invalidation should be triggered via `refresh()` after a
 * successful mutation completes.
 */
export function useMatterDetail(
  practiceId: string | null,
  matterId: string | null,
  options: UseMatterDetailOptions = {},
): UseMatterDetailResult {
  const { enabled = true } = options;
  const [data, setData] = useState<BackendMatter | null>(() => {
    if (!practiceId || !matterId) return null;
    return matterDetailCache.get(cacheKey(practiceId, matterId)) ?? null;
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchDetail = useCallback(async (force: boolean): Promise<void> => {
    if (!practiceId || !matterId || !enabled) {
      setData(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    const key = cacheKey(practiceId, matterId);
    if (!force && matterDetailCache.has(key)) {
      setData(matterDetailCache.get(key) ?? null);
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
      const detail = await getMatter(practiceId, matterId, { signal: controller.signal });
      if (controller.signal.aborted) return;
      matterDetailCache.set(key, detail);
      setData(detail);
    } catch (err: unknown) {
      if ((err as DOMException)?.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Failed to load matter detail');
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [practiceId, matterId, enabled]);

  useEffect(() => {
    void fetchDetail(false);
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchDetail]);

  const refresh = useCallback(() => fetchDetail(true), [fetchDetail]);

  return { data, isLoading, error, refresh };
}
