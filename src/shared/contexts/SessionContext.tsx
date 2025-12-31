import { createContext, useContext, useMemo } from 'preact/compat';
import { ComponentChildren } from 'preact';
import { authClient } from '@/shared/lib/authClient';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';

export interface SessionContextValue {
  session: ReturnType<typeof authClient.useSession>['data'];
  isAnonymous: boolean;
  activePracticeId: string | null;
}

export const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export function SessionProvider({ children }: { children: ComponentChildren }) {
  const { data: sessionData } = authClient.useSession();

  const isAnonymous = !sessionData?.user;
  const { currentPractice } = usePracticeManagement();

  const activePracticeIdFromSession =
    (sessionData?.user as { practiceId?: string; activePracticeId?: string })?.practiceId ?? 
    (sessionData?.user as { practiceId?: string; activePracticeId?: string })?.activePracticeId ?? 
    null;

  const activePracticeId = currentPractice?.id ?? activePracticeIdFromSession ?? null;

  const value = useMemo<SessionContextValue>(() => ({
    session: sessionData ?? null,
    isAnonymous,
    activePracticeId,
  }), [sessionData, isAnonymous, activePracticeId]);

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
