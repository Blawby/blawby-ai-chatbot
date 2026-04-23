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

// Maps secondary nav filter IDs to API-compatible triage_status values
const FILTER_STATUS_MAP: Record<IntakesFilter, IntakeListParams['triage_status']> = {
  all: undefined,
  pending: 'pending_review',
  accepted: 'accepted',
  declined: 'declined',
};

export function resolveIntakesFilter(filterId: string | null): IntakesFilter {
  if (!filterId) return 'all';
  if (filterId === 'pending_review') return 'pending';
  if (filterId === 'accepted') return 'accepted';
  if (filterId === 'declined') return 'declined';
  return 'all';
}

export function intakesFilterToApiStatus(filter: IntakesFilter): IntakeListParams['triage_status'] {
  return FILTER_STATUS_MAP[filter];
}

export function useIntakesData(
  practiceId: string | null,
  options: {
    filter?: IntakesFilter;
    page?: number;
    limit?: number;
    enabled?: boolean;
  } = {}
): UseIntakesDataResult {
  const { enabled = true, limit } = options;
  const [filter, setFilterState] = useState<IntakesFilter>(options.filter ?? 'all');
  const [page, setPageState] = useState(options.page ?? 1);
  const effectivePage = options.page ?? page;
  const effectiveFilter = options.filter ?? filter;
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
      setIsLoading(false);
      setTotal(0);
      setTotalPages(0);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    setError(null);

    // Map "queue" filter names to the API-level triage_status params
    const triageStatus: IntakeListParams['triage_status'] = (() => {
      if (effectiveFilter === 'pending') return 'pending_review';
      if (effectiveFilter === 'accepted') return 'accepted';
      if (effectiveFilter === 'declined') return 'declined';
      return undefined;
    })();

    listIntakes(practiceId, { page: effectivePage, limit, triage_status: triageStatus }, { signal: controller.signal })
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
  }, [practiceId, effectiveFilter, effectivePage, limit, enabled, retryTick]);

  // If the caller controls the filter (options.filter provided) but does not
  // control the page (options.page undefined), reset the internal page state
  // to 1 whenever the controlled filter value changes so pagination doesn't
  // remain stale across filter switches.
  useEffect(() => {
    if (options.page === undefined) {
      setPageState(1);
    }
  }, [options.filter]);

  const setFilter = useCallback((f: IntakesFilter) => {
    if (options.filter !== undefined) return;
    setFilterState(f);
    setPageState(1);
  }, [options.filter]);

  const setPage = useCallback((p: number) => {
    if (options.page !== undefined) return;
    setPageState(p);
  }, [options.page]);

  const refetch = useCallback(() => {
    setRetryTick((t) => t + 1);
  }, []);

  return {
    items,
    isLoading,
    isLoaded,
    error,
    page: effectivePage,
    totalPages,
    total,
    filter: effectiveFilter,
    setFilter,
    setPage,
    refetch,
  };
}
