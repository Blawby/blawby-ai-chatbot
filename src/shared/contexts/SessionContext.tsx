import { createContext, useContext, useMemo } from 'preact/compat';
import { ComponentChildren } from 'preact';
import { useTypedSession } from '@/shared/lib/authClient';

export interface SessionContextValue {
  session: ReturnType<typeof useTypedSession>['data'];
  isPending: boolean;
  error: unknown;
  isAnonymous: boolean;
  activeOrganizationId: string | null;
  activePracticeId: string | null;
  primaryWorkspace: 'client' | 'practice' | null;
  preferredPracticeId: string | null;
  hasPractice: boolean;
}

export const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export function SessionProvider({ children }: { children: ComponentChildren }) {
  const { data: sessionData, isPending, error } = useTypedSession();

  const isAnonymous = !sessionData?.user;

  const sessionRecord = sessionData?.session as Record<string, unknown> | undefined;
  const activeOrgId =
    (typeof sessionRecord?.activeOrganizationId === 'string'
      ? sessionRecord.activeOrganizationId
      : typeof sessionRecord?.active_organization_id === 'string'
        ? sessionRecord.active_organization_id
        : null);

  const activeOrganizationId = activeOrgId ?? null;
  const activePracticeIdFromSession =
    activeOrganizationId ??
    sessionData?.user?.practiceId ??
    sessionData?.user?.activePracticeId ??
    null;

  const activePracticeId = activePracticeIdFromSession ?? null;
  const primaryWorkspace = sessionData?.user?.primaryWorkspace ?? null;
  const preferredPracticeId = sessionData?.user?.preferredPracticeId ?? null;
  const practiceCount = sessionData?.user?.practiceCount ?? null;
  const hasPracticeFlag = sessionData?.user?.hasPractice ?? null;
  const hasActivePractice = Boolean(activePracticeIdFromSession);
  const hasPreferredPractice = Boolean(preferredPracticeId);
  const hasPractice = Boolean(
    (typeof hasPracticeFlag === 'boolean' ? hasPracticeFlag : null) ??
    (typeof practiceCount === 'number' ? practiceCount > 0 : null) ??
    (hasActivePractice ? true : null) ??
    (hasPreferredPractice ? true : null)
  );

  const value = useMemo<SessionContextValue>(() => ({
    session: sessionData ?? null,
    isPending,
    error,
    isAnonymous,
    activeOrganizationId,
    activePracticeId,
    primaryWorkspace,
    preferredPracticeId,
    hasPractice
  }), [
    sessionData,
    isPending,
    error,
    isAnonymous,
    activeOrganizationId,
    activePracticeId,
    primaryWorkspace,
    preferredPracticeId,
    hasPractice
  ]);

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSessionContext() {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSessionContext must be used within a SessionProvider');
  }
  return context;
}
