import { useMemo } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import type { WorkspacePreference, WorkspaceType } from '@/shared/types/workspace';
import {
  resolveWorkspaceFromPath
} from '@/shared/utils/workspace';

interface UseWorkspaceResult {
  workspaceFromPath: WorkspaceType | null;
  activePracticeId: string | null;
  defaultWorkspace: WorkspacePreference;
  isPracticeEnabled: boolean;
  isPracticeLoading: boolean;
  canAccessPractice: boolean;
}

export function useWorkspace(): UseWorkspaceResult {
  const location = useLocation();
  const {
    activePracticeId,
    workspaceAccess,
    routingDefaultWorkspace,
    isPending
  } = useSessionContext();

  const workspaceFromPath = useMemo(
    () => resolveWorkspaceFromPath(location.path),
    [location.path]
  );

  const isPracticeLoading = isPending;
  const canAccessPractice = isPending ? true : workspaceAccess.practice;
  const isPracticeEnabled = workspaceAccess.practice;
  const defaultWorkspace: WorkspacePreference = useMemo(() => {
    if (routingDefaultWorkspace === 'practice' && workspaceAccess.practice) {
      return 'practice';
    }
    if (routingDefaultWorkspace === 'client') {
      return 'client';
    }
    return workspaceAccess.practice ? 'practice' : 'client';
  }, [routingDefaultWorkspace, workspaceAccess.practice]);

  return {
    workspaceFromPath,
    activePracticeId,
    defaultWorkspace,
    isPracticeEnabled,
    isPracticeLoading,
    canAccessPractice
  };
}
