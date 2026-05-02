import { useEffect } from 'preact/hooks';
import type { Conversation } from '@/shared/types/conversation';
import type { LayoutMode } from '@/app/MainApp';

type MutableRef<T> = { current: T };

interface IntakeTriageLookup {
  byConversationId: { has: (key: string) => boolean };
}

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
  intakeLookupLoaded: boolean;
  acceptedIntakeConversationsLoading: boolean;
  acceptedIntakeConversationIds: string[];
  acceptedIntakeConversationsRef: MutableRef<Conversation[]>;
  intakeTriageStatusLookup: IntakeTriageLookup;
  isInitialConversationCheckRef: MutableRef<boolean>;
  navigationInitiatedRef: MutableRef<boolean>;
  hasAutoNavigatedRef: MutableRef<boolean>;

  conversationsPath: string;
  navigate: (path: string) => void;
  withWidgetQuery: (path: string) => string;
  handleSelectConversation: (conversationId: string) => void;
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
    intakeLookupLoaded,
    acceptedIntakeConversationsLoading,
    acceptedIntakeConversationIds,
    acceptedIntakeConversationsRef,
    intakeTriageStatusLookup,
    isInitialConversationCheckRef,
    navigationInitiatedRef,
    hasAutoNavigatedRef,
    conversationsPath,
    navigate,
    withWidgetQuery,
    handleSelectConversation,
    setActiveConversationMissingNotification,
    activeConversationMissingNotification,
    showError,
  } = options;

  // Reset auto-navigation flags when the practice changes.
  useEffect(() => {
    navigationInitiatedRef.current = false;
    hasAutoNavigatedRef.current = false;
  // effect intentionally only runs on practiceId — other deps intentionally omitted
  }, [practiceId]);

  // Reset the initial-check ref on view entry / id change so the auto-nav
  // effect runs once for the new context, not on every background refresh.
  useEffect(() => {
    isInitialConversationCheckRef.current = true;
  }, [view, workspaceSection, activeConversationId, isInitialConversationCheckRef]);

  // Practice workspace: if the active conversation isn't in the filtered list,
  // either notify or fall back to the first available conversation.
  useEffect(() => {
    if (!isPracticeWorkspace || workspaceSection !== 'conversations' || view !== 'conversation') return;
    if (!isInitialConversationCheckRef.current) return;
    if (!activeConversationId || resolvedConversationsLoading || !intakeLookupLoaded || acceptedIntakeConversationsLoading) return;

    if (filteredConversations.some((c) => c.id === activeConversationId)) {
      isInitialConversationCheckRef.current = false;
      return;
    }

    const existsInResolved = resolvedConversations.some((c) => c.id === activeConversationId);
    const existsInAcceptedIntakes = intakeTriageStatusLookup.byConversationId.has(activeConversationId)
      || acceptedIntakeConversationIds.includes(activeConversationId)
      || acceptedIntakeConversationsRef.current.some((c) => c.id === activeConversationId);

    if (existsInResolved || existsInAcceptedIntakes || resolvedConversationsLoading || !intakeLookupLoaded) {
      setActiveConversationMissingNotification('The selected conversation is currently hidden by filters or still loading.');
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
    acceptedIntakeConversationIds,
    acceptedIntakeConversationsLoading,
    acceptedIntakeConversationsRef,
    conversationsPath,
    filteredConversations,
    handleSelectConversation,
    intakeTriageStatusLookup.byConversationId,
    intakeLookupLoaded,
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

  // Client workspace on desktop: pick the first conversation if none is active.
  useEffect(() => {
    if (!isClientWorkspace || layoutMode !== 'desktop') return;
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
    activeConversationId,
    resolvedConversationsLoading,
    filteredConversations,
    handleSelectConversation,
    hasAutoNavigatedRef,
    navigationInitiatedRef,
  ]);

  // Surface filter/loading state notifications via toast.
  useEffect(() => {
    if (!activeConversationMissingNotification) return;
    showError('Conversation', activeConversationMissingNotification);
    setActiveConversationMissingNotification(null);
  }, [activeConversationMissingNotification, setActiveConversationMissingNotification, showError]);
}
