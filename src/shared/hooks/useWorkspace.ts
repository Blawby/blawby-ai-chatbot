import { useEffect, useMemo } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import type { WorkspacePreference, WorkspaceType } from '@/shared/types/workspace';
import {
  resolveWorkspaceFromPath,
  setStoredWorkspace,
  setSettingsReturnPath
} from '@/shared/utils/workspace';

interface UseWorkspaceResult {
  workspaceFromPath: WorkspaceType | null;
  preferredWorkspace: WorkspacePreference | null;
  preferredPracticeId: string | null;
  hasPractice: boolean;
  activePracticeId: string | null;
  defaultWorkspace: WorkspacePreference;
}

export function useWorkspace(): UseWorkspaceResult {
  const location = useLocation();
  const { primaryWorkspace, preferredPracticeId, hasPractice, activePracticeId } = useSessionContext();

  const workspaceFromPath = useMemo(
    () => resolveWorkspaceFromPath(location.path),
    [location.path]
  );

  useEffect(() => {
    if (!workspaceFromPath) return;
    setSettingsReturnPath(location.url ?? location.path);
    if (workspaceFromPath !== 'public') {
      setStoredWorkspace(workspaceFromPath);
    }
  }, [workspaceFromPath, location.path, location.url]);

  const preferredWorkspace = primaryWorkspace ?? null;
  const defaultWorkspace: WorkspacePreference = preferredWorkspace ?? (hasPractice ? 'practice' : 'client');

  return {
    workspaceFromPath,
    preferredWorkspace,
    preferredPracticeId,
    hasPractice,
    activePracticeId,
    defaultWorkspace
  };
}
