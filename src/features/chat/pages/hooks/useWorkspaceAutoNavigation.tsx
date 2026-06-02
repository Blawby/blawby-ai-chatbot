import { useEffect } from 'preact/hooks';
import type { Conversation } from '@/shared/types/conversation';
import type { LayoutMode } from '@/app/MainApp';

type MutableRef<T> = { current: T };

export interface UseWorkspaceAutoNavigationOptions {
  view: string;
  workspaceSection: string | null;
  activeConversationId: string | null;
  practiceId: string;
  isPracticeWorkspace: boolean;
  isClientWorkspace: boolean;
  layoutMode: LayoutMode;

  filteredConversations: Conversation[];
  resolvedConversations: Conversation[];
  resolvedConversationsLoading: boolean;
  isInitialConversationCheckRef: MutableRef<boolean>;
  navigationInitiatedRef: MutableRef<boolean>;
  hasAutoNavigatedRef: MutableRef<boolean>;

  conversationsPath: string;
  navigate: (path: string) => void;
  withWidgetQuery: (path: string) => string;
  handleSelectConversation: (conversationId: string) => void;
  onCreateAssistantConversation: (() => void) | null;
  setActiveConversationMissingNotification: (msg: string | null) => void;
  activeConversationMissingNotification: string | null;
  showError: (title: string, message?: string) => void;
}

export function useWorkspaceAutoNavigation(
  options: UseWorkspaceAutoNavigationOptions
): void {
  const {
    view,
    workspaceSection,
    activeConversationId,
    practiceId,
    isPracticeWorkspace,
    isClientWorkspace,
    layoutMode,
    filteredConversations,
    resolvedConversations,
    resolvedConversationsLoading,
    isInitialConversationCheckRef,
    navigationInitiatedRef,
    hasAutoNavigatedRef,
    conversationsPath,
    navigate,
    withWidgetQuery,
    handleSelectConversation,
    onCreateAssistantConversation,
    setActiveConversationMissingNotification,
    activeConversationMissingNotification,
    showError,
  } = options;

  // Reset auto-navigation flags when the practice changes.
  useEffect(() => {
    navigationInitiatedRef.current = false;
    hasAutoNavigatedRef.current = false;
  // effect intentionally only runs on practiceId — other deps intentionally omitted
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [practiceId]);

  // Reset the initial-check ref on view entry / id change so the auto-nav
  // effect runs once for the new context, not on every background refresh.
  useEffect(() => {
    isInitialConversationCheckRef.current = true;
  }, [view, workspaceSection, activeConversationId, isInitialConversationCheckRef]);

  // Practice workspace: if the active conversation isn't in the filtered list,
  // either notify (it exists but the view-filter hides it) or fall back to the
  // first available conversation (it's gone / never visible to this viewer).
  //
  // Visibility filtering is now the worker's job (GET /api/conversations only
  // returns visible rows), so "not in resolvedConversations" is authoritative —
  // we no longer reconcile against an intake-acceptance side channel here.
  useEffect(() => {
    if (!isPracticeWorkspace || workspaceSection !== 'conversations' || view !== 'conversation') return;
    if (!isInitialConversationCheckRef.current) return;
    if (!activeConversationId || resolvedConversationsLoading) return;

    if (filteredConversations.some((c) => c.id === activeConversationId)) {
      isInitialConversationCheckRef.current = false;
      return;
    }

    const existsInResolved = resolvedConversations.some((c) => c.id === activeConversationId);
    if (existsInResolved) {
      // Worker returned this row but the view filter (your-inbox / mentions /
      // etc.) excludes it. Notify the user instead of redirecting.
      setActiveConversationMissingNotification('The selected conversation is currently hidden by filters.');
      isInitialConversationCheckRef.current = false;
      return;
    }

    const firstConversationId = filteredConversations[0]?.id;
    if (!firstConversationId) {
      navigate(withWidgetQuery(conversationsPath));
      isInitialConversationCheckRef.current = false;
      return;
    }
    handleSelectConversation(firstConversationId);
    isInitialConversationCheckRef.current = false;
  }, [
    activeConversationId,
    conversationsPath,
    filteredConversations,
    handleSelectConversation,
    isInitialConversationCheckRef,
    isPracticeWorkspace,
    navigate,
    resolvedConversations,
    resolvedConversationsLoading,
    setActiveConversationMissingNotification,
    view,
    withWidgetQuery,
    workspaceSection,
  ]);

  // Client workspace on desktop, conversations section: pick the first
  // conversation if none is active. Gated on workspaceSection so the home tab
  // can render the client dashboard instead of bouncing straight to messages.
  useEffect(() => {
    if (!isClientWorkspace || layoutMode !== 'desktop') return;
    if (workspaceSection !== 'conversations') return;
    if (activeConversationId || hasAutoNavigatedRef.current) return;
    if (resolvedConversationsLoading) return;
    if (navigationInitiatedRef.current) return;

    const firstConversationId = filteredConversations[0]?.id;
    if (!firstConversationId) return;

    navigationInitiatedRef.current = true;
    hasAutoNavigatedRef.current = true;
    handleSelectConversation(firstConversationId);
  }, [
    isClientWorkspace,
    layoutMode,
    workspaceSection,
    activeConversationId,
    resolvedConversationsLoading,
    filteredConversations,
    handleSelectConversation,
    hasAutoNavigatedRef,
    navigationInitiatedRef,
  ]);

  // Assistant workspace root should always resolve to a concrete thread.
  useEffect(() => {
    if (!isPracticeWorkspace || workspaceSection !== 'assistant' || view !== 'assistant') return;
    if (resolvedConversationsLoading) return;
    if (navigationInitiatedRef.current) return;

    const assistantConversations = filteredConversations
      .slice()
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

    if (activeConversationId) {
      const hasActiveAssistantConversation = assistantConversations.some((conversation) => conversation.id === activeConversationId);
      if (hasActiveAssistantConversation) {
        isInitialConversationCheckRef.current = false;
        return;
      }
    }

    const mostRecentAssistantConversationId = assistantConversations[0]?.id;
    navigationInitiatedRef.current = true;
    hasAutoNavigatedRef.current = true;
    isInitialConversationCheckRef.current = false;

    if (mostRecentAssistantConversationId) {
      handleSelectConversation(mostRecentAssistantConversationId);
      return;
    }

    onCreateAssistantConversation?.();
  }, [
    activeConversationId,
    filteredConversations,
    handleSelectConversation,
    hasAutoNavigatedRef,
    isInitialConversationCheckRef,
    isPracticeWorkspace,
    navigationInitiatedRef,
    onCreateAssistantConversation,
    resolvedConversationsLoading,
    view,
    workspaceSection,
  ]);

  // Surface filter/loading state notifications via toast.
  useEffect(() => {
    if (!activeConversationMissingNotification) return;
    showError('Conversation', activeConversationMissingNotification);
    setActiveConversationMissingNotification(null);
  }, [activeConversationMissingNotification, setActiveConversationMissingNotification, showError]);
}
