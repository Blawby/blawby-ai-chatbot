import { useMemo } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import type { WorkspacePreference, WorkspaceType } from '@/shared/types/workspace';
import {
  resolveWorkspaceFromPath
} from '@/shared/utils/workspace';

interface UseWorkspaceResult {
  workspaceFromPath: WorkspaceType | null;
  preferredWorkspace: WorkspacePreference | null;
  preferredPracticeId: string | null;
  activePracticeId: string | null;
  defaultWorkspace: WorkspacePreference;
  isPracticeEnabled: boolean;
  isPracticeLoading: boolean;
  canAccessPractice: boolean;
}

export function useWorkspace(): UseWorkspaceResult {
  const location = useLocation();
  const {
    primaryWorkspace,
    preferredPracticeId,
    activePracticeId,
    activeOrganizationId,
    isPending
  } = useSessionContext();

  const workspaceFromPath = useMemo(
    () => resolveWorkspaceFromPath(location.path),
    [location.path]
  );

  const preferredWorkspace = primaryWorkspace ?? null;
  const hasActivePractice = Boolean(activeOrganizationId || activePracticeId);
  const isPracticeLoading = isPending;
  const canAccessPractice = isPending ? true : hasActivePractice;
  const isPracticeEnabled = hasActivePractice;
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
    activePracticeId,
    defaultWorkspace,
    isPracticeEnabled,
    isPracticeLoading,
    canAccessPractice
  };
}
