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
  }, [practiceId, matterId, status]);

  // Refresh conversations
  const refresh = useCallback(async () => {
    await fetchConversations();
  }, [fetchConversations]);

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
  };
}

