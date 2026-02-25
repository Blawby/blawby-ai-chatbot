/**
 * WorkspaceContainer - Root workspace component
 *
 * Top-level workspace container that orchestrates all workspace functionality
 * using the new architecture with clean separation of concerns.
 */

import { FunctionComponent } from 'preact';
import { useMemo } from 'preact/hooks';
import { WorkspaceProvider } from '../contexts/WorkspaceContext';
import { useWorkspaceRouter } from '../components/WorkspaceRouter';
import type { WorkspaceType } from '@/shared/types/workspace';

export interface WorkspaceContainerProps {
  workspace: WorkspaceType;
  practiceId: string;
  practiceSlug: string | null;
  clientPracticeSlug: string | null;
  routeConversationId?: string;
  isWidget?: boolean;
  view: 'home' | 'list' | 'conversation' | 'matters' | 'clients';
  children: React.ReactNode;
}

const WorkspaceContainer: FunctionComponent<WorkspaceContainerProps> = ({
  workspace,
  practiceId,
  practiceSlug,
  clientPracticeSlug,
  routeConversationId,
  isWidget = false,
  view,
  children,
}) => {
  const { navigationState, navigationActions } = useWorkspaceRouter({
    workspace,
    practiceId,
    practiceSlug,
    clientPracticeSlug,
    view,
    onNavigate: (targetView) => {
      console.log(`Workspace navigation: ${view} → ${targetView}`);
    },
  });

  const contextValue = useMemo(() => ({
    workspaceType: workspace,
    practiceId,
    practiceSlug,
    clientPracticeSlug,
    currentView: view,
    navigationState,
    navigationActions,
  }), [workspace, practiceId, practiceSlug, clientPracticeSlug, view, navigationState, navigationActions]);

  return (
    <WorkspaceProvider>
      <div className="workspace-container h-full flex flex-col">
        {children}
      </div>
    </WorkspaceProvider>
  );
};

export default WorkspaceContainer;
