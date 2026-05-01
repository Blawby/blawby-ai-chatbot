import { useMemo, useRef, useState, useEffect } from 'preact/hooks';
import { useConversations } from '@/shared/hooks/useConversations';
import { useIntakesData } from '@/features/intake/hooks/useIntakesData';
import { getConversation } from '@/shared/lib/conversationApi';
import { shouldShowConversationInPracticeInbox } from '@/shared/utils/conversationDisplay';
import {
  CLIENT_CONVERSATIONS_ASSIGNED_TO_MAP,
  PRACTICE_CONVERSATIONS_ASSIGNED_TO_MAP,
} from '@/shared/config/navConfig';
import type { Conversation } from '@/shared/types/conversation';

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
  const [acceptedIntakeConversations, setAcceptedIntakeConversations] = useState<Conversation[]>([]);
  const acceptedIntakeConversationsRef = useRef<Conversation[]>(acceptedIntakeConversations);
  useEffect(() => {
    acceptedIntakeConversationsRef.current = acceptedIntakeConversations;
  }, [acceptedIntakeConversations]);
  const isInitialConversationCheckRef = useRef(true);
  const [activeConversationMissingNotification, setActiveConversationMissingNotification] = useState<string | null>(null);
  const conversationFilterId = workspaceSection === 'conversations' && activeSecondaryFilter
    ? activeSecondaryFilter
    : 'all';
  const {
    items: allIntakes,
    isLoaded: intakesLoaded,
    error: intakesError,
  } = useIntakesData(isPracticeWorkspace ? practiceId : null, {
    enabled: isPracticeWorkspace && (view === 'home' || workspaceSection === 'conversations'),
    filter: workspaceSection === 'conversations' ? 'accepted' : 'all',
    // Reduced from 500 to 100 to prevent loading hangs in large practices.
    // 100 is sufficient for the immediate triage status lookup in the practice inbox.
    limit: workspaceSection === 'conversations' ? 100 : undefined,
  });
  const intakeTriageStatusLookup = useMemo(() => {
    const byConversationId = new Map<string, string>();
    for (const intake of allIntakes) {
      const conversationId = typeof intake.conversation_id === 'string' ? intake.conversation_id.trim() : '';
      const triageStatus = typeof intake.triage_status === 'string' ? intake.triage_status.trim() : '';

      if (conversationId && triageStatus) {
        byConversationId.set(conversationId, triageStatus);
      }
    }
    return { byConversationId };
  }, [allIntakes]);
  const acceptedIntakeConversationIds = useMemo(
    () => Array.from(intakeTriageStatusLookup.byConversationId.entries())
      .filter(([, status]) => status === 'accepted')
      .map(([id]) => id),
    [intakeTriageStatusLookup]
  );
  const [acceptedIntakeConversationsLoading, setAcceptedIntakeConversationsLoading] = useState(false);
  const intakeLookupLoaded = intakesLoaded && !intakesError;

  useEffect(() => {
    if (!isPracticeWorkspace || workspaceSection !== 'conversations' || !practiceId || !intakeLookupLoaded) {
      setAcceptedIntakeConversations([]);
      setAcceptedIntakeConversationsLoading(false);
      return;
    }

    const knownConversationIds = new Set([
      ...resolvedConversations.map((conversation) => conversation.id),
      ...acceptedIntakeConversationsRef.current.map((conversation) => conversation.id),
    ]);
    const missingConversationIds = acceptedIntakeConversationIds.filter((conversationId) => !knownConversationIds.has(conversationId));
    if (missingConversationIds.length === 0) {
      setAcceptedIntakeConversations((prev) => {
        const filtered = prev.filter((conversation) => acceptedIntakeConversationIds.includes(conversation.id));
        if (
          filtered.length === prev.length
          && filtered.every((conversation, index) => conversation.id === prev[index]?.id)
        ) {
          return prev;
        }
        return filtered;
      });
      setAcceptedIntakeConversationsLoading(false);
      return;
    }

    const controller = new AbortController();
    setAcceptedIntakeConversationsLoading(true);
    void (async () => {
      const loadedConversations: (Conversation | null)[] = [];
      const chunkSize = 8;
      for (let i = 0; i < missingConversationIds.length; i += chunkSize) {
        if (controller.signal.aborted) break;
        const chunk = missingConversationIds.slice(i, i + chunkSize);
        const results = await Promise.all(
          chunk.map((conversationId) =>
            getConversation(conversationId, practiceId, { signal: controller.signal }).catch(() => null)
          )
        );
        loadedConversations.push(...results);
      }

      if (controller.signal.aborted) return;
      setAcceptedIntakeConversations((prev) => {
        const merged = new Map<string, Conversation>();
        for (const conversation of prev) {
          if (acceptedIntakeConversationIds.includes(conversation.id)) {
            merged.set(conversation.id, conversation);
          }
        }
        for (const conversation of loadedConversations) {
          if (conversation && acceptedIntakeConversationIds.includes(conversation.id)) {
            merged.set(conversation.id, conversation);
          }
        }
        return Array.from(merged.values());
      });
      setAcceptedIntakeConversationsLoading(false);
    })();

    return () => controller.abort();
  }, [
    acceptedIntakeConversationIds,
    intakeLookupLoaded,
    isPracticeWorkspace,
    practiceId,
    resolvedConversations,
    workspaceSection,
  ]);

  const conversationsForInbox = useMemo(() => {
    const merged = new Map<string, Conversation>();
    for (const conversation of resolvedConversations) {
      merged.set(conversation.id, conversation);
    }
    for (const conversation of acceptedIntakeConversations) {
      merged.set(conversation.id, conversation);
    }
    return Array.from(merged.values());
  }, [acceptedIntakeConversations, resolvedConversations]);

  const filteredConversations = useMemo(() => {
    const activeConversations = conversationsForInbox
      .filter((conversation) => conversation.status === 'active' || intakeTriageStatusLookup.byConversationId.has(conversation.id))
      .filter((conversation) => {
        if (!isPracticeWorkspace) return true;
        const triageStatus = intakeTriageStatusLookup.byConversationId.get(conversation.id) ?? null;
        return shouldShowConversationInPracticeInbox(conversation, triageStatus, {
          intakeLookupLoaded,
          requireAcceptedIntakeRecord: true,
        });
      });
    if (isPracticeWorkspace) {
      if (conversationFilterId === 'your-inbox') {
        if (!sessionUserId) return activeConversations;
        return activeConversations.filter((conversation) => conversation.assigned_to === sessionUserId);
      }
      if (conversationFilterId === 'assigned-to-me') {
        if (!sessionUserId) return activeConversations;
        return activeConversations.filter((conversation) => conversation.assigned_to === sessionUserId);
      }
      if (conversationFilterId === 'unassigned') {
        return activeConversations.filter((conversation) => !conversation.assigned_to || conversation.assigned_to.trim() === '');
      }
      if (conversationFilterId === 'mentions') {
        return activeConversations.filter((conversation) =>
          Array.isArray(conversation.tags) && conversation.tags.some((tag) => tag.toLowerCase().includes('mention'))
        );
      }
      return activeConversations;
    }
    if (isClientWorkspace) {
      if (conversationFilterId === 'your-inbox') {
        return activeConversations.filter((conversation) => Number(conversation.unread_count ?? 0) > 0);
      }
      return activeConversations;
    }
    return activeConversations;
  }, [
    conversationFilterId,
    intakeLookupLoaded,
    intakeTriageStatusLookup,
    conversationsForInbox,
    isClientWorkspace,
    isPracticeWorkspace,
    sessionUserId,
  ]);
  // Use the merged inbox (resolved + accepted intake conversations) when
  // resolving the currently selected conversation so inspector actions
  // operate on accepted-intake conversations as well.
  const selectedConversation = useMemo(
    () => conversationsForInbox.find((conversation) => conversation.id === activeConversationId) ?? null,
    [activeConversationId, conversationsForInbox]
  );

  // When accepted intake records can hide conversations, surface a combined
  // loading/error state that includes intake lookup readiness so the list
  // view renders appropriate placeholders/diagnostics.
  const requireAcceptedIntakeRecord = true;
  const combinedResolvedConversationsLoading = resolvedConversationsLoading || (requireAcceptedIntakeRecord && !intakeLookupLoaded);
  const combinedResolvedConversationsError = resolvedConversationsError || (requireAcceptedIntakeRecord && intakesError);

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
    acceptedIntakeConversations,
    acceptedIntakeConversationsRef,
    isInitialConversationCheckRef,
    activeConversationMissingNotification,
    setActiveConversationMissingNotification,
    conversationFilterId,
    allIntakes,
    intakesLoaded,
    intakesError,
    intakeTriageStatusLookup,
    acceptedIntakeConversationIds,
    acceptedIntakeConversationsLoading,
    intakeLookupLoaded,
    conversationsForInbox,
    filteredConversations,
    selectedConversation,
    combinedResolvedConversationsLoading,
    combinedResolvedConversationsError,
  };
}
