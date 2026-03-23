import { useState, useCallback, useRef, useEffect } from 'preact/hooks';
import { getConversationEndpoint, getConversationsEndpoint, getCurrentConversationEndpoint } from '@/config/api';
import type { ConversationMode } from '@/shared/types/conversation';
import { logConversationEvent, updateConversationMetadata } from '@/shared/lib/conversationApi';
import type { SessionContextValue } from '@/shared/contexts/SessionContext';
import { rememberConversationAnonymousParticipant } from '@/shared/utils/anonymousIdentity';
import { withWidgetAuthHeaders } from '@/shared/utils/widgetAuth';

export interface UseConversationSetupOptions {
  practiceId?: string;
  workspace: string;
  routeConversationId?: string | null;
  session: SessionContextValue['session'];
  sessionIsPending: boolean;
  userId?: string | null;
  isPracticeWorkspace: boolean;
  isPublicWorkspace: boolean;
  onModeChange: (mode: ConversationMode | null) => void;
  onError?: (message: string) => void;
}

export interface UseConversationSetupResult {
  conversationId: string | null;
  setConversationId: (id: string | null) => void;
  activeConversationId: string | null;
  conversationMode: ConversationMode | null;
  setConversationMode: (mode: ConversationMode | null) => void;
  isCreatingConversation: boolean;
  createConversation: (options?: { forceNew?: boolean }) => Promise<string | null>;
  ensureConversation: (options?: { forceNew?: boolean; waitForSessionReadyMs?: number }) => Promise<string | null>;
  handleModeSelection: (mode: ConversationMode, source: 'intro_gate' | 'composer_footer', startConsultFlow: (id: string) => void) => Promise<void>;
  handleStartNewConversation: (mode: ConversationMode, startConsultFlow: (id: string) => void) => Promise<string>;
  applyConversationMode: (
    mode: ConversationMode,
    conversationId: string,
    source: 'intro_gate' | 'composer_footer' | 'home_cta',
    startConsultFlow: (id: string) => void
  ) => Promise<void>;
}

