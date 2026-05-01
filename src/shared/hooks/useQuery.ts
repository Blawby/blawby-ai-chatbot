import { useStore } from '@nanostores/preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { queryCache } from '@/shared/lib/queryCache';
import type { AsyncState } from './types';

export type UseQueryOptions<T> = {
  key: string;
  fetcher: (signal?: AbortSignal) => Promise<T>;
  ttl?: number;
  enabled?: boolean;
  /**
   * Stale-while-revalidate. When true (default), an expired-but-not-evicted
   * entry is returned immediately and a background refetch updates the
   * store. When false, expired entries are treated as a cache miss — the
   * caller waits for the fresh fetch. Opt out for screens where serving
   * stale data is risky (billing/payment status, security panels).
   */
  swr?: boolean;
};

export type UseQueryResult<T> = AsyncState<T>;

export function useQuery<T>({ key, fetcher, ttl, enabled = true, swr = true }: UseQueryOptions<T>): UseQueryResult<T> {
  const store = useStore(queryCache.getStore());
  // Keep fetcher in a ref so callbacks below are stable even when fetcher identity changes.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  // With SWR, surface the cached value even when stale — the background
  // refetch will update the store. Without SWR, hide stale data from the
  // render so the user sees a fresh fetch instead.
  const entry = store[key];
  const now = Date.now();
  const isFresh = Boolean(entry && entry.expiresAt > now);
  const isReadable = Boolean(entry && entry.evictAt > now);
  const data: T | undefined = isReadable && (swr || isFresh)
    ? (entry.data as T)
    : undefined;

  // isFetching: true whenever a request is in flight (covers refetches).
  // isLoading: derived — true only while there's no data to show yet.
  const [isFetching, setIsFetching] = useState(enabled && data === undefined);
  const [error, setError] = useState<string | null>(null);
  const isLoading = isFetching && data === undefined;

  const load = useCallback(async (signal?: AbortSignal) => {
    setIsFetching(true);
    setError(null);
    try {
      await queryCache.coalesceGet(key, (sig) => fetcherRef.current(sig), { ttl, signal, swr });
    } catch (err) {
      if (signal?.aborted || (err instanceof Error && (err.name === 'AbortError' || err.name === 'CanceledError'))) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsFetching(false);
    }
  }, [key, ttl, swr]);

  useEffect(() => {
    if (!enabled) { setIsFetching(false); return; }
    // Only skip the fetch when data is fresh. Stale data is displayed AND
    // a background refresh is kicked off via coalesceGet's swr path.
    if (queryCache.isFresh(key)) { setIsFetching(false); return; }
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [enabled, key, load]);

  const refetch = useCallback(async () => {
    queryCache.invalidate(key);
    const controller = new AbortController();
    await load(controller.signal);
  }, [key, load]);

  return { data, error, isLoading, isFetching, refetch };
}
