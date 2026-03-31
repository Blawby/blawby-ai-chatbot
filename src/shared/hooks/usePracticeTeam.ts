import { useStore } from '@nanostores/preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { listPracticeTeam } from '@/shared/lib/apiClient';
import type { TeamSummary } from '@/shared/types/team';
import {
  markPracticeTeamCacheUserId,
  practiceTeamCacheUserId,
  practiceTeamInFlight,
  practiceTeamLoaded,
  practiceTeamStore,
  resetPracticeTeamStore,
  setPracticeTeamForKey,
} from '@/shared/stores/practiceTeamStore';

const DEFAULT_SUMMARY: TeamSummary = {
  seatsIncluded: 1,
  seatsUsed: 0,
};

type UsePracticeTeamOptions = {
  enabled?: boolean;
};

export const usePracticeTeam = (
  practiceId: string | null | undefined,
  userId: string | null | undefined,
  options: UsePracticeTeamOptions = {}
) => {
  const { enabled = true } = options;
  const store = useStore(practiceTeamStore);
  const loadedStore = useStore(practiceTeamLoaded);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);
  const resolvedUserId = userId?.trim() || 'anonymous';

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const cacheKey = useMemo(
    () => `${resolvedUserId}:${practiceId ?? ''}`,
    [practiceId, resolvedUserId]
  );
  const value = store[cacheKey];
  const isLoaded = loadedStore.has(cacheKey);

  const fetch = useCallback(async (fetchOptions: { force?: boolean; signal?: AbortSignal } = {}) => {
    if (!enabled || !practiceId) return;
    if (practiceTeamCacheUserId !== resolvedUserId) {
      resetPracticeTeamStore();
      markPracticeTeamCacheUserId(resolvedUserId);
    }
    if (!fetchOptions.force && practiceTeamLoaded.get().has(cacheKey)) return;

    const inFlight = practiceTeamInFlight.get(cacheKey);
    if (inFlight) {
      await inFlight;
      return;
    }

    setIsLoading(true);
    setError(null);
    const promise = listPracticeTeam(practiceId, { signal: fetchOptions.signal });
    practiceTeamInFlight.set(cacheKey, promise);

    try {
      const result = await promise;
      if (!isMountedRef.current) return;
      if (!practiceTeamInFlight.has(cacheKey)) return;

      const nextLoaded = new Set(practiceTeamLoaded.get());
      nextLoaded.add(cacheKey);
      practiceTeamLoaded.set(nextLoaded);
      setPracticeTeamForKey(cacheKey, result);
    } catch (err) {
      if (!isMountedRef.current) return;
      if (err instanceof Error && err.name === 'AbortError') return;

      const nextLoaded = new Set(practiceTeamLoaded.get());
      nextLoaded.delete(cacheKey);
      practiceTeamLoaded.set(nextLoaded);

      const message = err instanceof Error ? err.message : 'Failed to load team';
      setError(message);
      throw err;
    } finally {
      practiceTeamInFlight.delete(cacheKey);
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [cacheKey, enabled, practiceId]);

  useEffect(() => {
    if (!enabled || !practiceId || isLoaded) return;
    const controller = new AbortController();
    void fetch({ signal: controller.signal }).catch(() => undefined);
    return () => controller.abort();
  }, [enabled, fetch, isLoaded, practiceId]);

  const refetch = useCallback(async (signal?: AbortSignal) => {
    await fetch({ force: true, signal });
  }, [fetch]);

  return {
    members: value?.members ?? [],
    summary: value?.summary ?? DEFAULT_SUMMARY,
    isLoaded,
    isLoading,
    error,
    refetch,
  };
};
