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

// Intake records can reference conversation_ids that no longer exist (orphaned
// after a conversation was deleted). The list endpoint can't help us — those
// rows aren't in it. Cache 404s in localStorage (scoped per-practice) so we
// don't re-fetch known-dead ids on every list refresh / page reload and
// pollute the worker error log + browser network tab. Random UUIDs mean a new
// conversation will never reuse a known-missing id, so caching is safe.
const KNOWN_MISSING_KEY_PREFIX = 'workspace:knownMissingConversations:';
const KNOWN_MISSING_LIMIT = 500;

const loadKnownMissing = (practiceId: string): Set<string> => {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(KNOWN_MISSING_KEY_PREFIX + practiceId);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === 'string' && id.length > 0));
  } catch {
    return new Set();
  }
};

const saveKnownMissing = (practiceId: string, ids: Set<string>): void => {
  if (typeof window === 'undefined') return;
  try {
    // Cap the cache so a long-lived browser doesn't hoard MB of dead UUIDs;
    // truncation drops the oldest entries (insertion order on Set).
    const arr = Array.from(ids);
    const trimmed = arr.length > KNOWN_MISSING_LIMIT ? arr.slice(arr.length - KNOWN_MISSING_LIMIT) : arr;
    window.localStorage.setItem(KNOWN_MISSING_KEY_PREFIX + practiceId, JSON.stringify(trimmed));
  } catch {
    // localStorage may be disabled (private mode, quota exceeded). Cache
    // becomes session-scoped via the in-memory ref below — best effort.
  }
};

// `getConversation` re-wraps HttpError into a plain Error before reaching the
// caller, so we have to sniff the message. 404s from the worker carry "not
// found" in the body or fall through to the generic "HTTP 404" fallback.
const isMissingConversationError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  return error.message.includes('Conversation not found') || /HTTP 404/i.test(error.message);
};

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
  // Per-practice cache of conversation_ids we've seen 404 on. Loaded from
  // localStorage on first render so cold reloads don't re-fetch and re-log
  // the same orphaned ids. The ref is the live mutable view; saves push to
  // localStorage on every addition.
  const knownMissingRef = useRef<Set<string>>(loadKnownMissing(practiceId));
  // Re-hydrate when practiceId changes (rare, but the cache is per-practice).
  useEffect(() => {
    knownMissingRef.current = loadKnownMissing(practiceId);
  }, [practiceId]);

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
    const missingConversationIds = acceptedIntakeConversationIds.filter(
      (conversationId) =>
        !knownConversationIds.has(conversationId)
        && !knownMissingRef.current.has(conversationId),
    );
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
          chunk.map(async (conversationId) => {
            try {
              return await getConversation(conversationId, practiceId, { signal: controller.signal });
            } catch (error) {
              // Mark as known-missing on 404 only so subsequent list refreshes
              // skip the lookup and don't 404-storm the worker error log.
              // Conversations sometimes get deleted while the originating intake
              // row sticks around. Network/server/abort errors must not poison
              // the cache — those ids could come back on a later attempt.
              if (!controller.signal.aborted && isMissingConversationError(error)) {
                knownMissingRef.current.add(conversationId);
                saveKnownMissing(practiceId, knownMissingRef.current);
              }
              return null;
            }
          })
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
