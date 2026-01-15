import { useMemo } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import type { WorkspacePreference, WorkspaceType } from '@/shared/types/workspace';
import {
  resolveWorkspaceFromPath
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
  isPracticeLoading: boolean;
  canAccessPractice: boolean;
}

export function useWorkspace(): UseWorkspaceResult {
  const location = useLocation();
  const { primaryWorkspace, preferredPracticeId, hasPractice, activePracticeId } = useSessionContext();
  const { isPracticeEnabled, isLoading: isPracticeLoading } = useSubscription();

  const workspaceFromPath = useMemo(
    () => resolveWorkspaceFromPath(location.path),
    [location.path]
  );

  const preferredWorkspace = primaryWorkspace ?? null;
  const canAccessPractice = isPracticeEnabled && hasPractice;
  const defaultWorkspace: WorkspacePreference = useMemo(() => {
    if (!canAccessPractice) return 'client';
    if (preferredWorkspace === 'client') return 'client';
    if (preferredWorkspace === 'practice') return 'practice';
    if (activePracticeId) return 'practice';
    return 'client';
  }, [activePracticeId, canAccessPractice, preferredWorkspace]);

  return {
    workspaceFromPath,
    preferredWorkspace,
    preferredPracticeId,
    hasPractice,
    activePracticeId,
    defaultWorkspace,
    isPracticeEnabled,
    isPracticeLoading,
    canAccessPractice
  };
}
