import { useMemo } from 'preact/hooks';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
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
  const { session } = useSessionContext();
  const { currentPractice, getMembers } = usePracticeManagement();

  const currentUserEmail = session?.user?.email || null;

  const members = useMemo(
    () => (currentPractice ? getMembers(currentPractice.id) : []),
    [currentPractice, getMembers]
  );

  const currentMember = useMemo(() => {
    if (!currentPractice || !members.length) return null;
    if (currentUserEmail) {
      const emailMatch = members.find((member) =>
        member.email && member.email.toLowerCase() === currentUserEmail.toLowerCase()
      );
      if (emailMatch) return emailMatch;
    }
    const userId = session?.user?.id;
    if (!userId) return null;
    return members.find((member) => member.userId === userId) || null;
  }, [currentPractice, currentUserEmail, members, session?.user?.id]);

  const role = currentMember?.role ?? null;
  const isPracticeWorkspace = workspace === 'practice';
  const isPracticeMember = isPracticeWorkspace && Boolean(role);
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
