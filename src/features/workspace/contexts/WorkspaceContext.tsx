import { createContext, useContext, FunctionComponent, useState, useMemo } from 'preact/compat';
import type { Practice } from '@/shared/hooks/usePracticeManagement';
import type { PracticeDetails } from '@/shared/lib/apiClient';
import type { Conversation } from '@/shared/types/conversation';

export interface WorkspaceContextState {
  currentPractice: Practice | null;
  practiceDetails: PracticeDetails | null;
  currentConversationId: string | null;
  conversations: Conversation[];
  currentView: 'home' | 'list' | 'conversation' | 'matters' | 'clients';
  sidebarOpen: boolean;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  hasActivePractice: boolean;
  hasConversations: boolean;
  hasPracticeDetails: boolean;
}

export interface WorkspaceContextActions {
  setCurrentPractice: (practice: Practice) => void;
  setPracticeDetails: (details: PracticeDetails) => void;
  setCurrentConversation: (conversationId: string | null) => void;
  setConversations: (conversations: Conversation[]) => void;
  addConversation: (conversation: Conversation) => void;
  updateConversation: (id: string, updates: Partial<Conversation>) => void;
  removeConversation: (id: string) => void;
  setCurrentView: (view: WorkspaceContextState['currentView']) => void;
  setSidebarOpen: (open: boolean) => void;
  setLoading: (loading: boolean) => void;
  setRefreshing: (refreshing: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
}

export interface WorkspaceContextValue extends WorkspaceContextState, WorkspaceContextActions {}

// Two separate contexts: state re-renders data consumers; actions context is stable.
const WorkspaceStateContext = createContext<WorkspaceContextState | null>(null);
const WorkspaceActionsContext = createContext<WorkspaceContextActions | null>(null);

export interface WorkspaceProviderProps {
  children: React.ReactNode;
  initialPractice?: Practice | null;
  initialDetails?: PracticeDetails | null;
}

export const WorkspaceProvider: FunctionComponent<WorkspaceProviderProps> = ({
  children,
  initialPractice = null,
  initialDetails = null,
}) => {
  const [currentPractice, setCurrentPractice] = useState<Practice | null>(initialPractice);
  const [practiceDetails, setPracticeDetails] = useState<PracticeDetails | null>(initialDetails);
  const [currentConversationId, setCurrentConversation] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentView, setCurrentView] = useState<WorkspaceContextState['currentView']>('home');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isLoading, setLoading] = useState(false);
  const [isRefreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Actions are stable — setState calls never change identity.
  const actions = useMemo<WorkspaceContextActions>(() => ({
    setCurrentPractice,
    setPracticeDetails,
    setCurrentConversation,
    setConversations,
    setCurrentView,
    setSidebarOpen,
    setLoading,
    setRefreshing,
    setError,
    addConversation: (conversation) => setConversations((prev) => [...prev, conversation]),
    updateConversation: (id, updates) =>
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c))),
    removeConversation: (id) => setConversations((prev) => prev.filter((c) => c.id !== id)),
    clearError: () => setError(null),
  }), []);

  const state = useMemo<WorkspaceContextState>(() => ({
    currentPractice,
    practiceDetails,
    currentConversationId,
    conversations,
    currentView,
    sidebarOpen,
    isLoading,
    isRefreshing,
    error,
    hasActivePractice: Boolean(currentPractice),
    hasConversations: conversations.length > 0,
    hasPracticeDetails: Boolean(practiceDetails),
  }), [
    currentPractice,
    practiceDetails,
    currentConversationId,
    conversations,
    currentView,
    sidebarOpen,
    isLoading,
    isRefreshing,
    error,
  ]);

  return (
    <WorkspaceStateContext.Provider value={state}>
      <WorkspaceActionsContext.Provider value={actions}>
        {children}
      </WorkspaceActionsContext.Provider>
    </WorkspaceStateContext.Provider>
  );
};

export const useWorkspaceState = (): WorkspaceContextState => {
  const ctx = useContext(WorkspaceStateContext);
  if (!ctx) throw new Error('useWorkspaceState must be used within a WorkspaceProvider');
  return ctx;
};

export const useWorkspaceActions = (): WorkspaceContextActions => {
  const ctx = useContext(WorkspaceActionsContext);
  if (!ctx) throw new Error('useWorkspaceActions must be used within a WorkspaceProvider');
  return ctx;
};

// Combined accessor for code that needs both — prefer the split hooks above.
export const useWorkspaceContext = (): WorkspaceContextValue => {
  const state = useWorkspaceState();
  const actions = useWorkspaceActions();
  return useMemo(() => ({ ...state, ...actions }), [state, actions]);
};
