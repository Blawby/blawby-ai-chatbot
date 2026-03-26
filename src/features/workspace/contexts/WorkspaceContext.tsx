/**
 * WorkspaceContext - Global workspace state management
 *
 * Provides centralized state management for workspace-related data
 * across the application using React Context pattern.
 */

import { createContext, useContext, FunctionComponent, useState, useMemo } from 'preact/compat';
import type { Practice } from '@/shared/hooks/usePracticeManagement';
import type { PracticeDetails } from '@/shared/lib/apiClient';
import type { Conversation } from '@/shared/types/conversation';

export interface WorkspaceContextState {
  // Current workspace context
  currentPractice: Practice | null;
  practiceDetails: PracticeDetails | null;
  currentConversationId: string | null;
  
  // Data collections
  conversations: Conversation[];
  
  // UI state
  currentView: 'home' | 'list' | 'conversation' | 'matters' | 'clients';
  sidebarOpen: boolean;
  
  // Loading states
  isLoading: boolean;
  isRefreshing: boolean;
  
  // Error states
  error: string | null;
  
  // Derived state
  hasActivePractice: boolean;
  hasConversations: boolean;
  hasPracticeDetails: boolean;
}

export interface WorkspaceContextActions {
  // Practice actions
  setCurrentPractice: (practice: Practice) => void;
  setPracticeDetails: (details: PracticeDetails) => void;
  
  // Conversation actions
  setCurrentConversation: (conversationId: string | null) => void;
  setConversations: (conversations: Conversation[]) => void;
  addConversation: (conversation: Conversation) => void;
  updateConversation: (id: string, updates: Partial<Conversation>) => void;
  removeConversation: (id: string) => void;
  
  // UI actions
  setCurrentView: (view: WorkspaceContextState['currentView']) => void;
  setSidebarOpen: (open: boolean) => void;
  
  // State actions
  setLoading: (loading: boolean) => void;
  setRefreshing: (refreshing: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
}

export interface WorkspaceContextValue extends WorkspaceContextState, WorkspaceContextActions {}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

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
  // Core state
  const [currentPractice, setCurrentPractice] = useState<Practice | null>(initialPractice);
  const [practiceDetails, setPracticeDetails] = useState<PracticeDetails | null>(initialDetails);
  const [currentConversationId, setCurrentConversation] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  
  // UI state
  const [currentView, setCurrentView] = useState<WorkspaceContextState['currentView']>('home');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  // Loading states
  const [isLoading, setLoading] = useState(false);
  const [isRefreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Derived state
  const derivedState = useMemo(() => ({
    hasActivePractice: Boolean(currentPractice),
    hasConversations: conversations.length > 0,
    hasPracticeDetails: Boolean(practiceDetails),
  }), [currentPractice, conversations, practiceDetails]);

  // Actions
  const actions = useMemo(() => ({
    addConversation: (conversation) => {
      setConversations(prev => [...prev, conversation]);
    },
    
    updateConversation: (id, updates) => {
      setConversations(prev => 
        prev.map(conv => 
          conv.id === id ? { ...conv, ...updates } : conv
        )
      );
    },
    
    removeConversation: (id) => {
      setConversations(prev => prev.filter(conv => conv.id !== id));
    },
    
    clearError: () => setError(null),
  }), []);

  // Context value
  const contextValue: WorkspaceContextValue = useMemo(() => ({
    // State
    currentPractice,
    practiceDetails,
    currentConversationId,
    conversations,
    currentView,
    sidebarOpen,
    isLoading,
    isRefreshing,
    error,
    
    // Derived state
    ...derivedState,
    
    // Actions
    setCurrentPractice,
    setPracticeDetails,
    setCurrentConversation,
    setConversations,
    setCurrentView,
    setSidebarOpen,
    setLoading,
    setRefreshing,
    setError,
    
    // Additional actions
    ...actions,
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
    derivedState,
    actions,
  ]);

  return (
    <WorkspaceContext.Provider value={contextValue}>
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspaceContext = (): WorkspaceContextValue => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspaceContext must be used within a WorkspaceProvider');
  }
  return context;
};

export const useWorkspaceState = (): WorkspaceContextState => {
  const context = useWorkspaceContext();
  return {
    currentPractice: context.currentPractice,
    practiceDetails: context.practiceDetails,
    currentConversationId: context.currentConversationId,
    conversations: context.conversations,
    currentView: context.currentView,
    sidebarOpen: context.sidebarOpen,
    isLoading: context.isLoading,
    isRefreshing: context.isRefreshing,
    error: context.error,
    hasActivePractice: context.hasActivePractice,
    hasConversations: context.hasConversations,
    hasPracticeDetails: context.hasPracticeDetails,
  };
};

export const useWorkspaceActions = (): WorkspaceContextActions => {
  const context = useWorkspaceContext();
  return {
    setCurrentPractice: context.setCurrentPractice,
    setPracticeDetails: context.setPracticeDetails,
    setCurrentConversation: context.setCurrentConversation,
    setConversations: context.setConversations,
    setCurrentView: context.setCurrentView,
    setSidebarOpen: context.setSidebarOpen,
    setLoading: context.setLoading,
    setRefreshing: context.setRefreshing,
    setError: context.setError,
    clearError: context.clearError,
    addConversation: context.addConversation,
    updateConversation: context.updateConversation,
    removeConversation: context.removeConversation,
  };
};
