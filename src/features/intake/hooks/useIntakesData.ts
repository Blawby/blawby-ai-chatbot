import { useCallback, useEffect, useState } from 'preact/hooks';
import { listIntakes, type IntakeListItem, type IntakeListParams } from '@/features/intake/api/intakesApi';
import { useQuery } from '@/shared/hooks/useQuery';
import { policyTtl } from '@/shared/lib/cachePolicy';

export type IntakesFilter = 'all' | 'pending' | 'accepted' | 'declined';

export interface UseIntakesDataResult {
  items: IntakeListItem[];
  isLoading: boolean;
  /** True once the first successful fetch for the current key has completed. */
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

type IntakesPayload = {
  intakes: IntakeListItem[];
  total: number;
  total_pages: number;
};

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
  const [filterLocal, setFilterState] = useState<IntakesFilter>(options.filter ?? 'all');
  const [pageLocal, setPageState] = useState(options.page ?? 1);
  const effectivePage = options.page ?? pageLocal;
  const effectiveFilter = options.filter ?? filterLocal;

  const cacheKey = `intake:list:${practiceId ?? ''}:${effectiveFilter}:${effectivePage}:${limit ?? 'default'}`;

  const { data, isLoading, error, refetch } = useQuery<IntakesPayload>({
    key: cacheKey,
    enabled: enabled && Boolean(practiceId),
    ttl: policyTtl(cacheKey),
    fetcher: (signal) => listIntakes(
      practiceId!,
      { page: effectivePage, limit, triage_status: FILTER_STATUS_MAP[effectiveFilter] },
      { signal },
    ),
  });

  // If the caller controls the filter (options.filter provided) but does not
  // control the page (options.page undefined), reset the internal page state
  // to 1 whenever the controlled filter value changes so pagination doesn't
  // remain stale across filter switches.
  useEffect(() => {
    if (options.page === undefined) {
      setPageState(1);
    }
  }, [options.filter, options.page]);

  const setFilter = useCallback((f: IntakesFilter) => {
    if (options.filter !== undefined) return;
    setFilterState(f);
    setPageState(1);
  }, [options.filter]);

  const setPage = useCallback((p: number) => {
    if (options.page !== undefined) return;
    setPageState(p);
  }, [options.page]);

  return {
    items: data?.intakes ?? [],
    isLoading,
    // post-Phase-C3 contract: isLoading is permanently false after first
    // successful fetch, so `!isLoading && data !== undefined` is the
    // equivalent of the prior hand-rolled `isLoaded` flag.
    isLoaded: data !== undefined,
    error,
    page: effectivePage,
    totalPages: data?.total_pages ?? 0,
    total: data?.total ?? 0,
    filter: effectiveFilter,
    setFilter,
    setPage,
    refetch: () => { void refetch(); },
  };
}
