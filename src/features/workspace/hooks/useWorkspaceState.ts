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
  onNavigateToConversation?: (conversationId: string) => void;
  onSetCurrentPractice?: (practice: Practice) => void;
}

export const useWorkspaceState = ({
  workspace,
  practiceId,
  onNavigateToConversation,
  onSetCurrentPractice,
}: UseWorkspaceStateOptions): WorkspaceState & WorkspaceActions => {
  const { isPending: isSessionPending } = useSessionContext();
  const { 
    currentPractice
  } = usePracticeManagement({
    autoFetchPractices: false,
    fetchPracticeDetails: false
  });
  
  const practiceDetails = usePracticeDetails(practiceId);
  const { details } = practiceDetails;

  // Derived state
  const isPracticeWorkspace = workspace === 'practice';
  const isClientWorkspace = workspace === 'client';
  const isPublicWorkspace = workspace === 'public';
  const hasActivePractice = Boolean(currentPractice && !isSessionPending);

  // State
  const [currentView, setCurrentView] = useState<WorkspaceState['currentView']>('home');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { setDetails } = practiceDetails;
  
  // Actions
  const actions: WorkspaceActions = useMemo(() => ({
    navigateToView: (view) => {
      setCurrentView(view);
    },
    
    navigateToConversation: (conversationId) => {
      if (onNavigateToConversation) {
        onNavigateToConversation(conversationId);
      } else {
        console.warn('navigateToConversation called but no callback provided');
      }
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
    
    setCurrentPractice: (practice: Practice) => {
      if (onSetCurrentPractice) {
        onSetCurrentPractice(practice);
      } else {
        console.warn('setCurrentPractice called but no callback provided');
      }
    },
    
    setCurrentDetails: (newDetails: PracticeDetails) => {
      // Use the setDetails action from usePracticeDetails hook if available
      if (typeof setDetails === 'function') {
        setDetails(newDetails);
      } else {
        console.warn('setCurrentDetails called but setDetails is not available');
      }
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
  }), [setDetails, onNavigateToConversation, onSetCurrentPractice]);

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
