import type { InboxFilters } from '@/shared/hooks/useInbox';

export interface MockConversation {
  id: string;
  practice_id: string;
  user_id: string;
  matter_id: string | null;
  participants: string[];
  user_info: {
    name: string;
    email: string;
    phone?: string;
  };
  status: 'active' | 'archived' | 'closed';
  assigned_to: string | null;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  tags: string[];
  internal_notes: string | null;
  last_message_at: string;
  first_response_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
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
  removeConversation: (conversationId?: string) => void;
  setFilters: (updates: Partial<InboxFilters>) => void;
}
