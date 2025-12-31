import type { InboxFilters } from '@/shared/hooks/useInbox';

import type { Conversation, ConversationStatus } from '@/shared/types/conversation';

export interface MockConversation extends Conversation {
  user_id: string | null;
  user_info: Conversation['user_info'];
  status: ConversationStatus;
  assigned_to?: string | null;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  tags?: string[];
  internal_notes?: string | null;
  last_message_at?: string | null;
  first_response_at?: string | null;
  closed_at?: string | null;
}

export interface MockInboxStats {
  total: number;
  active: number;
  unassigned: number;
  assignedToMe: number;
  highPriority: number;
  archived: number;
  closed: number;
}

export interface InboxScenario {
  id: string;
  name: string;
  description: string;
  conversationCount: number;
  statuses: ('active' | 'archived' | 'closed')[];
  priorities: ('low' | 'normal' | 'high' | 'urgent')[];
  hasAssigned: boolean;
  hasTags: boolean;
}

export interface DebugEvent {
  id: string;
  type: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

export interface MockInboxState {
  scenario: string;
  practiceId: string;
  isLoading: boolean;
  lastRefreshedAt: string | null;
  filters: InboxFilters;
}

export interface UseMockInboxResult {
  state: MockInboxState;
  scenarios: InboxScenario[];
  currentScenario: string;
  setScenario: (scenarioId: string) => void;
  conversations: MockConversation[];
  stats: MockInboxStats;
  debugEvents: DebugEvent[];
  addDebugEvent: (type: string, data?: Record<string, unknown>) => void;
  clearDebugEvents: () => void;
  refresh: () => void;
  filteredConversations: MockConversation[];
  assignConversation: (conversationId: string, userId: string | null | 'me') => Promise<void>;
  updateConversation: (conversationId: string, updates: Partial<MockConversation>) => Promise<void>;
  addConversation: () => MockConversation;
  /**
   * Remove a conversation from the mock inbox. Defaults to removing the first conversation when no ID is provided.
   */
  removeConversation: (conversationId?: string) => void;
  setFilters: (updates: Partial<InboxFilters>) => void;
}
