/**
 * useWorkspaceState - Centralized state management for workspace
 *
 * Consolidates workspace state management from scattered hooks into a single source of truth.
 * Provides clean separation of concerns and better data flow patterns.
 */

import { useState, useMemo } from 'preact/hooks';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { usePracticeDetails } from '@/shared/hooks/usePracticeDetails';
import type { Practice } from '@/shared/hooks/usePracticeManagement';
import type { PracticeDetails } from '@/shared/lib/apiClient';
import type { WorkspaceType } from '@/shared/types/workspace';

export interface WorkspaceState {
  // Current workspace context
  currentPractice: Practice | null;
  currentDetails: PracticeDetails | null;
  
  // Navigation state
  currentView: 'home' | 'list' | 'conversation' | 'matters' | 'clients';
  isPracticeWorkspace: boolean;
  isClientWorkspace: boolean;
  isPublicWorkspace: boolean;
  
  // Loading states
  isLoading: boolean;
  error: string | null;
  
  // Derived state
  hasActivePractice: boolean;
  canManagePractice: boolean;
  canManageClients: boolean;
  canManageMatters: boolean;
}

export interface WorkspaceActions {
  // Navigation actions
  navigateToView: (view: WorkspaceState['currentView']) => void;
  navigateToConversation: (conversationId: string) => void;
  navigateToMatters: () => void;
  navigateToClients: () => void;
  navigateToHome: () => void;
  
  // Data actions
  setCurrentPractice: (practice: Practice) => void;
  setCurrentDetails: (details: PracticeDetails) => void;
  setError: (error: string) => void;
  clearError: () => void;
  setLoading: (loading: boolean) => void;
}

export interface UseWorkspaceStateOptions {
  workspace: WorkspaceType;
  practiceId: string;
}

export const useWorkspaceState = ({
  workspace,
  practiceId,
}: UseWorkspaceStateOptions): WorkspaceState & WorkspaceActions => {
  const { isPending: isSessionPending } = useSessionContext();
  const { 
    currentPractice
  } = usePracticeManagement({
    autoFetchPractices: false,
    fetchInvitations: false,
    fetchPracticeDetails: false
  });
  
  const { 
    details
  } = usePracticeDetails(practiceId);

  // Derived state
  const isPracticeWorkspace = workspace === 'practice';
  const isClientWorkspace = workspace === 'client';
  const isPublicWorkspace = workspace === 'public';
  const hasActivePractice = Boolean(currentPractice && !isSessionPending);

  // State
  const [currentView, setCurrentView] = useState<WorkspaceState['currentView']>('home');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Actions
  const actions: WorkspaceActions = useMemo(() => ({
    navigateToView: (view) => {
      setCurrentView(view);
    },
    
    navigateToConversation: (conversationId) => {
      console.log(`Navigate to conversation: ${conversationId}`);
      // Navigation logic would be handled by router
    },
    
    navigateToMatters: () => {
      setCurrentView('matters');
    },
    
    navigateToClients: () => {
      setCurrentView('clients');
    },
    
    navigateToHome: () => {
      setCurrentView('home');
    },
    
    setCurrentPractice: (practice) => {
      // This would update practice in management hook
      console.log('Setting current practice:', practice);
    },
    
    setCurrentDetails: (details) => {
      // This would update details in details hook
      console.log('Setting practice details:', details);
    },
    
    setError: (errorMessage) => {
      setError(errorMessage);
    },
    
    clearError: () => {
      setError(null);
    },
    
    setLoading: (loading) => {
      setIsLoading(loading);
    },
  }), [currentView, isPracticeWorkspace, isClientWorkspace, isPublicWorkspace, hasActivePractice]);

  const state: WorkspaceState = {
    currentPractice,
    currentDetails: details,
    currentView,
    isPracticeWorkspace,
    isClientWorkspace,
    isPublicWorkspace,
    isLoading,
    error,
    hasActivePractice,
    canManagePractice: isPracticeWorkspace && hasActivePractice,
    canManageClients: isPracticeWorkspace && hasActivePractice,
    canManageMatters: isPracticeWorkspace && hasActivePractice,
  };

  return {
    ...state,
    ...actions,
  };
};
