import { useMemo } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { useWorkspaceResolver } from '@/shared/hooks/useWorkspaceResolver';
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
    isPending
  } = useSessionContext();
  const {
    hasPracticeAccess,
    defaultWorkspace,
    practicesLoading
  } = useWorkspaceResolver();

  const workspaceFromPath = useMemo(
    () => resolveWorkspaceFromPath(location.path),
    [location.path]
  );

  const isPracticeLoading = isPending || practicesLoading;
  const canAccessPractice = isPracticeLoading ? true : hasPracticeAccess;
  const isPracticeEnabled = hasPracticeAccess;

  return {
    workspaceFromPath,
    activePracticeId,
    defaultWorkspace,
    isPracticeEnabled,
    isPracticeLoading,
    canAccessPractice
  };
}
