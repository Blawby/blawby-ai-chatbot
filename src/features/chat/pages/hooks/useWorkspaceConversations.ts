import { useMemo, useRef, useState } from 'preact/hooks';
import { useConversations } from '@/shared/hooks/useConversations';
import { useIntakesData } from '@/features/intake/hooks/useIntakesData';
import {
  CLIENT_CONVERSATIONS_ASSIGNED_TO_MAP,
  PRACTICE_CONVERSATIONS_ASSIGNED_TO_MAP,
} from '@/shared/config/navConfig';
import type { Conversation } from '@/shared/types/conversation';

// Visibility filtering moved to the worker (GET /api/conversations enforces
// the `accepted intake AND requester-joined-org` invariant in SQL). The
// frontend is now a thin renderer of what the worker returned. The previous
// reconciliation logic — localStorage 404 cache, per-intake conversation
// hydration, shouldShowConversationInPracticeInbox — has been removed.
//
// See: project_conversation_visibility memory.

type UseWorkspaceConversationsInput = {
  practiceId: string;
  workspace: 'public' | 'practice' | 'client';
  isPracticeWorkspace: boolean;
  isClientWorkspace: boolean;
  view: string;
  workspaceSection: string;
  activeSecondaryFilter: string | undefined;
  activeConversationId: string | null;
  sessionUserId: string | null;
  mockConversations?: Conversation[] | null;
};

export function useWorkspaceConversations({
  practiceId,
  workspace,
  isPracticeWorkspace,
  isClientWorkspace,
  view,
  workspaceSection,
  activeSecondaryFilter,
  activeConversationId,
  sessionUserId,
  mockConversations = null,
}: UseWorkspaceConversationsInput) {
  const conversationAssignedToFilter = workspaceSection === 'conversations'
    ? (isPracticeWorkspace
      ? (activeSecondaryFilter ? PRACTICE_CONVERSATIONS_ASSIGNED_TO_MAP[activeSecondaryFilter] : null)
      : (isClientWorkspace && activeSecondaryFilter ? CLIENT_CONVERSATIONS_ASSIGNED_TO_MAP[activeSecondaryFilter] : null))
    : null;
  const shouldListConversations = isPracticeWorkspace ? true : view !== 'conversation';

  const {
    conversations,
    isLoading: isConversationsLoading,
    error: conversationsError,
    refresh: refreshConversations
  } = useConversations({
    practiceId,
    scope: 'practice',
    list: shouldListConversations,
    enabled: shouldListConversations && Boolean(practiceId) && !mockConversations,
    allowAnonymous: workspace === 'public',
    preferOrgScopedPracticeList: false,
    assignedTo: conversationAssignedToFilter,
    limit: 100
  });
  const resolvedConversations = mockConversations ?? conversations;
  const resolvedConversationsLoading = mockConversations ? false : isConversationsLoading;
  const resolvedConversationsError = mockConversations ? null : conversationsError;

  // Home view shows a recent-intakes panel (WorkspacePage uses `allIntakes`).
  // Only fetch when needed — this is unrelated to the visibility filter,
  // which is now entirely the worker's responsibility.
  const {
    items: allIntakes,
    isLoaded: intakesLoaded,
    error: intakesError,
  } = useIntakesData(isPracticeWorkspace ? practiceId : null, {
    enabled: isPracticeWorkspace && view === 'home',
    filter: 'all',
  });

  const isInitialConversationCheckRef = useRef(true);
  const [activeConversationMissingNotification, setActiveConversationMissingNotification] = useState<string | null>(null);
  const conversationFilterId = workspaceSection === 'conversations' && activeSecondaryFilter
    ? activeSecondaryFilter
    : 'all';

  // View filter only — the worker has already applied the visibility predicate.
  const filteredConversations = useMemo(() => {
    if (isPracticeWorkspace) {
      if (conversationFilterId === 'your-inbox' || conversationFilterId === 'assigned-to-me') {
        if (!sessionUserId) return resolvedConversations;
        return resolvedConversations.filter((conversation) => conversation.assigned_to === sessionUserId);
      }
      if (conversationFilterId === 'unassigned') {
        return resolvedConversations.filter((conversation) => !conversation.assigned_to || conversation.assigned_to.trim() === '');
      }
      if (conversationFilterId === 'mentions') {
        return resolvedConversations.filter((conversation) =>
          Array.isArray(conversation.tags) && conversation.tags.some((tag) => tag.toLowerCase().includes('mention'))
        );
      }
      return resolvedConversations;
    }
    if (isClientWorkspace) {
      if (conversationFilterId === 'your-inbox') {
        return resolvedConversations.filter((conversation) => Number(conversation.unread_count ?? 0) > 0);
      }
      return resolvedConversations;
    }
    return resolvedConversations;
  }, [
    conversationFilterId,
    resolvedConversations,
    isClientWorkspace,
    isPracticeWorkspace,
    sessionUserId,
  ]);

  const selectedConversation = useMemo(
    () => resolvedConversations.find((conversation) => conversation.id === activeConversationId) ?? null,
    [activeConversationId, resolvedConversations]
  );

  return {
    conversationAssignedToFilter,
    shouldListConversations,
    conversations,
    isConversationsLoading,
    conversationsError,
    refreshConversations,
    resolvedConversations,
    resolvedConversationsLoading,
    resolvedConversationsError,
    isInitialConversationCheckRef,
    activeConversationMissingNotification,
    setActiveConversationMissingNotification,
    conversationFilterId,
    allIntakes,
    intakesLoaded,
    intakesError,
    filteredConversations,
    selectedConversation,
  };
}
