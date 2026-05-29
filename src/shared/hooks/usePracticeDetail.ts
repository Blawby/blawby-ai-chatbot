import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { getPracticeDetails, type PracticeDetails } from '@/shared/lib/apiClient';

export interface UsePracticeDetailOptions {
  /** When false, the hook skips fetching. */
  enabled?: boolean;
  /** If provided, used as the initial value and the hook skips its own fetch
   *  (the caller is providing the source of truth). Matches InspectorPanel's
   *  `propPracticeDetails` short-circuit behavior. */
  fallback?: PracticeDetails | null;
}

export interface UsePracticeDetailResult {
  data: PracticeDetails | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Hook wrapping `getPracticeDetails`. Note that `getPracticeDetails` already
 * dedupes/caches via `queryCache.coalesceGet` with a 60s TTL — this hook does
 * NOT add a second cache layer.
 *
 * The `fallback` option mirrors InspectorPanel's `propPracticeDetails` pattern:
 * when the caller has practice details already (e.g. from a parent shell), the
 * hook uses them and skips its own fetch.
 */
export function usePracticeDetail(
  practiceId: string | null,
  options: UsePracticeDetailOptions = {},
): UsePracticeDetailResult {
  const { enabled = true, fallback = null } = options;
  const [data, setData] = useState<PracticeDetails | null>(fallback);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchDetail = useCallback(async (): Promise<void> => {
    if (!practiceId || !enabled) {
      setData(fallback);
      setError(null);
      setIsLoading(false);
      return;
    }

    if (fallback) {
      setData(fallback);
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
      const detail = await getPracticeDetails(practiceId, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setData(detail);
    } catch (err: unknown) {
      if ((err as DOMException)?.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Failed to load practice details');
      // Match InspectorPanel behavior: clear practice detail on real errors
      setData(null);
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [practiceId, enabled, fallback]);

  useEffect(() => {
    void fetchDetail();
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchDetail]);

  return { data, isLoading, error, refresh: fetchDetail };
}
