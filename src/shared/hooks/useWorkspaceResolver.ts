import { useMemo } from 'preact/hooks';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { usePracticeManagement, type Practice } from '@/shared/hooks/usePracticeManagement';
import type { WorkspacePreference } from '@/shared/types/workspace';

interface UseWorkspaceResolverResult {
  isPending: boolean;
  practicesLoading: boolean;
  practices: Practice[];
  currentPractice: Practice | null;
  hasPracticeAccess: boolean;
  defaultWorkspace: WorkspacePreference;
  resolvePracticeBySlug: (slug?: string | null) => Practice | null;
}

export function useWorkspaceResolver(): UseWorkspaceResolverResult {
  const { isPending } = useSessionContext();
  const {
    practices,
    currentPractice,
    loading: practicesLoading
  } = usePracticeManagement();

  const practiceBySlug = useMemo(() => {
    const map = new Map<string, Practice>();
    for (const practice of practices) {
      if (!practice.slug) continue;
      map.set(practice.slug.trim(), practice);
    }
    return map;
  }, [practices]);

  const hasPracticeAccess = Boolean(currentPractice?.id || practices.length > 0);
  const defaultWorkspace: WorkspacePreference = hasPracticeAccess ? 'practice' : 'client';

  const resolvePracticeBySlug = (slug?: string | null): Practice | null => {
    const normalized = typeof slug === 'string' ? slug.trim() : '';
    if (!normalized) return null;
    return practiceBySlug.get(normalized) ?? (currentPractice?.slug === normalized ? currentPractice : null);
  };

  return {
    isPending,
    practicesLoading,
    practices,
    currentPractice,
    hasPracticeAccess,
    defaultWorkspace,
    resolvePracticeBySlug
  };
}
