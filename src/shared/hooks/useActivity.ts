import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import { features } from '@/config/features';
import { apiClient, isHttpError } from '@/shared/lib/apiClient';

export interface ActivityEvent {
  id: string;
  uid: string;
  type: 'matter_event' | 'conversation_event';
  eventType: string;
  title: string;
  description: string;
  eventDate: string;
  actorType?: 'user' | 'lawyer' | 'system';
  actorId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface UseActivityOptions {
  matterId?: string;
  conversationId?: string;
  practiceId?: string;
  limit?: number; // default 25, max 50
  since?: string; // ISO 8601 timestamp
  until?: string; // ISO 8601 timestamp
  type?: string[]; // event types to filter by
  actorType?: 'user' | 'lawyer' | 'system';
  enablePagination?: boolean; // default true
}

export interface UseActivityResult {
  events: ActivityEvent[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  total?: number;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>; // Load next page using cursor
  reset: () => void; // Reset to first page
  // Caching support
  etag?: string;
  lastModified?: string;
}

export function useActivity(options: UseActivityOptions): UseActivityResult {
  const {
    matterId,
    conversationId,
    practiceId,
    limit = 25,
    since,
    until,
    type,
    actorType
  } = options;

  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState<number | undefined>();
  const [etag, setEtag] = useState<string | undefined>();
  const [lastModified, setLastModified] = useState<string | undefined>();
  
  const nextCursorRef = useRef<string | undefined>();
  const activeFetchControllerRef = useRef<AbortController | null>(null);
  const enabled = features.enableActivity;

  const buildQueryParams = useCallback(() => {
    const params = new URLSearchParams();
    
    if (practiceId) params.set('practiceId', practiceId);
    if (matterId) params.set('matterId', matterId);
    if (conversationId) params.set('conversationId', conversationId);
    if (limit) params.set('limit', limit.toString());
    if (since) params.set('since', since);
    if (until) params.set('until', until);
    if (type && type.length > 0) params.set('type', type.join(','));
    if (actorType) params.set('actorType', actorType);
    if (nextCursorRef.current) params.set('cursor', nextCursorRef.current);
    
    return params.toString();
  }, [practiceId, matterId, conversationId, limit, since, until, type, actorType]);

  const fetchActivity = useCallback(async (isLoadMore = false, signal?: AbortSignal) => {
    if (!enabled) {
      // Feature-flagged off: Activity is not yet migrated to staging-api.
      // TODO(activity): switch to staging-api endpoint and remove this guard.
      return;
    }
    if (!practiceId) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const queryParams = buildQueryParams();
      const headers: Record<string, string> = {};
      if (etag && !isLoadMore) headers['If-None-Match'] = etag;
      if (lastModified && !isLoadMore) headers['If-Modified-Since'] = lastModified;

      const response = await apiClient.get<{
        success: boolean;
        error?: string;
        data: { items: ActivityEvent[]; hasMore: boolean; total?: number; nextCursor?: string };
      }>(`/api/activity?${queryParams}`, {
        headers,
        signal,
        acceptStatuses: [304],
      });

      if (response.status === 304) return;

      const data = response.data;
      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch activity');
      }

      const result = data.data;
      const newEtag = response.headers.get('ETag');
      const newLastModified = response.headers.get('Last-Modified');
      if (newEtag) setEtag(newEtag);
      if (newLastModified) setLastModified(newLastModified);

      if (isLoadMore) {
        setEvents(prev => [...prev, ...result.items]);
      } else {
        setEvents(result.items);
      }
      setHasMore(result.hasMore);
      setTotal(result.total);
      nextCursorRef.current = result.nextCursor;

    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      if (isHttpError(err) && err.response.status === 429) {
        const errorData = err.response.data as { retryAfter?: number } | undefined;
        const retryAfter = errorData?.retryAfter || 60;
        setError(`Rate limit exceeded. Please try again in ${retryAfter} seconds.`);
        return;
      }
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch activity';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [enabled, practiceId, buildQueryParams, etag, lastModified]);

  const refresh = useCallback(async () => {
    nextCursorRef.current = undefined;
    activeFetchControllerRef.current?.abort();
    const controller = new AbortController();
    activeFetchControllerRef.current = controller;
    await fetchActivity(false, controller.signal);
  }, [fetchActivity]);

  const loadMore = useCallback(async () => {
    if (hasMore && !loading && nextCursorRef.current) {
      activeFetchControllerRef.current?.abort();
      const controller = new AbortController();
      activeFetchControllerRef.current = controller;
      await fetchActivity(true, controller.signal);
    }
  }, [hasMore, loading, fetchActivity]);

  const reset = useCallback(() => {
    setEvents([]);
    setError(null);
    setHasMore(false);
    setTotal(undefined);
    nextCursorRef.current = undefined;
    setEtag(undefined);
    setLastModified(undefined);
  }, []);

  // Initial load
  useEffect(() => {
    if (!enabled || !practiceId) return;
    activeFetchControllerRef.current?.abort();
    const controller = new AbortController();
    activeFetchControllerRef.current = controller;
    void fetchActivity(false, controller.signal);
    return () => controller.abort();
  }, [enabled, practiceId, fetchActivity]);

  return {
    events,
    loading,
    error,
    hasMore,
    total,
    refresh,
    loadMore,
    reset,
    etag,
    lastModified
  };
}
