import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { listIntakes, type IntakeListItem, type IntakeListParams } from '@/features/intake/api/intakesApi';

export type IntakesFilter = 'all' | 'pending' | 'accepted' | 'declined';

export interface UseIntakesDataResult {
  items: IntakeListItem[];
  isLoading: boolean;
  isLoaded: boolean;
  error: string | null;
  page: number;
  totalPages: number;
  total: number;
  filter: IntakesFilter;
  setFilter: (filter: IntakesFilter) => void;
  setPage: (page: number) => void;
  refetch: () => void;
}

// Maps secondary nav filter IDs to API-compatible status values
const FILTER_STATUS_MAP: Record<IntakesFilter, IntakeListParams['status']> = {
  all: 'all',
  pending: 'pending',
  accepted: 'succeeded',
  declined: 'expired',
};

export function resolveIntakesFilter(filterId: string | null): IntakesFilter {
  if (!filterId) return 'all';
  if (filterId === 'pending_review') return 'pending';
  if (filterId === 'accepted') return 'accepted';
  if (filterId === 'declined') return 'declined';
  return 'all';
}

export function intakesFilterToApiStatus(filter: IntakesFilter): IntakeListParams['status'] {
  return FILTER_STATUS_MAP[filter] ?? 'all';
}

export function useIntakesData(
  practiceId: string | null,
  options: {
    filter?: IntakesFilter;
    page?: number;
    enabled?: boolean;
  } = {}
): UseIntakesDataResult {
  const { enabled = true } = options;
  const [filter, setFilterState] = useState<IntakesFilter>(options.filter ?? 'all');
  const [page, setPageState] = useState(options.page ?? 1);
  const [items, setItems] = useState<IntakeListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [retryTick, setRetryTick] = useState(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!enabled || !practiceId) {
      setItems([]);
      setIsLoaded(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    setError(null);

    // Map "queue" filter names to the API-level status params
    const apiStatus: IntakeListParams['status'] = (() => {
      if (filter === 'pending') return 'pending';
      if (filter === 'accepted') return 'succeeded';
      if (filter === 'declined') return 'expired';
      return 'all';
    })();

    listIntakes(practiceId, { page, status: apiStatus }, { signal: controller.signal })
      .then((result) => {
        if (!isMountedRef.current || controller.signal.aborted) return;
        setItems(result.intakes);
        setTotal(result.total);
        setTotalPages(result.total_pages);
        setIsLoaded(true);
      })
      .catch((err: unknown) => {
        if (!isMountedRef.current || controller.signal.aborted) return;
        if (err instanceof Error && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Failed to load intakes');
      })
      .finally(() => {
        if (isMountedRef.current && !controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [practiceId, filter, page, enabled, retryTick]);

  const setFilter = useCallback((f: IntakesFilter) => {
    setFilterState(f);
    setPageState(1);
  }, []);

  const setPage = useCallback((p: number) => {
    setPageState(p);
  }, []);

  const refetch = useCallback(() => {
    setRetryTick((t) => t + 1);
  }, []);

  return {
    items,
    isLoading,
    isLoaded,
    error,
    page,
    totalPages,
    total,
    filter,
    setFilter,
    setPage,
    refetch,
  };
}
