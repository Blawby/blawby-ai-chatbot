import { createContext, useContext, useMemo } from 'preact/compat';
import { ComponentChildren } from 'preact';
import { useTypedSession } from '@/shared/lib/authClient';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';

export interface SessionContextValue {
  session: ReturnType<typeof useTypedSession>['data'];
  isAnonymous: boolean;
  activePracticeId: string | null;
  primaryWorkspace: 'client' | 'practice' | null;
  preferredPracticeId: string | null;
  hasPractice: boolean;
}

export const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export function SessionProvider({ children }: { children: ComponentChildren }) {
  const { data: sessionData } = useTypedSession();

  const isAnonymous = !sessionData?.user;
  const { currentPractice } = usePracticeManagement();

  const activePracticeIdFromSession =
    sessionData?.user?.practiceId ?? sessionData?.user?.activePracticeId ?? null;

  const activePracticeId = currentPractice?.id ?? activePracticeIdFromSession ?? null;
  const primaryWorkspace = sessionData?.user?.primaryWorkspace ?? null;
  const preferredPracticeId = sessionData?.user?.preferredPracticeId ?? null;
  const practiceCount = sessionData?.user?.practiceCount ?? null;
  const hasPracticeFlag = sessionData?.user?.hasPractice ?? null;
  const hasPractice = Boolean(
    (typeof hasPracticeFlag === 'boolean' ? hasPracticeFlag : null) ??
    (typeof practiceCount === 'number' ? practiceCount > 0 : null) ??
    currentPractice
  );

  const value = useMemo<SessionContextValue>(() => ({
    session: sessionData ?? null,
    isAnonymous,
    activePracticeId,
    primaryWorkspace,
    preferredPracticeId,
    hasPractice
  }), [sessionData, isAnonymous, activePracticeId, primaryWorkspace, preferredPracticeId, hasPractice]);

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
