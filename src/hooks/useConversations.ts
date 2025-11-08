import { useState, useEffect, useCallback, useRef } from 'preact/hooks';

export interface ConversationSummary {
  id: string;
  organizationId: string;
  matterId: string | null;
  type: 'ai' | 'human' | 'mixed';
  status: 'open' | 'locked' | 'archived';
  title: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
}

export interface UseConversationsOptions {
  organizationId?: string | null;
  status?: 'open' | 'locked' | 'archived';
  pageSize?: number;
  autoFetch?: boolean;
}

export interface UseConversationsResult {
  conversations: ConversationSummary[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  setStatus: (status: 'open' | 'locked' | 'archived' | undefined) => void;
}

export function useConversations(options: UseConversationsOptions): UseConversationsResult {
  const { organizationId, status, pageSize = 25, autoFetch = true } = options;
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<typeof status>(status);
  const nextCursorRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const buildUrl = useCallback(() => {
    if (!organizationId) {
      return null;
    }
    const params = new URLSearchParams();
    params.set('organizationId', organizationId);
    params.set('limit', Math.max(1, Math.min(pageSize, 100)).toString());
    if (currentStatus) {
      params.set('status', currentStatus);
    }
    if (nextCursorRef.current) {
      params.set('cursor', nextCursorRef.current);
    }
    return `/api/conversations?${params.toString()}`;
  }, [organizationId, currentStatus, pageSize]);

  const fetchConversations = useCallback(async (isLoadMore = false) => {
    if (!organizationId) {
      return;
    }

    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const url = buildUrl();
      if (!url) {
        throw new Error('Missing organizationId');
      }

      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        signal: controller.signal
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Failed to fetch conversations (${response.status})`);
      }

      const payload = await response.json() as { data?: { items?: ConversationSummary[]; nextCursor?: string | null } };
      const items = payload.data?.items ?? [];
      const nextCursor = payload.data?.nextCursor ?? null;

      nextCursorRef.current = nextCursor;
      setHasMore(Boolean(nextCursor));
      setConversations(prev => {
        if (isLoadMore) {
          const merged = [...prev];
          const existingIds = new Set(merged.map(item => item.id));
          for (const item of items) {
            if (!existingIds.has(item.id)) {
              merged.push(item);
            }
          }
          return merged;
        }
        return items;
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        return;
      }
      console.error('Failed to fetch conversations', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [buildUrl, organizationId]);

  const refresh = useCallback(async () => {
    nextCursorRef.current = null;
    await fetchConversations(false);
  }, [fetchConversations]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loading) {
      return;
    }
    await fetchConversations(true);
  }, [fetchConversations, hasMore, loading]);

  useEffect(() => {
    nextCursorRef.current = null;
    if (autoFetch && organizationId) {
      fetchConversations(false).catch(error => {
        console.error('Initial conversation fetch failed', error);
      });
    }
    return () => {
      abortRef.current?.abort();
    };
  }, [organizationId, currentStatus, autoFetch, fetchConversations]);

  useEffect(() => {
    setCurrentStatus(status);
  }, [status]);

  return {
    conversations,
    loading,
    error,
    hasMore,
    refresh,
    loadMore,
    setStatus: setCurrentStatus
  };
}
