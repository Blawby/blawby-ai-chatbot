import { useMemo, useCallback } from 'preact/hooks';
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

interface UseWorkspaceResolverOptions {
  autoFetchPractices?: boolean;
}

export function useWorkspaceResolver(options: UseWorkspaceResolverOptions = {}): UseWorkspaceResolverResult {
  const { autoFetchPractices = true } = options;
  const { isPending } = useSessionContext();
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

  const hasPracticeAccess = Boolean(currentPractice?.id || practices.length > 0);
  const defaultWorkspace: WorkspacePreference = hasPracticeAccess ? 'practice' : 'client';

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
    resolvePracticeBySlug
  };
}
