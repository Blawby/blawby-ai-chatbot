import { useMemo, useCallback } from 'preact/hooks';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { usePracticeManagement, type Practice } from '@/shared/hooks/usePracticeManagement';
import type { WorkspacePreference } from '@/shared/types/workspace';
import type { RoutingClaims } from '@/shared/types/routing';

interface UseWorkspaceResolverResult {
  isPending: boolean;
  practicesLoading: boolean;
  practices: Practice[];
  currentPractice: Practice | null;
  hasPracticeAccess: boolean;
  defaultWorkspace: WorkspacePreference;
  resolvePracticeBySlug: (slug?: string | null) => Practice | null;
  /**
   * Backend routing claims when available (backend PR #101).
   * Null when the backend is running a pre-#101 build.
   */
  routingClaims: RoutingClaims | null;
}

interface UseWorkspaceResolverOptions {
  autoFetchPractices?: boolean;
}

export function useWorkspaceResolver(options: UseWorkspaceResolverOptions = {}): UseWorkspaceResolverResult {
  const { autoFetchPractices = true } = options;
  const { isPending, routingClaims } = useSessionContext();
  const {
    practices,
    currentPractice,
    loading: practicesLoading
  } = usePracticeManagement({ autoFetchPractices });

  const practiceBySlug = useMemo(() => {
    const map = new Map<string, Practice>();
    for (const practice of practices) {
      if (!practice.slug) continue;
      map.set(practice.slug.trim(), practice);
    }
    return map;
  }, [practices]);

  /**
   * Prefer the backend routing claim when available.
   * Fall back to local practice-list heuristic (legacy path).
   */
  const hasPracticeAccess = routingClaims
    ? routingClaims.workspace_access.practice
    : Boolean(currentPractice?.id || practices.length > 0);

  const defaultWorkspace: WorkspacePreference = routingClaims
    ? (routingClaims.default_workspace === 'public' ? 'client' : routingClaims.default_workspace)
    : hasPracticeAccess ? 'practice' : 'client';

  const resolvePracticeBySlug = useCallback((slug?: string | null): Practice | null => {
    const normalized = typeof slug === 'string' ? slug.trim() : '';
    if (!normalized) return null;
    return practiceBySlug.get(normalized) ?? (currentPractice?.slug?.trim() === normalized ? currentPractice : null);
  }, [practiceBySlug, currentPractice]);

  return {
    isPending,
    practicesLoading,
    practices,
    currentPractice,
    hasPracticeAccess,
    defaultWorkspace,
    resolvePracticeBySlug,
    routingClaims,
  };
}
