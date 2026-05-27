import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import { apiClient } from '@/shared/lib/apiClient';

export interface ActivityEvent {
  id: string;
  matter_id: string;
  user_id: string | null;
  action: string;
  description: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface UseActivityOptions {
  matterId?: string;
  practiceId?: string;
  limit?: number;
}

export interface UseActivityResult {
  events: ActivityEvent[];
  isLoading: boolean;
  error: string | null;
  hasMore: boolean;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  reset: () => void;
}

export function useActivity(options: UseActivityOptions): UseActivityResult {
  const { matterId, practiceId, limit = 50 } = options;

  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const offsetRef = useRef(0);
  const activeFetchControllerRef = useRef<AbortController | null>(null);

  const fetchActivity = useCallback(async (isLoadMore = false, signal?: AbortSignal): Promise<boolean> => {
    if (!practiceId || !matterId) return false;

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: offsetRef.current.toString(),
      });
      const response = await apiClient.get<{ activities: ActivityEvent[] }>(
        `/api/matters/${practiceId}/${matterId}/activity?${params}`,
        { signal }
      );

      const { activities } = response.data;
      if (isLoadMore) {
        setEvents(prev => [...prev, ...activities]);
      } else {
        setEvents(activities);
      }
      setHasMore(activities.length === limit);
      return true;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return false;
      setError(err instanceof Error ? err.message : 'Failed to fetch activity');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [practiceId, matterId, limit]);

  const refresh = useCallback(async () => {
    offsetRef.current = 0;
    activeFetchControllerRef.current?.abort();
    const controller = new AbortController();
    activeFetchControllerRef.current = controller;
    await fetchActivity(false, controller.signal);
  }, [fetchActivity]);

  const loadMore = useCallback(async () => {
    if (!hasMore || isLoading) return;
    const previousOffset = offsetRef.current;
    offsetRef.current += limit;
    activeFetchControllerRef.current?.abort();
    const controller = new AbortController();
    activeFetchControllerRef.current = controller;
    const success = await fetchActivity(true, controller.signal);
    if (!success) {
      offsetRef.current = previousOffset;
      if (activeFetchControllerRef.current === controller) {
        activeFetchControllerRef.current = null;
      }
    }
  }, [hasMore, isLoading, limit, fetchActivity]);

  const reset = useCallback(() => {
    setEvents([]);
    setError(null);
    setHasMore(false);
    offsetRef.current = 0;
  }, []);

  useEffect(() => {
    if (!practiceId || !matterId) return;
    offsetRef.current = 0;
    activeFetchControllerRef.current?.abort();
    const controller = new AbortController();
    activeFetchControllerRef.current = controller;
    void fetchActivity(false, controller.signal);
    return () => controller.abort();
  }, [practiceId, matterId, fetchActivity]);

  return { events, isLoading, error, hasMore, refresh, loadMore, reset };
}
