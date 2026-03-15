import { useState, useEffect, useCallback, useRef, useMemo } from 'preact/hooks';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { getConversationsEndpoint, getConversationParticipantsEndpoint, getPracticeConversationsEndpoint } from '@/config/api';
import type { Conversation, ConversationStatus } from '@/shared/types/conversation';
import { linkConversationToUser as apiLinkConversationToUser } from '@/shared/lib/apiClient';
import { clearConversationAnonymousParticipant } from '@/shared/utils/anonymousIdentity';
import { withWidgetAuthHeaders } from '@/shared/utils/widgetAuth';

interface UseConversationsOptions {
  practiceId?: string;
  matterId?: string | null;
  status?: ConversationStatus | null;
  assignedTo?: 'none' | null;
  scope?: 'practice' | 'all';
  limit?: number;
  offset?: number;
  list?: boolean;
  enabled?: boolean;
  allowAnonymous?: boolean;
  preferOrgScopedPracticeList?: boolean;
  onError?: (error: string) => void;
}

interface UseConversationsReturn {
  conversations: Conversation[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  addParticipants: (conversationId: string, participantUserIds: string[]) => Promise<Conversation | null>;
  linkConversationToUser: (
    conversationId: string,
    userId?: string,
    options?: { previousParticipantId?: string | null; anonymousSessionId?: string | null }
  ) => Promise<Conversation | null>;
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
  assignedTo,
  scope = 'practice',
  limit,
  offset,
  list = false,
  enabled = true,
  allowAnonymous = false,
  preferOrgScopedPracticeList = false,
  onError,
}: UseConversationsOptions = {}): UseConversationsReturn {
  const { activePracticeId, session, isPending: sessionIsPending } = useSessionContext();
  const sessionPracticeId = useMemo(() => activePracticeId ?? null, [activePracticeId]);
  const sessionReady = !sessionIsPending && (Boolean(session?.user) || allowAnonymous);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const isDisposedRef = useRef(false);
  const onErrorRef = useRef(onError);

  // Ref that always points to the latest fetchConversations callback.
  // Initialised with a no-op; the effect below keeps it current every render.
  // This lets the fetch effect below depend only on primitive query params.
  const fetchConversationsRef = useRef<(signal?: AbortSignal) => Promise<void>>(() => Promise.resolve());
  useEffect(() => {
    fetchConversationsRef.current = fetchConversations;
  });


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
  const fetchConversations = useCallback(async (signal?: AbortSignal) => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    if (!sessionReady) {
      setIsLoading(true);
      return;
    }

    const effectivePracticeId = scope === 'practice'
      ? (practiceId ?? sessionPracticeId)
      : (practiceId ?? null);

    if (scope === 'practice' && !effectivePracticeId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      const params = new URLSearchParams();

      if (scope === 'all') {
        params.set('scope', 'all');
      } else if (effectivePracticeId) {
        if (preferOrgScopedPracticeList) {
          params.set('practice_id', effectivePracticeId);
        } else {
          params.set('practiceId', effectivePracticeId);
        }
      }

      if (matterId && scope !== 'all') {
        params.set('matterId', matterId);
      }
      if (status) {
        params.set('status', status);
      }
      if (assignedTo != null) {
        params.set('assignedTo', String(assignedTo));
      }
      if (limit) {
        params.set('limit', limit.toString());
      }
      if (offset !== undefined && offset !== null) {
        params.set('offset', offset.toString());
      }
      if (list) {
        params.set('list', 'true');
      }

      const queryString = params.toString();
      const endpoint = scope === 'practice' && preferOrgScopedPracticeList
        ? getPracticeConversationsEndpoint()
        : getConversationsEndpoint();
      const response = await fetch(`${endpoint}${queryString ? `?${queryString}` : ''}`, {
        method: 'GET',
        headers: withWidgetAuthHeaders(headers),
        credentials: 'include',
        signal,
      });

      if (!response.ok) {
        // Worker returns error responses in format: { success: false, error: string, errorCode: string }
        const errorData = await response.json().catch(() => ({
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`
        })) as { success?: boolean; error?: string; errorCode?: string };

        // Use error message from response, or fallback to status text
        const errorMessage = errorData.error || `HTTP ${response.status}: ${response.statusText}`;
        throw new Error(errorMessage);
      }

      const data = await response.json() as {
        success: boolean;
        error?: string;
        errorCode?: string;
        data?: Conversation[] | { conversation: Conversation } | { conversations: Conversation[] };
      };

      // Check for error response format (worker returns { success: false, error: "..." })
      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch conversations');
      }

      // Check if data exists
      if (!data.data) {
        throw new Error(data.error || 'No data returned from server');
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
      if (isDisposedRef.current || (err instanceof DOMException && err.name === 'AbortError')) return;
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch conversations';
      setError(errorMessage);
      onErrorRef.current?.(errorMessage);
    } finally {
      if (!isDisposedRef.current) {
        setIsLoading(false);
      }
    }
  }, [practiceId, matterId, status, assignedTo, scope, limit, offset, list, enabled, sessionPracticeId, sessionReady, preferOrgScopedPracticeList]);

  // Refresh conversations
  const refresh = useCallback(async () => {
    if (!enabled) {
      return;
    }
    await fetchConversations();
  }, [fetchConversations, enabled]);

  const addParticipants = useCallback(async (
    conversationId: string,
    participantUserIds: string[]
  ): Promise<Conversation | null> => {
    if (!practiceId) {
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
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };

      const response = await fetch(getConversationParticipantsEndpoint(conversationId), {
        method: 'POST',
        headers: withWidgetAuthHeaders(headers),
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
    userId?: string,
    options?: { previousParticipantId?: string | null; anonymousSessionId?: string | null }
  ): Promise<Conversation | null> => {
    if (!practiceId) {
      return null;
    }

    if (!conversationId) {
      const errorMessage = 'Conversation ID is required to link conversation';
      setError(errorMessage);
      onError?.(errorMessage);
      return null;
    }

    try {
      const conversation = await apiLinkConversationToUser(conversationId, practiceId, userId, options);
      clearConversationAnonymousParticipant(conversationId);
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

  // Initial load and refetch when the query parameters change.
  // Note: fetchConversations is intentionally NOT in this dep array — it's
  // stored in a ref above. The primitives here are the actual query axes;
  // including the callback would cause re-fires on every render cycle.
  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    if (!sessionReady) {
      setIsLoading(true);
      return;
    }

    if (scope === 'practice' && !practiceId) {
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    void fetchConversationsRef.current(controller.signal);

    return () => {
      controller.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [practiceId, sessionPracticeId, matterId, status, assignedTo, scope, enabled, sessionReady, list, preferOrgScopedPracticeList, limit, offset]);

  return {
    conversations,
    isLoading,
    error,
    refresh,
    addParticipants,
    linkConversationToUser,
  };
}
