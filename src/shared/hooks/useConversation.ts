import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { getTokenAsync } from '@/shared/lib/tokenStorage';
import { getCurrentConversationEndpoint, getConversationEndpoint, getChatMessagesEndpoint } from '@/config/api';
import type { Conversation, ConversationMessage, ConversationMessageUI } from '@/shared/types/conversation';

interface UseConversationOptions {
  conversationId: string;
  practiceId?: string;
  autoPoll?: boolean;
  pollInterval?: number; // milliseconds
  onError?: (error: string) => void;
}

interface UseConversationReturn {
  conversation: Conversation | null;
  messages: ConversationMessageUI[];
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  sendMessage: (content: string, attachments?: string[]) => Promise<void>;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  hasMore: boolean;
  nextCursor: string | null;
}

/**
 * Hook for managing a single conversation
 * Fetches conversation details and messages, supports polling for new messages
 */
export function useConversationWithContext(options: Omit<UseConversationOptions, 'practiceId'>): UseConversationReturn {
  const { activePracticeId } = useSessionContext();
  return useConversation({ ...options, practiceId: activePracticeId ?? undefined });
}

/**
 * Hook for getting or creating current conversation for a practice
 * Automatically fetches the current conversation (or creates one) and returns conversation data
 * Note: The API endpoint automatically creates a conversation if one doesn't exist
 */
export function useCurrentConversation(
  practiceId: string | undefined,
  options?: { onError?: (error: string) => void }
): UseConversationReturn & { conversationId: string | null } {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isLoadingCurrent, setIsLoadingCurrent] = useState<boolean>(true);
  const [errorCurrent, setErrorCurrent] = useState<string | null>(null);
  const onErrorRef = useRef(options?.onError);
  
  // Keep onError ref in sync
  useEffect(() => {
    onErrorRef.current = options?.onError;
  }, [options?.onError]);
  
  // Fetch current conversation
  useEffect(() => {
    if (!practiceId) {
      setIsLoadingCurrent(false);
      return;
    }
    
    const fetchCurrent = async () => {
      setIsLoadingCurrent(true);
      setErrorCurrent(null);
      
      try {
        const token = await getTokenAsync();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;
        
        const response = await fetch(
          `${getCurrentConversationEndpoint()}?practiceId=${encodeURIComponent(practiceId)}`,
          {
            method: 'GET',
            headers,
            credentials: 'include',
          }
        );
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({})) as { error?: string };
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }
        
        const data = await response.json() as { 
          success: boolean; 
          error?: string; 
          data?: { conversation: Conversation } 
        };
        
        if (!data.success || !data.data?.conversation) {
          throw new Error(data.error || 'Failed to get current conversation');
        }
        
        setConversationId(data.data.conversation.id);
        setErrorCurrent(null);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to get conversation';
        setErrorCurrent(errorMessage);
        onErrorRef.current?.(errorMessage);
      } finally {
        setIsLoadingCurrent(false);
      }
    };
    
    fetchCurrent();
  }, [practiceId]); // Only depend on practiceId to avoid infinite re-renders
  
  // Use existing useConversation hook with the conversationId
  const conversationHook = useConversation({ 
    conversationId: conversationId || '', 
    practiceId,
    onError: options?.onError 
  });
  
  // Combine loading states
  const isLoading = isLoadingCurrent || (conversationId ? conversationHook.isLoading : false);
  const error = errorCurrent || conversationHook.error;
  
  return {
    conversation: conversationHook.conversation,
    messages: conversationHook.messages,
    isLoading,
    isLoadingMore: conversationHook.isLoadingMore,
    error,
    sendMessage: conversationHook.sendMessage,
    loadMore: conversationHook.loadMore,
    refresh: conversationHook.refresh,
    hasMore: conversationHook.hasMore,
    nextCursor: conversationHook.nextCursor,
    conversationId,
  };
}

/**
 * Legacy hook that requires practiceId parameter
 * @deprecated Use useConversationWithContext() instead
 */
