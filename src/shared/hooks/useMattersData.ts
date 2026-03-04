import { useStore } from '@nanostores/preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { listMatters, type BackendMatter } from '@/features/matters/services/mattersApi';
import {
  mattersStore,
  mattersLoaded,
  mattersInFlight,
  markMattersCacheKey,
  resetMattersStore,
  setMattersForPractice
} from '@/shared/stores/mattersStore';

type UseMattersDataOptions = {
  enabled?: boolean;
};

export const useMattersData = (
  practiceId: string,
  statusFilter: string[],
  userId: string | null,
  options: UseMattersDataOptions = {}
) => {
  const { enabled = true } = options;
  const store = useStore(mattersStore);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (lastUserIdRef.current !== userId) {
      resetMattersStore();
      lastUserIdRef.current = userId;
    }
  }, [userId]);

  const normalizedFilter = useMemo(
    () => statusFilter.map((value) => value.trim().toLowerCase()).filter(Boolean),
    [statusFilter]
  );
  const cacheKey = useMemo(
    () => `${practiceId}:${statusFilter.join(',')}`,
    [practiceId, statusFilter]
  );
  const items = store[cacheKey] ?? [];
  const isLoaded = mattersLoaded.has(cacheKey);

  const fetch = useCallback(async (fetchOptions: { force?: boolean; signal?: AbortSignal } = {}) => {
    if (!enabled || !practiceId) return;
    if (!fetchOptions.force && mattersLoaded.has(cacheKey)) return;

    const inFlight = mattersInFlight.get(cacheKey);
    if (inFlight) {
      await inFlight;
      return;
    }

    setIsLoading(true);
    setError(null);
    markMattersCacheKey(cacheKey);
    const promise = (async () => {
      const pageSize = 50;
      const allItems: BackendMatter[] = [];
      let page = 1;
      while (true) {
        const pageItems = await listMatters(practiceId, { page, limit: pageSize, signal: fetchOptions.signal });
        allItems.push(...pageItems);
        if (pageItems.length < pageSize) break;
        page += 1;
      }
      if (normalizedFilter.length === 0) {
        return allItems;
      }
      const accepted = new Set(normalizedFilter);
      return allItems.filter((matter) => accepted.has(String(matter.status ?? '').toLowerCase()));
    })();

    mattersInFlight.set(cacheKey, promise);
    try {
      const result = await promise;
      mattersLoaded.add(cacheKey);
      setMattersForPractice(cacheKey, result);
    } catch (err) {
      mattersLoaded.delete(cacheKey);
      const message = err instanceof Error ? err.message : 'Failed to load matters';
      setError(message);
      throw err;
    } finally {
      mattersInFlight.delete(cacheKey);
      setIsLoading(false);
    }
  }, [cacheKey, enabled, normalizedFilter, practiceId]);

  useEffect(() => {
    if (!enabled || !practiceId || isLoaded) return;
    const controller = new AbortController();
    void fetch({ signal: controller.signal }).catch(() => undefined);
    return () => controller.abort();
  }, [enabled, fetch, isLoaded, practiceId]);

  const refetch = useCallback(async (signal?: AbortSignal) => {
    await fetch({ force: true, signal });
  }, [fetch]);

  return { items, isLoaded, isLoading, error, refetch };
};
