import { useMemo, useCallback } from 'preact/hooks';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { usePracticeManagement, type Practice } from '@/shared/hooks/usePracticeManagement';
import type { WorkspacePreference } from '@/shared/types/workspace';
import { normalizePracticeRole, type PracticeRole } from '@/shared/utils/practiceRoles';

interface UseWorkspaceResolverResult {
  isPending: boolean;
  rolePending: boolean;
  practicesLoading: boolean;
  practices: Practice[];
  currentPractice: Practice | null;
  activeRole: PracticeRole | null;
  isClientMember: boolean;
  hasPracticeMembership: boolean;
  canAccessPracticeWorkspace: boolean;
  canAccessClientWorkspace: boolean;
  hasPracticeAccess: boolean;
  defaultWorkspace: WorkspacePreference;
  resolvePracticeBySlug: (slug?: string | null) => Practice | null;
}

interface UseWorkspaceResolverOptions {
  autoFetchPractices?: boolean;
  fetchOnboardingStatus?: boolean;
  practiceSlug?: string | null;
}

export function useWorkspaceResolver(options: UseWorkspaceResolverOptions = {}): UseWorkspaceResolverResult {
  const { autoFetchPractices = true, fetchOnboardingStatus = false, practiceSlug = null } = options;
  const { isPending, session, activeMemberRole, activeMemberRoleLoading } = useSessionContext();
  const {
    practices,
    currentPractice,
    loading: practicesLoading
  } = usePracticeManagement({ autoFetchPractices, fetchOnboardingStatus, practiceSlug });

  const practiceBySlug = useMemo(() => {
    const map = new Map<string, Practice>();
    for (const practice of practices) {
      if (!practice.slug) continue;
      map.set(practice.slug.trim(), practice);
    }
    return map;
  }, [practices]);

  const activeRole = normalizePracticeRole(activeMemberRole);
  const isClientMember = activeRole === 'client';
  const hasPracticeMembership = Boolean(currentPractice?.id || practices.length > 0);
  const canAccessPracticeWorkspace = hasPracticeMembership && !isClientMember;
  const canAccessClientWorkspace = Boolean(
    session?.user &&
    !session.user.isAnonymous &&
    isClientMember
  );
  const hasPracticeAccess = canAccessPracticeWorkspace;

  const userPrimaryWorkspace = session?.user?.primaryWorkspace;
  const preferredWorkspace: WorkspacePreference =
    userPrimaryWorkspace === 'client' || userPrimaryWorkspace === 'public'
      ? 'client'
      : 'practice';
  const defaultWorkspace: WorkspacePreference =
    preferredWorkspace === 'client' && canAccessClientWorkspace
      ? 'client'
      : canAccessPracticeWorkspace
        ? 'practice'
        : canAccessClientWorkspace
          ? 'client'
          : preferredWorkspace;

  const resolvePracticeBySlug = useCallback((slug?: string | null): Practice | null => {
    const normalized = typeof slug === 'string' ? slug.trim() : '';
    if (!normalized) return null;
    return practiceBySlug.get(normalized) ?? (currentPractice?.slug?.trim() === normalized ? currentPractice : null);
  }, [practiceBySlug, currentPractice]);

  return {
    isPending,
    rolePending: activeMemberRoleLoading,
    practicesLoading,
    practices,
    currentPractice,
    activeRole,
    isClientMember,
    hasPracticeMembership,
    canAccessPracticeWorkspace,
    canAccessClientWorkspace,
    hasPracticeAccess,
    defaultWorkspace,
    resolvePracticeBySlug,
  };
}
