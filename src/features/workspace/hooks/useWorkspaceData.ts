/**
 * useWorkspaceData - Centralized data management for workspace
 *
 * Consolidates data fetching, caching, and synchronization logic
 * for better separation of concerns and data flow.
 */

import { useState, useMemo } from 'preact/hooks';
import { useConversations } from '@/shared/hooks/useConversations';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { usePracticeDetails } from '@/shared/hooks/usePracticeDetails';
import type { Conversation } from '@/shared/types/conversation';
import type { Practice } from '@/shared/hooks/usePracticeManagement';
import type { PracticeDetails } from '@/shared/lib/apiClient';

export interface WorkspaceDataState {
  // Practice data
  practices: Practice[];
  currentPractice: Practice | null;
  practiceDetails: PracticeDetails | null;
  
  // Conversation data
  conversations: Conversation[];
  isLoadingConversations: boolean;
  conversationsError: string | null;
  
  // Loading states
  isLoading: boolean;
  isRefreshing: boolean;
  
  // Error states
  error: string | null;
  
  // Derived state
  hasPractices: boolean;
  hasCurrentPractice: boolean;
  hasConversations: boolean;
  hasPracticeDetails: boolean;
}

export interface WorkspaceDataActions {
  // Practice actions
  refreshPractices: () => Promise<void>;
  setCurrentPractice: (practice: Practice) => void;
  updatePracticeDetails: (details: Partial<PracticeDetails>) => Promise<void>;
  
  // Conversation actions
  refreshConversations: () => Promise<void>;
  addConversation: (conversation: Conversation) => void;
  updateConversation: (conversationId: string, updates: Partial<Conversation>) => void;
  removeConversation: (conversationId: string) => void;
  
  // Data actions
  refreshAll: () => Promise<void>;
  clearError: () => void;
  setError: (error: string) => void;
  setLoading: (loading: boolean) => void;
}

export interface UseWorkspaceDataOptions {
  practiceId: string;
  workspaceType: 'practice' | 'client' | 'public';
  autoLoadConversations?: boolean;
  autoLoadPracticeDetails?: boolean;
  conversationScope?: 'practice' | 'user' | 'public';
}

export const useWorkspaceData = ({
  practiceId,
  workspaceType,
  autoLoadConversations = true,
  autoLoadPracticeDetails = true,
  conversationScope = 'practice',
}: UseWorkspaceDataOptions): WorkspaceDataState & WorkspaceDataActions => {
  // Practice management
  const practiceManagement = usePracticeManagement({
    autoFetchPractices: true,
    fetchInvitations: false,
    fetchPracticeDetails: autoLoadPracticeDetails,
  });

  // Practice details
  const practiceDetails = usePracticeDetails(practiceId);

  // Conversations
  const conversations = useConversations({
    practiceId,
    scope: conversationScope === 'user' ? 'all' : conversationScope === 'public' ? 'practice' : conversationScope,
    list: autoLoadConversations,
    enabled: autoLoadConversations && Boolean(practiceId),
    allowAnonymous: workspaceType === 'public',
  });

  // Local state
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Derived state
  const state: WorkspaceDataState = useMemo(() => ({
    practices: practiceManagement.practices || [],
    currentPractice: practiceManagement.currentPractice,
    practiceDetails: practiceDetails.details,
    
    conversations: conversations.conversations || [],
    isLoadingConversations: conversations.isLoading,
    conversationsError: conversations.error || null,
    
    isLoading: isLoading || practiceManagement.loading,
    isRefreshing,
    
    error: error || practiceManagement.error || conversations.error || null,
    
    hasPractices: (practiceManagement.practices || []).length > 0,
    hasCurrentPractice: Boolean(practiceManagement.currentPractice),
    hasConversations: (conversations.conversations || []).length > 0,
    hasPracticeDetails: practiceDetails.hasDetails,
  }), [
    practiceManagement,
    practiceDetails,
    conversations,
    isLoading,
    isRefreshing,
    error,
  ]);

  // Actions
  const actions: WorkspaceDataActions = useMemo(() => ({
    refreshPractices: async () => {
      setIsLoading(true);
      try {
        await practiceManagement.refetch();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to refresh practices');
      } finally {
        setIsLoading(false);
      }
    },

    setCurrentPractice: () => {
      // Note: setCurrentPractice functionality not implemented yet
      // This would need to be added to UsePracticeManagementReturn
    },

    updatePracticeDetails: async (updates) => {
      try {
        await practiceDetails.updateDetails(updates);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update practice details');
      }
    },

    refreshConversations: async () => {
      setIsRefreshing(true);
      try {
        await conversations.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to refresh conversations');
      } finally {
        setIsRefreshing(false);
      }
    },

    addConversation: (conversation) => {
      // This would be handled by the conversations hook
      console.log('Adding conversation:', conversation);
    },

    updateConversation: (conversationId, updates) => {
      // This would be handled by the conversations hook
      console.log('Updating conversation:', conversationId, updates);
    },

    removeConversation: (conversationId) => {
      // This would be handled by the conversations hook
      console.log('Removing conversation:', conversationId);
    },

    refreshAll: async () => {
      setIsLoading(true);
      try {
        await Promise.all([
          practiceManagement.refetch(),
          practiceDetails.fetchDetails(),
          conversations.refresh?.(),
        ]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to refresh data');
      } finally {
        setIsLoading(false);
      }
    },

    clearError: () => setError(null),
    setError,
    setLoading: setIsLoading,
  }), [
    practiceManagement,
    practiceDetails,
    conversations,
    setError,
    setIsLoading,
    setIsRefreshing,
  ]);

  return {
    ...state,
    ...actions,
  };
};
