import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { getTokenAsync } from '@/shared/lib/tokenStorage';
import { getConversationsEndpoint, getConversationParticipantsEndpoint } from '@/config/api';
import type { Conversation, ConversationStatus } from '@/shared/types/conversation';
import { linkConversationToUser as apiLinkConversationToUser } from '@/shared/lib/apiClient';

interface UseConversationsOptions {
  practiceId?: string;
  matterId?: string | null;
  status?: ConversationStatus | null;
  scope?: 'practice' | 'all';
  limit?: number;
  offset?: number;
  enabled?: boolean;
  onError?: (error: string) => void;
}

interface UseConversationsReturn {
  conversations: Conversation[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  addParticipants: (conversationId: string, participantUserIds: string[]) => Promise<Conversation | null>;
  linkConversationToUser: (conversationId: string, userId?: string) => Promise<Conversation | null>;
}

/**
 * Hook for listing conversations
 * Fetches conversations list, optionally filtered by matterId or status
 */
export function useConversationsWithContext(options?: Omit<UseConversationsOptions, 'practiceId'>): UseConversationsReturn {
  const { activePracticeId } = useSessionContext();
  return useConversations({ ...options, practiceId: activePracticeId ?? undefined });
}

/**
 * Legacy hook that requires practiceId parameter
 * @deprecated Use useConversationsWithContext() instead
 */
export function useConversations({
  practiceId,
  matterId,
  status,
  scope = 'practice',
  limit,
  offset,
  enabled = true,
  onError,
}: UseConversationsOptions = {}): UseConversationsReturn {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const isDisposedRef = useRef(false);
  const onErrorRef = useRef(onError);

  // Keep onError ref in sync
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    return () => {
      isDisposedRef.current = true;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    if (scope === 'practice' && !practiceId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const token = await getTokenAsync();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const params = new URLSearchParams();

      if (scope === 'all') {
        params.set('scope', 'all');
      } else if (practiceId) {
        params.set('practiceId', practiceId);
      }

      if (matterId && scope !== 'all') {
        params.set('matterId', matterId);
      }
      if (status) {
        params.set('status', status);
      }
      if (limit) {
        params.set('limit', limit.toString());
      }
      if (offset !== undefined && offset !== null) {
        params.set('offset', offset.toString());
      }

      const queryString = params.toString();
      const response = await fetch(`${getConversationsEndpoint()}${queryString ? `?${queryString}` : ''}`, {
        method: 'GET',
        headers,
        credentials: 'include',
      });

      // Handle redirects (practice members get redirected to inbox)
      // Note: fetch() automatically follows redirects by default, so we check response.redirected
      // and response.url to detect if a redirect to inbox occurred
      if (response.redirected && response.url.includes('/api/inbox')) {
        // Practice member - conversations should be fetched via inbox endpoint
        // For now, set empty array (inbox hook handles this separately)
        if (!isDisposedRef.current) {
          setConversations([]);
          setError(null);
        }
        return;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json() as { 
        success: boolean; 
        error?: string; 
        data?: Conversation[] | { conversation: Conversation } | { conversations: Conversation[] };
      };
      
      if (!data.success || !data.data) {
        throw new Error(data.error || 'Failed to fetch conversations');
      }

      // Handle different response shapes
      let conversationsArray: Conversation[] = [];
      
      if ('conversation' in data.data) {
        // Anonymous: single conversation
        conversationsArray = [data.data.conversation];
      } else if (Array.isArray(data.data)) {
        // Direct array of conversations
        conversationsArray = data.data;
      } else if ('conversations' in data.data && Array.isArray(data.data.conversations)) {
        // Wrapped array
        conversationsArray = data.data.conversations;
      } else {
        throw new Error('Invalid response format');
      }

      if (!isDisposedRef.current) {
        setConversations(conversationsArray);
        setError(null);
      }
    } catch (err) {
      if (isDisposedRef.current) return;
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch conversations';
      setError(errorMessage);
      onErrorRef.current?.(errorMessage);
    } finally {
      if (!isDisposedRef.current) {
        setIsLoading(false);
      }
    }
  }, [practiceId, matterId, status, scope, limit, offset, enabled]);

  // Refresh conversations
  const refresh = useCallback(async () => {
    await fetchConversations();
  }, [fetchConversations]);

  const addParticipants = useCallback(async (
    conversationId: string,
    participantUserIds: string[]
  ): Promise<Conversation | null> => {
    if (!practiceId) {
      const errorMessage = 'Practice ID is required to add participants';
      setError(errorMessage);
      onError?.(errorMessage);
      return null;
    }

    if (!conversationId) {
      const errorMessage = 'Conversation ID is required to add participants';
      setError(errorMessage);
      onError?.(errorMessage);
      return null;
    }

    if (!Array.isArray(participantUserIds) || participantUserIds.length === 0) {
      const errorMessage = 'At least one participant user ID is required';
      setError(errorMessage);
      onError?.(errorMessage);
      return null;
    }

    try {
      const token = await getTokenAsync();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const response = await fetch(getConversationParticipantsEndpoint(conversationId), {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ participantUserIds }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json() as { success: boolean; error?: string; data?: Conversation };
      if (!data.success || !data.data) {
        throw new Error(data.error || 'Failed to add participants');
      }

      // Refresh conversations to pull the latest participant list
      await refresh();

      return data.data;
    } catch (err) {
      if (isDisposedRef.current) return null;
      const errorMessage = err instanceof Error ? err.message : 'Failed to add participants';
      setError(errorMessage);
      onError?.(errorMessage);
      return null;
    }
  }, [practiceId, onError, refresh]);

  const linkConversationToUser = useCallback(async (
    conversationId: string,
    userId?: string
  ): Promise<Conversation | null> => {
    if (!practiceId) {
      const errorMessage = 'Practice ID is required to link conversation';
      setError(errorMessage);
      onError?.(errorMessage);
      return null;
    }

    if (!conversationId) {
      const errorMessage = 'Conversation ID is required to link conversation';
      setError(errorMessage);
      onError?.(errorMessage);
      return null;
    }

    try {
      const conversation = await apiLinkConversationToUser(conversationId, practiceId, userId);
      await refresh();
      return conversation;
    } catch (err) {
      if (isDisposedRef.current) return null;
      const errorMessage = err instanceof Error ? err.message : 'Failed to link conversation';
      setError(errorMessage);
      onError?.(errorMessage);
      return null;
    }
  }, [practiceId, onError, refresh]);

  // Initial load and refetch when filters change
  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    if (scope === 'practice' && !practiceId) {
      setIsLoading(false);
      return;
    }

    abortControllerRef.current = new AbortController();
    fetchConversations();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [practiceId, matterId, status, fetchConversations, scope, enabled]);

  return {
    conversations,
    isLoading,
    error,
    refresh,
    addParticipants,
    linkConversationToUser,
  };
}
