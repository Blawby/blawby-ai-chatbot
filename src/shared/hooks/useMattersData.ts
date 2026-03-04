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
  const loadedStore = useStore(mattersLoaded);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastUserIdRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

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
    () => `${practiceId}:${normalizedFilter.join(',')}`,
    [practiceId, normalizedFilter]
  );
  const items = store[cacheKey] ?? [];
  const isLoaded = loadedStore.has(cacheKey);

  const fetch = useCallback(async (fetchOptions: { force?: boolean; signal?: AbortSignal } = {}) => {
    if (!enabled || !practiceId) return;
    if (!fetchOptions.force && mattersLoaded.get().has(cacheKey)) return;

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
      if (!isMountedRef.current) return;
      if (!mattersInFlight.has(cacheKey)) return;
      
      const nextLoaded = new Set(mattersLoaded.get());
      nextLoaded.add(cacheKey);
      mattersLoaded.set(nextLoaded);
      
      setMattersForPractice(cacheKey, result);
    } catch (err) {
      if (!isMountedRef.current) return;
      if (err instanceof Error && err.name === 'AbortError') return;

      const nextLoaded = new Set(mattersLoaded.get());
      nextLoaded.delete(cacheKey);
      mattersLoaded.set(nextLoaded);

      const message = err instanceof Error ? err.message : 'Failed to load matters';
      setError(message);
      throw err;
    } finally {
      mattersInFlight.delete(cacheKey);
      if (isMountedRef.current) {
        setIsLoading(false);
      }
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
