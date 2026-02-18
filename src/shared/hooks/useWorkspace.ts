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
    activeOrganizationId,
    stripeCustomerId,
    isPending
  } = useSessionContext();

  const workspaceFromPath = useMemo(
    () => resolveWorkspaceFromPath(location.path),
    [location.path]
  );

  const hasActiveOrganization = Boolean(activeOrganizationId || activePracticeId);
  const isSubscribed = Boolean(stripeCustomerId);
  const hasPracticeAccess = hasActiveOrganization && isSubscribed;
  const isPracticeLoading = isPending;
  const canAccessPractice = isPending ? true : hasPracticeAccess;
  const isPracticeEnabled = hasPracticeAccess;
  const defaultWorkspace: WorkspacePreference = useMemo(() => {
    if (!canAccessPractice) return 'client';
    return 'practice';
  }, [canAccessPractice]);

  return {
    workspaceFromPath,
    activePracticeId,
    defaultWorkspace,
    isPracticeEnabled,
    isPracticeLoading,
    canAccessPractice
  };
}
