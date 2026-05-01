import { useMemo } from 'preact/hooks';
import { listUserDetails, type UserDetailRecord, type UserDetailStatus } from '@/shared/lib/apiClient';
import { useQuery } from '@/shared/hooks/useQuery';
import { policyTtl } from '@/shared/lib/cachePolicy';

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
  const cacheKey = useMemo(
    () => `clients:${userId ?? 'anonymous'}:${practiceId}:${statusFilter ?? ''}`,
    [userId, practiceId, statusFilter]
  );

  const fetchAllPages = async (signal?: AbortSignal): Promise<UserDetailRecord[]> => {
    const pageSize = 50;
    let offset = 0;
    const allItems: UserDetailRecord[] = [];
    // Paginate to load every client; backend returns at most pageSize per call.
    while (true) {
      const response = await listUserDetails(practiceId, {
        limit: pageSize,
        offset,
        status: statusFilter ?? undefined,
        signal,
      });
      allItems.push(...response.data);
      if (response.data.length < pageSize) break;
      offset += pageSize;
    }
    return allItems;
  };

  const { data, error, isLoading, refetch } = useQuery<UserDetailRecord[]>({
    key: cacheKey,
    fetcher: fetchAllPages,
    ttl: policyTtl(cacheKey),
    enabled: enabled && Boolean(practiceId),
  });

  return {
    items: data ?? [],
    isLoaded: data !== undefined,
    isLoading,
    error,
    refetch,
  };
};
