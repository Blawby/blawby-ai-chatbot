import { useStore } from '@nanostores/preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { listUserDetails, type UserDetailRecord, type UserDetailStatus } from '@/shared/lib/apiClient';
import {
  clientsStore,
  clientsLoaded,
  clientsInFlight,
  markClientsCacheKey,
  setClientsForPractice
} from '@/shared/stores/clientsStore';

type UseClientsDataOptions = {
  enabled?: boolean;
};

export const useClientsData = (
  practiceId: string,
  statusFilter: UserDetailStatus | null,
  userId: string | null,
  options: UseClientsDataOptions = {}
) => {
  const { enabled = true } = options;
  const store = useStore(clientsStore);
  const loadedStore = useStore(clientsLoaded);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);


  const statusParts = useMemo(
    () => (statusFilter ? [statusFilter] : []),
    [statusFilter]
  );
  const cacheKey = useMemo(
    () => `${userId}:${practiceId}:${statusParts.join(',')}`,
    [userId, practiceId, statusParts]
  );
  const items = store[cacheKey] ?? [];
  const isLoaded = loadedStore.has(cacheKey);

  const fetch = useCallback(async (fetchOptions: { force?: boolean; signal?: AbortSignal } = {}) => {
    if (!enabled || !practiceId) return;
    if (!fetchOptions.force && clientsLoaded.get().has(cacheKey)) return;

    const inFlight = clientsInFlight.get(cacheKey);
    if (inFlight) {
      await inFlight;
      return;
    }

    setIsLoading(true);
    setError(null);
    markClientsCacheKey(cacheKey);
    const promise = (async () => {
      const pageSize = 50;
      let offset = 0;
      const allItems: UserDetailRecord[] = [];
      while (true) {
        const response = await listUserDetails(practiceId, {
          limit: pageSize,
          offset,
          status: statusFilter ?? undefined,
          signal: fetchOptions.signal
        });
        allItems.push(...response.data);
        if (response.data.length < pageSize) break;
        offset += pageSize;
      }
      return allItems;
    })();

    clientsInFlight.set(cacheKey, promise);
    try {
      const result = await promise;
      if (!isMountedRef.current) return;
      if (!clientsInFlight.has(cacheKey)) return;
      
      const nextLoaded = new Set(clientsLoaded.get());
      nextLoaded.add(cacheKey);
      clientsLoaded.set(nextLoaded);
      
      setClientsForPractice(cacheKey, result);
    } catch (err) {
      if (!isMountedRef.current) return;
      if (err instanceof Error && err.name === 'AbortError') return;

      const nextLoaded = new Set(clientsLoaded.get());
      nextLoaded.delete(cacheKey);
      clientsLoaded.set(nextLoaded);

      const message = err instanceof Error ? err.message : 'Failed to load clients';
      setError(message);
      throw err;
    } finally {
      clientsInFlight.delete(cacheKey);
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [cacheKey, enabled, practiceId, statusFilter]);

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
