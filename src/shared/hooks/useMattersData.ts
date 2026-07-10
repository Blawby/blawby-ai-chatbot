import { useMemo } from 'preact/hooks';
import { listClientMatters, listMatters, type BackendMatter } from '@/features/matters/services/mattersApi';
import { useQuery } from '@/shared/hooks/useQuery';
import { policyTtl } from '@/shared/lib/cachePolicy';

type UseMattersDataOptions = {
  enabled?: boolean;
  audience?: 'practice' | 'client';
};

export const useMattersData = (
  practiceId: string,
  statusFilter: string[],
  options: UseMattersDataOptions = {}
) => {
  const { audience = 'practice', enabled = true } = options;

  // Serialize the filter to a stable string so it's stable when callers pass
  // a fresh array literal each render.
  const filterKey = statusFilter.map((v) => v.trim().toLowerCase()).filter(Boolean).sort().join(',');
  const cacheKey = `matters:${audience}:${practiceId}:${filterKey}`;

  const fetchAllPages = async (signal?: AbortSignal): Promise<BackendMatter[]> => {
    const pageSize = 50;
    const allItems: BackendMatter[] = [];
    let page = 1;
    while (true) {
      const pageItems = audience === 'client'
        ? await listClientMatters(practiceId, { page, limit: pageSize, signal })
        : await listMatters(practiceId, { page, limit: pageSize, signal });
      allItems.push(...pageItems);
      if (pageItems.length < pageSize) break;
      page += 1;
    }
    if (!filterKey) return allItems;
    const accepted = new Set(filterKey.split(','));
    return allItems.filter((matter) => accepted.has(String(matter.status ?? '').toLowerCase()));
  };

  const { data, error, isLoading, refetch } = useQuery<BackendMatter[]>({
    key: cacheKey,
    fetcher: fetchAllPages,
    ttl: policyTtl(cacheKey),
    enabled: enabled && Boolean(practiceId),
  });

  return useMemo(
    () => ({
      items: data ?? [],
      isLoading,
      error,
      refetch,
    }),
    [data, isLoading, error, refetch]
  );
};
