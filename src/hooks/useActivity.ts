import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import { features } from '../config/features';

export interface ActivityEvent {
  id: string;
  uid: string;
  type: 'matter_event' | 'session_event';
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
  sessionId?: string;
  practiceId?: string;
  limit?: number; // default 25, max 50
  since?: string; // ISO 8601 timestamp
  until?: string; // ISO 8601 timestamp
  type?: string[]; // event types to filter by
  actorType?: 'user' | 'lawyer' | 'system';
  autoRefresh?: boolean;
  refreshInterval?: number; // milliseconds
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
    sessionId,
    practiceId,
    limit = 25,
    since,
    until,
    type,
    actorType,
    autoRefresh = false,
    refreshInterval = 30000 // 30 seconds
  } = options;

  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState<number | undefined>();
  const [etag, setEtag] = useState<string | undefined>();
  const [lastModified, setLastModified] = useState<string | undefined>();
  
  const nextCursorRef = useRef<string | undefined>();
  const refreshTimeoutRef = useRef<ReturnType<typeof setInterval>>();
  const enabled = features.enableActivity;

  const buildQueryParams = useCallback(() => {
    const params = new URLSearchParams();
    
    if (practiceId) params.set('practiceId', practiceId);
    if (matterId) params.set('matterId', matterId);
    if (sessionId) params.set('sessionId', sessionId);
    if (limit) params.set('limit', limit.toString());
    if (since) params.set('since', since);
    if (until) params.set('until', until);
    if (type && type.length > 0) params.set('type', type.join(','));
    if (actorType) params.set('actorType', actorType);
    if (nextCursorRef.current) params.set('cursor', nextCursorRef.current);
    
    return params.toString();
  }, [practiceId, matterId, sessionId, limit, since, until, type, actorType]);

  const fetchActivity = useCallback(async (isLoadMore = false) => {
    if (!enabled) {
      // Feature-flagged off: Activity is not yet migrated to staging-api.
      // TODO(activity): switch to staging-api endpoint and remove this guard.
      return;
    }
    if (!practiceId) {
      setError('Practice ID is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const queryParams = buildQueryParams();
      const url = `/api/activity?${queryParams}`;
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      
      // Add conditional request headers for caching
      if (etag && !isLoadMore) {
        headers['If-None-Match'] = etag;
      }
      if (lastModified && !isLoadMore) {
        headers['If-Modified-Since'] = lastModified;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers,
        credentials: 'include' // Include cookies for session authentication
      });

      // Handle 304 Not Modified
      if (response.status === 304) {
        setLoading(false);
        return;
      }

      // Handle rate limiting
      if (response.status === 429) {
        const errorData = await response.json() as { retryAfter?: number; error?: string };
        const retryAfter = errorData.retryAfter || 60;
        setError(`Rate limit exceeded. Please try again in ${retryAfter} seconds.`);
        setLoading(false);
        return;
      }

      if (!response.ok) {
        const errorData = await response.json() as { error?: string };
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json() as { success: boolean; error?: string; data: { items: ActivityEvent[]; hasMore: boolean; total?: number; nextCursor?: string } };
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch activity');
      }

      const result = data.data;
      
      // Update cache headers
      const newEtag = response.headers.get('ETag');
      const newLastModified = response.headers.get('Last-Modified');
      
      if (newEtag) setEtag(newEtag);
      if (newLastModified) setLastModified(newLastModified);

      if (isLoadMore) {
        // Append new events for pagination
        setEvents(prev => [...prev, ...result.items]);
      } else {
        // Replace events for refresh
        setEvents(result.items);
      }
      
      setHasMore(result.hasMore);
      setTotal(result.total);
      nextCursorRef.current = result.nextCursor;

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch activity';
      setError(errorMessage);
      // Log error for debugging in development
      if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
         
        console.error('Activity fetch error:', err);
      }
    } finally {
      setLoading(false);
    }
  }, [enabled, practiceId, buildQueryParams, etag, lastModified]);

  const refresh = useCallback(async () => {
    nextCursorRef.current = undefined;
    await fetchActivity(false);
  }, [fetchActivity]);

  const loadMore = useCallback(async () => {
    if (hasMore && !loading && nextCursorRef.current) {
      await fetchActivity(true);
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
    if (enabled && practiceId) {
      refresh();
    }
  }, [enabled, practiceId, refresh]);

  // Auto refresh
  useEffect(() => {
    if (enabled && autoRefresh && refreshInterval > 0) {
      refreshTimeoutRef.current = setInterval(() => {
        refresh();
      }, refreshInterval);

      return () => {
        if (refreshTimeoutRef.current) {
          clearInterval(refreshTimeoutRef.current);
        }
      };
    }
  }, [enabled, autoRefresh, refreshInterval, refresh]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) {
        clearInterval(refreshTimeoutRef.current);
      }
    };
  }, []);

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
