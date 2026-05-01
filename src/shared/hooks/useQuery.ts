import { useStore } from '@nanostores/preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { queryCache } from '@/shared/lib/queryCache';

export type UseQueryOptions<T> = {
  key: string;
  fetcher: (signal?: AbortSignal) => Promise<T>;
  ttl?: number;
  enabled?: boolean;
};

export type UseQueryResult<T> = {
  data: T | undefined;
  error: string | null;
  isLoading: boolean;
  refetch: () => Promise<void>;
};

export function useQuery<T>({ key, fetcher, ttl, enabled = true }: UseQueryOptions<T>): UseQueryResult<T> {
  const store = useStore(queryCache.getStore());
  // Keep fetcher in a ref so callbacks below are stable even when fetcher identity changes.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const entry = store[key];
  const data: T | undefined = entry && entry.expiresAt > Date.now() ? (entry.data as T) : undefined;

  const [isLoading, setIsLoading] = useState(enabled && data === undefined);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);
    try {
      await queryCache.coalesceGet(key, (sig) => fetcherRef.current(sig), { ttl, signal });
    } catch (err) {
      if (signal?.aborted || (err instanceof Error && (err.name === 'AbortError' || err.name === 'CanceledError'))) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [key, ttl]);

  useEffect(() => {
    if (!enabled) { setIsLoading(false); return; }
    if (queryCache.get(key) !== undefined) { setIsLoading(false); return; }
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [enabled, key, load]);

  const refetch = useCallback(async () => {
    queryCache.invalidate(key);
    const controller = new AbortController();
    await load(controller.signal);
  }, [key, load]);

  return { data, error, isLoading, refetch };
}
