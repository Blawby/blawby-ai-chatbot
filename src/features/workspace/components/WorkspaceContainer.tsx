/**
 * WorkspaceContainer - Root workspace component
 *
 * Top-level workspace container that orchestrates all workspace functionality
 * using the new architecture with clean separation of concerns.
 */

import { FunctionComponent } from 'preact';
import { WorkspaceProvider } from '../contexts/WorkspaceContext';
import type { WorkspaceType } from '@/shared/types/workspace';

export interface WorkspaceContainerProps {
  workspace: WorkspaceType;
  practiceSlug: string | null;
  clientPracticeSlug: string | null;
  view: 'home' | 'list' | 'conversation' | 'matters' | 'clients';
  children: React.ReactNode;
}

const WorkspaceContainer: FunctionComponent<WorkspaceContainerProps> = ({
  children,
}) => {

  return (
    <WorkspaceProvider>
      <div className="workspace-container h-full flex flex-col">
        {children}
      </div>
    </WorkspaceProvider>
  );
};

export default WorkspaceContainer;
