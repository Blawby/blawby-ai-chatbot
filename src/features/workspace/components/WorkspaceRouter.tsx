/**
 * WorkspaceRouter - Clean routing logic for workspace navigation
 *
 * Extracts routing logic from WorkspacePage to provide cleaner separation
 * between navigation concerns and view rendering.
 */

import { FunctionComponent } from 'preact';
import { useMemo, useCallback } from 'preact/hooks';
import { useNavigation } from '@/shared/utils/navigation';
import type { WorkspaceType } from '@/shared/types/workspace';

export interface WorkspaceRouterProps {
  workspace: WorkspaceType;
  practiceId: string;
  practiceSlug: string | null;
  clientPracticeSlug: string | null;
  routeConversationId?: string;
  isWidget?: boolean;
  view: 'home' | 'list' | 'conversation' | 'matters' | 'clients';
  onNavigate?: (view: string) => void;
}

export interface WorkspaceRoutingState {
  currentView: string;
  canNavigateToList: boolean;
  canNavigateToConversation: boolean;
  canNavigateToMatters: boolean;
  canNavigateToClients: boolean;
  navigationPaths: {
    conversationsBase: string;
    conversationBack: string;
    practiceMatters: string;
    publicConversationsBase: string;
  };
}

export interface WorkspaceRoutingActions {
  navigateToList: () => void;
  navigateToConversation: (conversationId: string) => void;
  navigateToMatters: () => void;
  navigateToClients: () => void;
  navigateToHome: () => void;
  navigateToPractice: () => void;
}

export interface UseWorkspaceRouterReturn {
  navigationState: WorkspaceRoutingState;
  navigationActions: WorkspaceRoutingActions;
}

export const useWorkspaceRouter = ({
  workspace,
  practiceId,
  practiceSlug,
  clientPracticeSlug,
  routeConversationId,
  isWidget = false,
  view,
  onNavigate,
}: WorkspaceRouterProps): UseWorkspaceRouterReturn => {
  const { navigate } = useNavigation();

  // Navigation path generation
  const navigationPaths = useMemo(() => {
    const isPracticeWorkspace = workspace === 'practice';
    const isClientWorkspace = workspace === 'client';
    const isPublicWorkspace = workspace === 'public';

    const basePaths = {
      practice: practiceSlug ? `/practice/${encodeURIComponent(practiceSlug)}` : '/',
      client: clientPracticeSlug ? `/client/${encodeURIComponent(clientPracticeSlug)}` : '/',
      public: practiceSlug ? `/public/${encodeURIComponent(practiceSlug)}` : null,
    };

    return {
      conversationsBase: isPracticeWorkspace 
        ? basePaths.practice 
        : isClientWorkspace 
          ? basePaths.client 
          : basePaths.public || '/conversations',
      
      conversationBack: isPracticeWorkspace 
        ? basePaths.practice 
        : isClientWorkspace 
          ? basePaths.client 
          : basePaths.public || '/',
      
      practiceMatters: isPracticeWorkspace 
        ? basePaths.practice 
        : basePaths.client,
      
      publicConversationsBase: basePaths.public || '/conversations',
    };
  }, [workspace, practiceSlug, clientPracticeSlug]);

  // Navigation state
  const navigationState = useMemo((): WorkspaceRoutingState => {
    const isPracticeOnly = ['matters'].includes(view);
    const isSharedGuarded = ['matters'].includes(view);

    return {
    currentView: view,
    canNavigateToList: !['conversation', 'home'].includes(view),
    canNavigateToConversation: view !== 'conversation',
    canNavigateToMatters: view !== 'matters',
    canNavigateToClients: view !== 'clients',
    navigationPaths,
  };
  }, [view, workspace, practiceSlug, clientPracticeSlug, navigationPaths]);

  // Navigation actions
  const navigationActions = useMemo(() => ({
    navigateToList: () => {
      if (navigationState.canNavigateToList) {
        const targetPath = workspace === 'practice' 
          ? navigationPaths.practiceMatters
          : workspace === 'client'
            ? navigationPaths.conversationsBase
            : '/conversations';
        navigate(targetPath);
        onNavigate?.('list');
      }
    },

    navigateToConversation: (conversationId: string) => {
      if (navigationState.canNavigateToConversation) {
        const targetPath = workspace === 'practice' 
          ? `${navigationPaths.conversationsBase}/${encodeURIComponent(conversationId)}`
          : workspace === 'client'
            ? `${navigationPaths.conversationsBase}/${encodeURIComponent(conversationId)}`
            : `/conversations/${encodeURIComponent(conversationId)}`;
        navigate(targetPath);
        onNavigate?.('conversation');
      }
    },

    navigateToMatters: () => {
      if (navigationState.canNavigateToMatters) {
        navigate(navigationPaths.practiceMatters);
        onNavigate?.('matters');
      }
    },

    navigateToClients: () => {
      if (navigationState.canNavigateToClients) {
        const targetPath = workspace === 'client' 
          ? navigationPaths.conversationsBase
          : navigationPaths.practiceMatters;
        navigate(targetPath);
        onNavigate?.('clients');
      }
    },

    navigateToHome: () => {
      navigate(navigationPaths.conversationBack);
      onNavigate?.('home');
    },

    navigateToPractice: () => {
      if (practiceSlug) {
        navigate(navigationPaths.practiceMatters);
      }
    },
  }), [navigationState, navigate, workspace, practiceSlug, clientPracticeSlug, navigationPaths, onNavigate]);

  return {
    navigationState,
    navigationActions,
  };
};
