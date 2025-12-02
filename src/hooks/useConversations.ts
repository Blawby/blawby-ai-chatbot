import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import { useSessionContext } from '../contexts/SessionContext.js';
import { getTokenAsync } from '../lib/tokenStorage';
import { getApiConfig } from '../config/api';
import type { Conversation, ConversationStatus } from '../types/conversation';

interface UseConversationsOptions {
  practiceId?: string;
  matterId?: string | null;
  status?: ConversationStatus | null;
  onError?: (error: string) => void;
}

interface UseConversationsReturn {
  conversations: Conversation[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  addParticipants: (conversationId: string, participantUserIds: string[]) => Promise<Conversation | null>;
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
  onError,
}: UseConversationsOptions = {}): UseConversationsReturn {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const isDisposedRef = useRef(false);

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

      const params = new URLSearchParams({
        practiceId,
      });

      if (matterId) {
        params.set('matterId', matterId);
      }
      if (status) {
        params.set('status', status);
      }

      const config = getApiConfig();
      const response = await fetch(`${config.baseUrl}/api/conversations?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json() as { success: boolean; error?: string; data?: Conversation[] };
      if (!data.success || !Array.isArray(data.data)) {
        throw new Error(data.error || 'Failed to fetch conversations');
      }

      if (!isDisposedRef.current) {
        setConversations(data.data);
        setError(null);
      }
    } catch (err) {
      if (isDisposedRef.current) return;
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch conversations';
      setError(errorMessage);
      onError?.(errorMessage);
    } finally {
      if (!isDisposedRef.current) {
        setIsLoading(false);
      }
    }
  }, [practiceId, matterId, status, onError]);

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
      if (!token) {
        throw new Error('Authentication required');
      }

      const config = getApiConfig();
      const response = await fetch(`${config.baseUrl}/api/conversations/${conversationId}/participants`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
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

  // Initial load and refetch when filters change
  useEffect(() => {
    if (!practiceId) {
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
  }, [practiceId, matterId, status, fetchConversations]);

  return {
    conversations,
    isLoading,
    error,
    refresh,
    addParticipants,
  };
}