export function useConversation({
  conversationId,
  practiceId,
  autoPoll = false,
  pollInterval = 5000,
  onError,
}: UseConversationOptions): UseConversationReturn {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ConversationMessageUI[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [lastPollTime, setLastPollTime] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const pollIntervalRef = useRef<number | null>(null);
  const isDisposedRef = useRef(false);

  useEffect(() => {
    return () => {
      isDisposedRef.current = true;
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Convert API message to UI message
  const toUIMessage = useCallback((msg: ConversationMessage): ConversationMessageUI => {
    return {
      ...msg,
      isUser: msg.role === 'user',
      timestamp: new Date(msg.created_at).getTime(),
      files: msg.metadata?.attachments ? (msg.metadata.attachments as string[]).map((fileId: string) => ({
        id: fileId,
        name: 'File',
        size: 0,
        type: 'application/octet-stream',
        url: '', // TODO: Generate file URL from file ID
      })) : undefined,
    };
  }, []);

  // Fetch conversation details
  const fetchConversation = useCallback(async () => {
    if (!conversationId || !practiceId) {
      return;
    }

    try {
      const token = await getTokenAsync();
      if (!token) {
        const authError = 'Authentication required to load conversation details.';
        setError(authError);
        onError?.(authError);
        return;
      }

      // credentials: 'include' attaches Better Auth cookies, but we still send the bearer token
      // so the worker always receives an explicit user identity for permission checks.
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      };

      const response = await fetch(`${getConversationEndpoint(conversationId)}?practiceId=${encodeURIComponent(practiceId)}`, {
        method: 'GET',
        headers,
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json() as { success: boolean; error?: string; data?: Conversation };
      if (!data.success || !data.data) {
        throw new Error(data.error || 'Failed to fetch conversation');
      }

      if (!isDisposedRef.current) {
        setConversation(data.data);
        setError(null);
      }
    } catch (err) {
      if (isDisposedRef.current) return;
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch conversation';
      setError(errorMessage);
      onError?.(errorMessage);
    }
  }, [conversationId, practiceId, onError]);

  // Fetch messages
  const fetchMessages = useCallback(async (options?: { since?: string; cursor?: string; isLoadMore?: boolean }) => {
    if (!conversationId || !practiceId) {
      return;
    }

    const loadingState = options?.isLoadMore ? setIsLoadingMore : setIsLoading;
    loadingState(true);
    setError(null);

    try {
      const token = await getTokenAsync();
      if (!token) {
        const authError = 'Authentication required to load messages.';
        setError(authError);
        onError?.(authError);
        loadingState(false);
        return;
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      };

      const params = new URLSearchParams({
        conversationId,
        practiceId,
        limit: '50',
      });

      if (options?.since) {
        params.set('since', options.since);
      } else if (options?.cursor) {
        params.set('cursor', options.cursor);
      }

      const response = await fetch(`${getChatMessagesEndpoint()}?${params.toString()}`, {
        method: 'GET',
        headers,
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json() as { success: boolean; error?: string; data?: { messages: ConversationMessage[]; hasMore: boolean; nextCursor?: string | null } };
      if (!data.success || !data.data) {
        throw new Error(data.error || 'Failed to fetch messages');
      }

      if (!isDisposedRef.current) {
        const uiMessages = data.data.messages.map(toUIMessage);
        
        if (options?.isLoadMore) {
          // Prepend older messages
          setMessages(prev => [...uiMessages, ...prev]);
        } else if (options?.since) {
          // Append new messages (polling)
          setMessages(prev => [...prev, ...uiMessages]);
        } else {
          // Initial load or refresh
          setMessages(uiMessages);
        }

        setHasMore(data.data.hasMore);
        setNextCursor(data.data.nextCursor ?? null);
        setError(null);
      }
    } catch (err) {
      if (isDisposedRef.current) return;
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch messages';
      setError(errorMessage);
      onError?.(errorMessage);
    } finally {
      if (!isDisposedRef.current) {
        loadingState(false);
      }
    }
  }, [conversationId, practiceId, toUIMessage, onError]);

  // Send message
  const sendMessage = useCallback(async (content: string, attachments?: string[]) => {
    if (!conversationId || !practiceId) {
      throw new Error('Conversation ID and practice ID are required');
    }

    try {
      const token = await getTokenAsync();
      if (!token) {
        const authError = 'Authentication required to send messages.';
        setError(authError);
        onError?.(authError);
        throw new Error(authError);
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      };

      // Optimistic update
      const tempMessage: ConversationMessageUI = {
        id: `temp-${Date.now()}`,
        conversation_id: conversationId,
        practice_id: practiceId,
        user_id: '', // Will be set by server (messages always have a user_id, not null)
        role: 'user',
        content,
        metadata: attachments ? { attachments } : null,
        token_count: null,
        created_at: new Date().toISOString(),
        isUser: true,
        timestamp: Date.now(),
        files: attachments?.map((fileId) => ({
          id: fileId,
          name: 'File',
          size: 0,
          type: 'application/octet-stream',
          url: '',
        })),
      };

      setMessages(prev => [...prev, tempMessage]);

      const response = await fetch(getChatMessagesEndpoint(), {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          conversationId,
          content,
          attachments,
        }),
      });

      if (!response.ok) {
        // Remove optimistic message on error
        setMessages(prev => prev.filter(m => m.id !== tempMessage.id));
        const errorData = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json() as { success: boolean; error?: string; data?: ConversationMessage };
      if (!data.success || !data.data) {
        setMessages(prev => prev.filter(m => m.id !== tempMessage.id));
        throw new Error(data.error || 'Failed to send message');
      }

      // Replace temp message with real message
      if (!isDisposedRef.current) {
        const serverMessage = data.data;
        if (serverMessage) {
          setMessages(prev => prev.map(m => m.id === tempMessage.id ? toUIMessage(serverMessage) : m));
          // Refresh conversation to update updated_at
          await fetchConversation();
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send message';
      setError(errorMessage);
      onError?.(errorMessage);
      throw err;
    }
  }, [conversationId, practiceId, toUIMessage, fetchConversation, onError]);

  // Load more messages (pagination)
  const loadMore = useCallback(async () => {
    if (!nextCursor || isLoadingMore) {
      return;
    }
    await fetchMessages({ cursor: nextCursor, isLoadMore: true });
  }, [nextCursor, isLoadingMore, fetchMessages]);

  // Refresh messages
  const refresh = useCallback(async () => {
    await Promise.all([fetchConversation(), fetchMessages()]);
  }, [fetchConversation, fetchMessages]);

  // Poll for new messages
  const pollForNewMessages = useCallback(async () => {
    if (!conversationId || !practiceId || !autoPoll) {
      return;
    }

    const since = lastPollTime || (messages.length > 0 ? messages[messages.length - 1].created_at : undefined);
    if (since) {
      await fetchMessages({ since, isLoadMore: false });
      if (!isDisposedRef.current && messages.length > 0) {
        setLastPollTime(messages[messages.length - 1].created_at);
      }
    }
  }, [conversationId, practiceId, autoPoll, lastPollTime, messages, fetchMessages]);

  // Initial load
  useEffect(() => {
    if (!conversationId || !practiceId) {
      setIsLoading(false);
      return;
    }

    abortControllerRef.current = new AbortController();
    Promise.all([fetchConversation(), fetchMessages()]).finally(() => {
      if (!isDisposedRef.current) {
        setIsLoading(false);
        if (messages.length > 0) {
          setLastPollTime(messages[messages.length - 1].created_at);
        }
      }
    });

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, practiceId]); // Only run on mount or when IDs change

  // Set up polling
  useEffect(() => {
    if (!autoPoll || !conversationId || !practiceId) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }

    pollIntervalRef.current = window.setInterval(() => {
      pollForNewMessages();
    }, pollInterval);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [autoPoll, pollInterval, conversationId, practiceId, pollForNewMessages]);

  return {
    conversation,
    messages,
    isLoading,
    isLoadingMore,
    error,
    sendMessage,
    loadMore,
    refresh,
    hasMore,
    nextCursor,
  };
}
