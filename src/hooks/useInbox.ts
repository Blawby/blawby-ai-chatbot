import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import { getTokenAsync } from '../lib/tokenStorage';
import { getApiConfig } from '../config/api';
import type { Conversation } from '../types/conversation';

export interface InboxFilters {
  assignedTo?: 'me' | 'unassigned' | string | null;
  status?: 'active' | 'archived' | 'closed';
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  tags?: string[];
}

export interface InboxStats {
  total: number;
  active: number;
  unassigned: number;
  assignedToMe: number;
  highPriority: number;
  archived: number;
  closed: number;
}

export interface InboxConversation extends Conversation {
  assigned_to?: string | null;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  tags?: string[];
  internal_notes?: string | null;
  last_message_at?: string | null;
  first_response_at?: string | null;
}

interface UseInboxOptions {
  practiceId: string;
  filters?: InboxFilters;
  limit?: number;
  offset?: number;
  sortBy?: 'last_message_at' | 'created_at' | 'priority';
  sortOrder?: 'asc' | 'desc';
  autoRefresh?: boolean;
  refreshInterval?: number;
  onError?: (error: string) => void;
}

interface UseInboxReturn {
  conversations: InboxConversation[];
  stats: InboxStats | null;
  total: number;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  assignConversation: (conversationId: string, assignedTo: string | null | 'me') => Promise<void>;
  updateConversation: (conversationId: string, updates: {
    assigned_to?: string | null | 'me';
    priority?: 'low' | 'normal' | 'high' | 'urgent';
    tags?: string[];
    internal_notes?: string | null;
    status?: 'active' | 'archived' | 'closed';
  }) => Promise<void>;
  sendMessage: (conversationId: string, content: string, metadata?: Record<string, unknown>) => Promise<void>;
}

/**
 * Hook for team inbox functionality
 * Allows practice members to view, filter, assign, and manage conversations
 */
export function useInbox({
  practiceId,
  filters = {},
  limit = 50,
  offset = 0,
  sortBy = 'last_message_at',
  sortOrder = 'desc',
  autoRefresh = false,
  refreshInterval = 30000, // 30 seconds
  onError,
}: UseInboxOptions): UseInboxReturn {
  const [conversations, setConversations] = useState<InboxConversation[]>([]);
  const [stats, setStats] = useState<InboxStats | null>(null);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const isDisposedRef = useRef(false);
  const refreshTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      isDisposedRef.current = true;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
    };
  }, []);

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    if (!practiceId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const token = await getTokenAsync();
      if (!token) {
        throw new Error('Authentication required');
      }

      const params = new URLSearchParams();
      if (filters.assignedTo !== undefined) {
        params.set('assignedTo', filters.assignedTo === null ? 'unassigned' : filters.assignedTo);
      }
      if (filters.status) {
        params.set('status', filters.status);
      }
      if (filters.priority) {
        params.set('priority', filters.priority);
      }
      if (filters.tags && filters.tags.length > 0) {
        params.set('tags', filters.tags.join(','));
      }
      params.set('limit', limit.toString());
      params.set('offset', offset.toString());
      params.set('sortBy', sortBy);
      params.set('sortOrder', sortOrder);

      const config = getApiConfig();
      const response = await fetch(`${config.baseUrl}/api/inbox/conversations?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        signal: abortControllerRef.current?.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json() as {
        success: boolean;
        error?: string;
        data?: {
          conversations: InboxConversation[];
          total: number;
          limit: number;
          offset: number;
        };
      };
      if (!data.success || !data.data) {
        throw new Error(data.error || 'Failed to fetch inbox conversations');
      }

      if (!isDisposedRef.current) {
        setConversations(data.data.conversations);
        setTotal(data.data.total);
        setError(null);
      }
    } catch (err) {
      if (isDisposedRef.current) return;
      if (err instanceof Error && err.name === 'AbortError') return;
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch inbox conversations';
      setError(errorMessage);
      onError?.(errorMessage);
    } finally {
      if (!isDisposedRef.current) {
        setIsLoading(false);
      }
    }
  }, [practiceId, filters, limit, offset, sortBy, sortOrder, onError]);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    if (!practiceId) return;

    try {
      const token = await getTokenAsync();
      if (!token) return;

      const config = getApiConfig();
      const response = await fetch(`${config.baseUrl}/api/inbox/stats`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        signal: abortControllerRef.current?.signal,
      });

      if (!response.ok) return;

      const data = await response.json() as {
        success: boolean;
        data?: InboxStats;
      };
      if (data.success && data.data && !isDisposedRef.current) {
        setStats(data.data);
      }
    } catch (err) {
      // Stats fetch failure is non-critical, just log
      if (err instanceof Error && err.name !== 'AbortError') {
        console.warn('Failed to fetch inbox stats:', err);
      }
    }
  }, [practiceId]);

  // Refresh both conversations and stats
  const refresh = useCallback(async () => {
    await Promise.all([fetchConversations(), fetchStats()]);
  }, [fetchConversations, fetchStats]);

  // Assign conversation
  const assignConversation = useCallback(async (
    conversationId: string,
    assignedTo: string | null | 'me'
  ) => {
    try {
      const token = await getTokenAsync();
      if (!token) {
        throw new Error('Authentication required');
      }

      const config = getApiConfig();
      const response = await fetch(`${config.baseUrl}/api/inbox/conversations/${conversationId}/assign`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ assigned_to: assignedTo }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      // Refresh conversations after assignment
      await refresh();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to assign conversation';
      setError(errorMessage);
      onError?.(errorMessage);
      throw err;
    }
  }, [refresh, onError]);

  // Update conversation
  const updateConversation = useCallback(async (
    conversationId: string,
    updates: {
      assigned_to?: string | null | 'me';
      priority?: 'low' | 'normal' | 'high' | 'urgent';
      tags?: string[];
      internal_notes?: string | null;
      status?: 'active' | 'archived' | 'closed';
    }
  ) => {
    try {
      const token = await getTokenAsync();
      if (!token) {
        throw new Error('Authentication required');
      }

      const config = getApiConfig();
      const response = await fetch(`${config.baseUrl}/api/inbox/conversations/${conversationId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      // Refresh conversations after update
      await refresh();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update conversation';
      setError(errorMessage);
      onError?.(errorMessage);
      throw err;
    }
  }, [refresh, onError]);

  // Send message as practice member
  const sendMessage = useCallback(async (
    conversationId: string,
    content: string,
    metadata?: Record<string, unknown>
  ) => {
    try {
      const token = await getTokenAsync();
      if (!token) {
        throw new Error('Authentication required');
      }

      const config = getApiConfig();
      const response = await fetch(`${config.baseUrl}/api/inbox/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ content, metadata }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      // Refresh conversations to update last_message_at
      await refresh();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send message';
      setError(errorMessage);
      onError?.(errorMessage);
      throw err;
    }
  }, [refresh, onError]);

  // Initial load and refetch when filters change
  useEffect(() => {
    if (!practiceId) {
      setIsLoading(false);
      return;
    }

    abortControllerRef.current = new AbortController();
    refresh();

    // Set up auto-refresh if enabled
    if (autoRefresh) {
      refreshTimerRef.current = window.setInterval(() => {
        refresh();
      }, refreshInterval);
    }

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
    };
  }, [practiceId, filters, limit, offset, sortBy, sortOrder, autoRefresh, refreshInterval, refresh]);

  return {
    conversations,
    stats,
    total,
    isLoading,
    error,
    refresh,
    assignConversation,
    updateConversation,
    sendMessage,
  };
}

