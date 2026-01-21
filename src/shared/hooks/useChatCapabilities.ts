import { useMemo } from 'preact/hooks';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import type { WorkspaceType } from '@/shared/types/workspace';

export interface ChatCapabilities {
  role: string | null;
  isPracticeMember: boolean;
  canManageInbox: boolean;
  canAssign: boolean;
  canSetStatus: boolean;
  canViewInternalNotes: boolean;
}

export function useChatCapabilities({
  workspace
}: {
  workspace: WorkspaceType;
}): ChatCapabilities {
  const { session, isAnonymous, activeMemberRole } = useSessionContext();
  const role = activeMemberRole ?? null;
  const isPracticeWorkspace = workspace === 'practice';
  const isPracticeMember = isPracticeWorkspace && Boolean(role) && Boolean(session?.user) && !isAnonymous;
  const isManager = role === 'owner' || role === 'admin';

  return useMemo(() => ({
    role,
    isPracticeMember,
    canManageInbox: isPracticeMember,
    canAssign: isPracticeMember && (isManager || role === 'attorney' || role === 'paralegal'),
    canSetStatus: isPracticeMember,
    canViewInternalNotes: isPracticeMember,
  }), [role, isManager, isPracticeMember]);
}
