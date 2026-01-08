import { useEffect, useMemo } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import type { WorkspacePreference, WorkspaceType } from '@/shared/types/workspace';
import {
  resolveWorkspaceFromPath,
  setStoredWorkspace,
  setSettingsReturnPath
} from '@/shared/utils/workspace';
import { useSubscription } from '@/shared/hooks/useSubscription';

interface UseWorkspaceResult {
  workspaceFromPath: WorkspaceType | null;
  preferredWorkspace: WorkspacePreference | null;
  preferredPracticeId: string | null;
  hasPractice: boolean;
  activePracticeId: string | null;
  defaultWorkspace: WorkspacePreference;
  isPracticeEnabled: boolean;
  canAccessPractice: boolean;
}

export function useWorkspace(): UseWorkspaceResult {
  const location = useLocation();
  const { primaryWorkspace, preferredPracticeId, hasPractice, activePracticeId } = useSessionContext();
  const { isPracticeEnabled } = useSubscription();

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
  const defaultWorkspace: WorkspacePreference = isPracticeEnabled
    ? (preferredWorkspace ?? (hasPractice ? 'practice' : 'client'))
    : 'client';
  const canAccessPractice = isPracticeEnabled && hasPractice;

  return {
    workspaceFromPath,
    preferredWorkspace,
    preferredPracticeId,
    hasPractice,
    activePracticeId,
    defaultWorkspace,
    isPracticeEnabled,
    canAccessPractice
  };
}
