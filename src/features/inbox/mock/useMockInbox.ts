import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { generateMockConversations, createMockConversation } from './mockData';
import { scenarios } from './scenarios';
import type {
  DebugEvent,
  MockConversation,
  MockInboxState,
  MockInboxStats,
  UseMockInboxResult
} from './types';
import type { InboxFilters } from '@/shared/hooks/useInbox';

const MOCK_PRACTICE_ID = 'mock-practice-inbox';
const CURRENT_USER_ID = 'mock-user-1';

function randomId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 10);
  return `${prefix}-${random}`;
}

function calculateStats(conversations: MockConversation[]): MockInboxStats {
  const stats = conversations.reduce(
    (acc, conversation) => {
      acc.total += 1;
      if (conversation.status === 'active') acc.active += 1;
      if (conversation.status === 'archived') acc.archived += 1;
      if (conversation.status === 'closed') acc.closed += 1;
      if (!conversation.assigned_to) acc.unassigned += 1;
      if (conversation.assigned_to === CURRENT_USER_ID) acc.assignedToMe += 1;
      if (conversation.priority === 'high' || conversation.priority === 'urgent') acc.highPriority += 1;
      return acc;
    },
    {
      total: 0,
      active: 0,
      unassigned: 0,
      assignedToMe: 0,
      highPriority: 0,
      archived: 0,
      closed: 0
    } satisfies MockInboxStats
  );

  return stats;
}

function applyFilters(conversations: MockConversation[], filters: InboxFilters): MockConversation[] {
  return conversations.filter((conversation) => {
    if (filters.status && conversation.status !== filters.status) return false;
    if (filters.priority && conversation.priority !== filters.priority) return false;
    if (filters.assignedTo) {
      if (filters.assignedTo === 'me') {
        if (conversation.assigned_to !== CURRENT_USER_ID) return false;
      } else if (filters.assignedTo === 'unassigned') {
        if (conversation.assigned_to) return false;
      } else if (conversation.assigned_to !== filters.assignedTo) {
        return false;
      }
    }
    if (filters.tags && filters.tags.length > 0) {
      return filters.tags.every((tag) => conversation.tags.includes(tag));
    }
    return true;
  });
}

export function useMockInbox(): UseMockInboxResult {
  const initialConversations = useMemo(
    () => generateMockConversations('multiple-active', MOCK_PRACTICE_ID),
    []
  );

  const [state, setState] = useState<MockInboxState>({
    scenario: 'multiple-active',
    practiceId: MOCK_PRACTICE_ID,
    isLoading: false,
    lastRefreshedAt: new Date().toISOString(),
    filters: { status: 'active' }
  });
  const [conversations, setConversations] = useState<MockConversation[]>(() => initialConversations);
  const [stats, setStats] = useState<MockInboxStats>(() => calculateStats(initialConversations));
  const [debugEvents, setDebugEvents] = useState<DebugEvent[]>([]);

  const addDebugEvent = useCallback((type: string, data: Record<string, unknown> = {}) => {
    setDebugEvents((events) => [
      {
        id: randomId('event'),
        type,
        data,
        timestamp: new Date().toISOString()
      },
      ...events
    ]);
  }, []);

  useEffect(() => {
    setStats(calculateStats(conversations));
  }, [conversations]);

  const setScenario = useCallback(
    (scenarioId: string) => {
      const nextConversations = generateMockConversations(scenarioId, state.practiceId);
      setState((prev) => ({
        ...prev,
        scenario: scenarioId,
        lastRefreshedAt: new Date().toISOString(),
        isLoading: false
      }));
      setConversations(nextConversations);
      addDebugEvent('scenario_changed', { scenarioId, count: nextConversations.length });
    },
    [addDebugEvent, state.practiceId]
  );

  const refresh = useCallback(() => {
    setState((prev) => ({ ...prev, isLoading: true }));
    const refreshed = generateMockConversations(state.scenario, state.practiceId);
    setConversations(refreshed);
    setState((prev) => ({
      ...prev,
      isLoading: false,
      lastRefreshedAt: new Date().toISOString()
    }));
    addDebugEvent('refreshed', { scenario: state.scenario, count: refreshed.length });
  }, [addDebugEvent, state.practiceId, state.scenario]);

  const assignConversation = useCallback(
    async (conversationId: string, userId: string | null | 'me') => {
      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                assigned_to: userId === 'me' ? CURRENT_USER_ID : userId,
                updated_at: new Date().toISOString()
              }
            : conversation
        )
      );
      addDebugEvent('assigned', { conversationId, userId });
    },
    [addDebugEvent]
  );

  const updateConversation = useCallback(
    async (conversationId: string, updates: Partial<MockConversation>) => {
      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                ...updates,
                updated_at: new Date().toISOString()
              }
            : conversation
        )
      );
      addDebugEvent('conversation_updated', { conversationId, updates });
    },
    [addDebugEvent]
  );

  const addConversation = useCallback(() => {
    const conversation = createMockConversation({
      index: conversations.length,
      practiceId: state.practiceId,
      status: 'active',
      priority: 'normal',
      assignedTo: null,
      tags: []
    });
    setConversations((prev) => [conversation, ...prev]);
    addDebugEvent('conversation_added', { conversationId: conversation.id });
    return conversation;
  }, [addDebugEvent, conversations.length, state.practiceId]);

  const removeConversation = useCallback(
    (conversationId?: string) => {
      setConversations((prev) => {
        if (prev.length === 0) return prev;
        const idToRemove = conversationId ?? prev[0]?.id;
        const next = prev.filter((conversation) => conversation.id !== idToRemove);
        addDebugEvent('conversation_removed', { conversationId: idToRemove });
        return next;
      });
    },
    [addDebugEvent]
  );

  const clearDebugEvents = useCallback(() => setDebugEvents([]), []);

  const filteredConversations = useMemo(() => applyFilters(conversations, state.filters), [
    conversations,
    state.filters
  ]);

  const setFilters = useCallback((updates: Partial<InboxFilters>) => {
    setState((prev) => ({
      ...prev,
      filters: {
        ...prev.filters,
        ...updates
      }
    }));
    addDebugEvent('filters_updated', updates as Record<string, unknown>);
  }, [addDebugEvent]);

  return {
    state,
    scenarios,
    currentScenario: state.scenario,
    setScenario,
    conversations,
    stats,
    debugEvents,
    addDebugEvent,
    clearDebugEvents,
    refresh,
    assignConversation,
    updateConversation,
    addConversation,
    removeConversation,
    setFilters,
    filteredConversations
  };
}
