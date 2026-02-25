/**
 * useWorkspaceState - Simplified workspace state management
 *
 * Provides a clean interface for workspace state by wrapping existing hooks
 * and providing a consistent API for components.
 */

import { useState, useMemo } from 'preact/hooks';
import { useConversations } from '@/shared/hooks/useConversations';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { usePracticeDetails } from '@/shared/hooks/usePracticeDetails';
import type { Conversation } from '@/shared/types/conversation';
import type { Practice } from '@/shared/hooks/usePracticeManagement';
import type { PracticeDetails } from '@/shared/lib/apiClient';

export interface WorkspaceState {
  // Practice data
  currentPractice: Practice | null;
  practiceDetails: PracticeDetails | null;
  
  // Conversation data
  conversations: Conversation[];
  
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

export interface WorkspaceActions {
  // Data actions
  refreshConversations: () => Promise<void>;
  refreshPracticeDetails: () => Promise<void>;
  
  // State actions
  setError: (error: string) => void;
  clearError: () => void;
  setLoading: (loading: boolean) => void;
}

export interface UseWorkspaceStateOptions {
  practiceId: string;
  workspaceType: 'practice' | 'client' | 'public';
  autoLoadConversations?: boolean;
}

export const useWorkspaceState = ({
  practiceId,
  workspaceType,
  autoLoadConversations = true,
}: UseWorkspaceStateOptions): WorkspaceState & WorkspaceActions => {
  // Practice management
  const practiceManagement = usePracticeManagement({
    autoFetchPractices: true,
    fetchInvitations: false,
    fetchPracticeDetails: false, // We'll handle this separately
  });

  // Practice details
  const practiceDetails = usePracticeDetails(practiceId);

  // Conversations
  const conversations = useConversations({
    practiceId,
    scope: 'practice',
    list: autoLoadConversations,
    enabled: autoLoadConversations && Boolean(practiceId),
    allowAnonymous: workspaceType === 'public',
  });

  // Local state
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Derived state
  const state: WorkspaceState = useMemo(() => ({
    currentPractice: practiceManagement.currentPractice,
    practiceDetails: practiceDetails.details,
    
    conversations: conversations.conversations || [],
    
    isLoading: isLoading || practiceManagement.loading || (practiceDetails.hasDetails ? false : true),
    isRefreshing,
    
    error: error || practiceManagement.error || conversations.error || null,
    
    hasActivePractice: Boolean(practiceManagement.currentPractice),
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
  const actions: WorkspaceActions = useMemo(() => ({
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

    refreshPracticeDetails: async () => {
      try {
        await practiceDetails.fetchDetails();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to refresh practice details');
      }
    },

    clearError: () => setError(null),
    setError,
    setLoading: setIsLoading,
  }), [
    conversations,
    practiceDetails,
    setError,
    setIsLoading,
    setIsRefreshing,
  ]);

  return {
    ...state,
    ...actions,
  };
};