export function useConversationSetup({
  practiceId,
  workspace,
  routeConversationId,
  session,
  sessionIsPending,
  userId: externalUserId,
  isPracticeWorkspace,
  isPublicWorkspace,
  onModeChange,
  onError,
}: UseConversationSetupOptions): UseConversationSetupResult {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);
  const [conversationMode, setConversationMode] = useState<ConversationMode | null>(null);
  const isSelectingRef = useRef(false);
  const isCreatingRef = useRef(false);
  const conversationRestoreAttemptedRef = useRef(false);
  const activeConversationIdRef = useRef<string | null>(null);
  const creationPromiseRef = useRef<Promise<string | null> | null>(null);

  // Decode route conversation ID safely
  const normalizedRouteConversationId = routeConversationId
    ? (() => {
        try {
          return decodeURIComponent(routeConversationId);
        } catch {
          return routeConversationId;
        }
      })()
    : null;

  const currentUserId = externalUserId ?? session?.user?.id ?? null;
  const activeConversationId = conversationId ?? normalizedRouteConversationId;

  // Update ref synchronously during render to prevent staleness
  activeConversationIdRef.current = activeConversationId;

  // Wrapped setter that updates both state and ref
  const setConversationIdWithRef = useCallback((id: string | null) => {
    setConversationId(id);
    activeConversationIdRef.current = id;
  }, []);

  // Sync route ID to state when it changes
  useEffect(() => {
    setConversationIdWithRef(normalizedRouteConversationId);
  }, [normalizedRouteConversationId, setConversationIdWithRef]);

  // Cache key for localStorage restore — only used in practice/client workspaces
  const conversationCacheKey = isPublicWorkspace
    ? null
    : practiceId && currentUserId
      ? `chat:lastConversation:${workspace}:${practiceId}:${currentUserId}`
      : null;

  // Persist active conversation to localStorage
  useEffect(() => {
    if (!conversationCacheKey || !activeConversationId) return;
    try {
      window.localStorage.setItem(conversationCacheKey, activeConversationId);
    } catch {
      // Ignore write errors (private browsing etc.)
    }
  }, [conversationCacheKey, activeConversationId]);

  const createConversation = useCallback(async (options?: { forceNew?: boolean }): Promise<string | null> => {
    if (isPracticeWorkspace) return null;
    if (!practiceId || isCreatingRef.current) return null;

    try {
      isCreatingRef.current = true;
      setIsCreatingConversation(true);
      
      // Create and track the creation promise
      const creationPromise = (async () => {
        const params = new URLSearchParams({ practiceId });
        if (currentUserId) {
          params.set('participantUserIds', JSON.stringify([currentUserId]));
        }
        params.set('metadata', JSON.stringify({ source: 'chat' }));

        // Handle widget flow with external conversation ID
        if (false && conversationId) {
          const response = await fetch(`${getConversationsEndpoint()}?${params}`, {
            method: 'POST',
            headers: withWidgetAuthHeaders({ 'Content-Type': 'application/json' }),
            credentials: 'include',
            body: JSON.stringify({
              participantUserIds: currentUserId ? [currentUserId] : [],
              metadata: { source: 'chat' },
              practiceId,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({})) as { error?: string };
            throw new Error(errorData.error || `HTTP ${response.status}`);
          }

          const data = await response.json() as { success?: boolean; error?: string; data?: { conversation?: { id?: string } }; conversation?: { id?: string } };
          const resolvedId = data.conversation?.id ?? data.data?.conversation?.id ?? null;
          if (!resolvedId) throw new Error(data.error || 'Failed to start conversation');
          setConversationIdWithRef(resolvedId);
          if (isPublicWorkspace && currentUserId) {
            rememberConversationAnonymousParticipant(resolvedId, currentUserId);
          }
          return resolvedId;
        }

        const response = await fetch(`${getConversationsEndpoint()}?${params}`, {
          method: 'POST',
          headers: withWidgetAuthHeaders({ 'Content-Type': 'application/json' }),
          credentials: 'include',
          body: JSON.stringify({
            participantUserIds: currentUserId ? [currentUserId] : [],
            metadata: { source: 'chat' },
            practiceId,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({})) as { error?: string };
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        const data = await response.json() as { success: boolean; error?: string; data?: { id: string } };
        if (!data.success || !data.data?.id) throw new Error(data.error || 'Failed to start conversation');

        setConversationIdWithRef(data.data.id);
        return data.data.id;
      })();
      
      creationPromiseRef.current = creationPromise;
      const result = await creationPromise;
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start conversation';
      throw new Error(message);
    } finally {
      isCreatingRef.current = false;
      setIsCreatingConversation(false);
      creationPromiseRef.current = null;
    }
  }, [isPracticeWorkspace, isPublicWorkspace, practiceId, currentUserId, setConversationIdWithRef]);

  const ensureConversation = useCallback(async (options?: { forceNew?: boolean; waitForSessionReadyMs?: number }): Promise<string | null> => {
    // Read from ref to get latest value and avoid stale closure
    if (!options?.forceNew && activeConversationIdRef.current) return activeConversationIdRef.current;

    let resolvedConversationId = await createConversation({ forceNew: options?.forceNew });
    const waitForSessionReadyMs = Math.max(0, options?.waitForSessionReadyMs ?? 0);

    if (!resolvedConversationId && waitForSessionReadyMs > 0) {
      const deadline = Date.now() + waitForSessionReadyMs;
      while (!resolvedConversationId && Date.now() < deadline) {
        await new Promise<void>((resolve) => setTimeout(resolve, 300));
        
        // Check if conversation became available by reading from ref
        if (activeConversationIdRef.current) {
          return activeConversationIdRef.current;
        }
        
        // Wait until isCreatingRef.current is false before retrying
        while (isCreatingRef.current && Date.now() < deadline) {
          await new Promise<void>((resolve) => setTimeout(resolve, 100));
        }
        
        // Try again if we're not creating and still within deadline
        if (!isCreatingRef.current && Date.now() < deadline) {
          resolvedConversationId = await createConversation({ forceNew: options?.forceNew });
        }
      }
    }

    return resolvedConversationId;
  }, [createConversation]);

  const restoreConversationFromCache = useCallback(async (): Promise<string | null> => {
    if (!conversationCacheKey || !practiceId || !currentUserId) return null;
    const cached = window.localStorage.getItem(conversationCacheKey);
    if (!cached) return null;
    if (activeConversationIdRef.current === cached) return cached;

    const params = new URLSearchParams({ practiceId });
    const response = await fetch(`${getConversationEndpoint(cached)}?${params}`, {
      method: 'GET',
      headers: withWidgetAuthHeaders(),
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Cached conversation not found');
    }
    setConversationIdWithRef(cached);
    return cached;
  }, [conversationCacheKey, practiceId, currentUserId, setConversationIdWithRef]);

  // Attempt to restore a previously cached conversation on mount (non-public workspaces)
  useEffect(() => {
    if (isPublicWorkspace) return;
    if (sessionIsPending || !session?.user?.id || !practiceId) return;
    if (activeConversationIdRef.current) return;
    if (isCreatingRef.current) return;
    if (conversationRestoreAttemptedRef.current) return;
    conversationRestoreAttemptedRef.current = true;

    void restoreConversationFromCache().catch((err) => {
      // Keep attemptedRef true to avoid infinite retry loops on mount; 
      // the error is reported via onError.
      onError?.(err instanceof Error ? err.message : 'Failed to restore conversation');
    });
  }, [
    isPublicWorkspace,
    practiceId,
    restoreConversationFromCache,
    session?.user?.id,
    sessionIsPending,
    onError,
  ]);

  const applyConversationMode = useCallback(async (
    nextMode: ConversationMode,
    convId: string,
    source: 'intro_gate' | 'composer_footer' | 'home_cta',
    startConsultFlow: (id: string) => void
  ) => {
    if (!practiceId) return;

    // Attempt to persist the mode to the backend, but don't block the UI
    // if the server is temporarily unavailable (503, network flap, etc.).
    try {
      await updateConversationMetadata(convId, practiceId, { mode: nextMode });
    } catch (persistError) {
      const isServerError = persistError instanceof Error &&
        /HTTP 5\d{2}/.test(persistError.message);
      if (!isServerError) throw persistError; // rethrow client-side / auth errors
      console.warn('[useConversationSetup] applyConversationMode: backend unavailable, applying mode locally', persistError);
    }

    // Apply locally regardless of backend status.
    setConversationMode(nextMode);
    onModeChange(nextMode);
    void logConversationEvent(convId, practiceId, 'mode_selected', { mode: nextMode, source });
    if (nextMode === 'REQUEST_CONSULTATION') {
      startConsultFlow(convId);
      void logConversationEvent(convId, practiceId, 'consult_flow_started', { source });
    }
  // logConversationEvent and updateConversationMetadata are stable module-level
  // imports — omitting them keeps the callback reference stable.
   
  }, [onModeChange, practiceId]);

  const handleModeSelection = useCallback(async (
    nextMode: ConversationMode,
    source: 'intro_gate' | 'composer_footer',
    startConsultFlow: (id: string) => void
  ) => {
    if (isSelectingRef.current) return;
    isSelectingRef.current = true;
    try {
      let convId = activeConversationIdRef.current;
      if (!convId) {
        // If there's an in-flight creation, wait for it
        if (creationPromiseRef.current) {
          convId = await creationPromiseRef.current;
        } else if (!isCreatingRef.current) {
          // Otherwise create a new conversation
          convId = await ensureConversation();
        } else {
          // If creation is in progress but no promise is tracked, wait for it
          while (isCreatingRef.current && !activeConversationIdRef.current) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
          convId = activeConversationIdRef.current;
        }
      }
      if (!convId || !practiceId) return;
      await applyConversationMode(nextMode, convId, source, startConsultFlow);
    } catch (error) {
      setConversationMode(null);
      onModeChange(null);
      const message = error instanceof Error ? error.message : 'Unable to start conversation';
      onError?.(message);
    } finally {
      isSelectingRef.current = false;
    }
  }, [
    applyConversationMode,
    ensureConversation,
    onModeChange,
    onError,
    practiceId,
    setConversationMode,
  ]);

  const handleStartNewConversation = useCallback(async (nextMode: ConversationMode, startConsultFlow: (id: string) => void): Promise<string> => {
    if (isSelectingRef.current) throw new Error('Conversation start already in progress');
    isSelectingRef.current = true;
    try {
      if (!practiceId) throw new Error('Practice context is required');
      const newId = await ensureConversation({ waitForSessionReadyMs: 3000 });
      if (!newId) throw new Error('Unable to create conversation');
      await applyConversationMode(nextMode, newId, 'home_cta', startConsultFlow);
      return newId;
    } catch (error) {
      setConversationMode(null);
      onModeChange(null);
      throw error;
    } finally {
      isSelectingRef.current = false;
    }
  }, [applyConversationMode, ensureConversation, onModeChange, practiceId, setConversationMode]);

  return {
    conversationId,
    setConversationId: setConversationIdWithRef,
    activeConversationId,
    conversationMode,
    setConversationMode,
    isCreatingConversation,
    createConversation,
    ensureConversation,
    handleModeSelection,
    handleStartNewConversation,
    applyConversationMode,
  };
}
