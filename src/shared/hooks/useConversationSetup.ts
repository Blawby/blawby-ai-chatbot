import { useState, useCallback, useRef, useEffect } from 'preact/hooks';
import { getConversationEndpoint, getConversationsEndpoint } from '@/config/api';
import type { ConversationMode } from '@/shared/types/conversation';
import { logConversationEvent, updateConversationMetadata } from '@/shared/lib/conversationApi';
import type { SessionContextValue } from '@/shared/contexts/SessionContext';

export interface UseConversationSetupOptions {
  practiceId?: string;
  workspace: string;
  routeConversationId?: string | null;
  session: SessionContextValue['session'];
  sessionIsPending: boolean;
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
  createConversation: () => Promise<string | null>;
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

  const activeConversationId = normalizedRouteConversationId ?? conversationId;

  // Cache key for localStorage restore — only used in practice/client workspaces
  const conversationCacheKey = isPublicWorkspace
    ? null
    : practiceId && session?.user?.id
      ? `chat:lastConversation:${workspace}:${practiceId}:${session.user.id}`
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

  const createConversation = useCallback(async (): Promise<string | null> => {
    if (isPracticeWorkspace) return null;
    if (!practiceId || !session?.user || isCreatingRef.current) return null;

    try {
      isCreatingRef.current = true;
      setIsCreatingConversation(true);
      const params = new URLSearchParams({ practiceId });
      const response = await fetch(`${getConversationsEndpoint()}?${params}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          participantUserIds: [session.user.id],
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

      setConversationId(data.data.id);
      return data.data.id;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start conversation';
      throw new Error(message);
    } finally {
      isCreatingRef.current = false;
      setIsCreatingConversation(false);
    }
  }, [isPracticeWorkspace, practiceId, session?.user]);

  const restoreConversationFromCache = useCallback(async (): Promise<string | null> => {
    if (!conversationCacheKey || !practiceId || !session?.user) return null;
    const cached = window.localStorage.getItem(conversationCacheKey);
    if (!cached) return null;
    if (activeConversationId === cached) return cached;

    try {
      const params = new URLSearchParams({ practiceId });
      const response = await fetch(`${getConversationEndpoint(cached)}?${params}`, {
        method: 'GET',
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error(`Failed to restore conversation: ${response.status} ${response.statusText} (ID: ${cached})`);
      }
      setConversationId(cached);
      return cached;
    } catch (error) {
      throw error;
    }
  }, [conversationCacheKey, activeConversationId, practiceId, session?.user]);

  // Attempt to restore a previously cached conversation on mount (non-public workspaces)
  useEffect(() => {
    if (isPublicWorkspace) return;
    if (sessionIsPending || !session?.user?.id || !practiceId) return;
    if (activeConversationId) return;
    if (isCreatingRef.current) return;
    if (conversationRestoreAttemptedRef.current) return;
    conversationRestoreAttemptedRef.current = true;

    void restoreConversationFromCache().catch((err) => {
      conversationRestoreAttemptedRef.current = false;
      onError?.(err instanceof Error ? err.message : 'Failed to restore conversation');
    });
  }, [
    activeConversationId,
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
    await updateConversationMetadata(convId, practiceId, { mode: nextMode });
    setConversationMode(nextMode);
    onModeChange(nextMode);
    void logConversationEvent(convId, practiceId, 'mode_selected', { mode: nextMode, source });
    if (nextMode === 'REQUEST_CONSULTATION') {
      startConsultFlow(convId);
      void logConversationEvent(convId, practiceId, 'consult_flow_started', { source });
    }
  }, [logConversationEvent, onModeChange, practiceId, setConversationMode, updateConversationMetadata]);

  const handleModeSelection = useCallback(async (
    nextMode: ConversationMode,
    source: 'intro_gate' | 'composer_footer',
    startConsultFlow: (id: string) => void
  ) => {
    if (isSelectingRef.current) return;
    isSelectingRef.current = true;
    try {
      let convId = activeConversationId;
      if (!convId && !isCreatingRef.current) {
        convId = await createConversation();
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
    activeConversationId,
    applyConversationMode,
    createConversation,
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
      const newId = await createConversation();
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
  }, [applyConversationMode, createConversation, onModeChange, practiceId, setConversationMode]);

  return {
    conversationId,
    setConversationId,
    activeConversationId,
    conversationMode,
    setConversationMode,
    isCreatingConversation,
    createConversation,
    handleModeSelection,
    handleStartNewConversation,
    applyConversationMode,
  };
}

