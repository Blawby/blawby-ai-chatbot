import { createContext, useContext, useEffect, useMemo, useRef } from 'preact/compat';
import { ComponentChildren } from 'preact';
import { useActiveMemberRole, useTypedSession } from '@/shared/lib/authClient';

export interface SessionContextValue {
  session: ReturnType<typeof useTypedSession>['data'];
  isPending: boolean;
  error: unknown;
  isAnonymous: boolean;
  activeOrganizationId: string | null;
  activePracticeId: string | null;
  activeMemberRole: string | null;
  activeMemberRoleLoading: boolean;
  primaryWorkspace: 'client' | 'practice' | null;
  preferredPracticeId: string | null;
  hasPractice: boolean;
}

export const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export function SessionProvider({ children }: { children: ComponentChildren }) {
  const { data: sessionData, isPending, error } = useTypedSession();
  const activeMemberRoleState = useActiveMemberRole();

  const isAnonymous = sessionData?.user?.isAnonymous ?? !sessionData?.user;
  const sessionKey =
    sessionData?.user?.id ??
    (sessionData?.session as { id?: string } | undefined)?.id ??
    null;

  const previousSessionKeyRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const previousSessionKey = previousSessionKeyRef.current;
    if (previousSessionKey === undefined) {
      previousSessionKeyRef.current = sessionKey;
      if (sessionKey) {
        window.dispatchEvent(new CustomEvent('auth:session-updated'));
      }
      return;
    }

    if (previousSessionKey !== sessionKey) {
      window.dispatchEvent(new CustomEvent(sessionKey ? 'auth:session-updated' : 'auth:session-cleared'));
      previousSessionKeyRef.current = sessionKey;
    }
  }, [sessionKey]);

  const sessionRecord = sessionData?.session as Record<string, unknown> | undefined;
  const activeOrgId =
    (typeof sessionRecord?.activeOrganizationId === 'string'
      ? sessionRecord.activeOrganizationId
      : typeof sessionRecord?.active_organization_id === 'string'
        ? sessionRecord.active_organization_id
        : null);

  const activeOrganizationId = activeOrgId ?? null;
  const activePracticeId = activeOrganizationId;
  const primaryWorkspace = sessionData?.user?.primaryWorkspace ?? null;
  const preferredPracticeId = sessionData?.user?.preferredPracticeId ?? null;
  const practiceCount = sessionData?.user?.practiceCount ?? null;
  const hasPracticeFlag = sessionData?.user?.hasPractice ?? null;
  const hasActivePractice = Boolean(activeOrganizationId);
  const activeMemberRole = activeMemberRoleState?.data?.role ?? null;
  const activeMemberRoleLoading = activeMemberRoleState?.isPending ?? false;
  const hasPractice = Boolean(
    (typeof hasPracticeFlag === 'boolean' ? hasPracticeFlag : null) ??
    (typeof practiceCount === 'number' ? practiceCount > 0 : null) ??
    (hasActivePractice ? true : null)
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!sessionKey || isAnonymous || !activeOrganizationId) return;

    const refetch = activeMemberRoleState?.refetch;
    if (typeof refetch !== 'function') return;
    void refetch({ query: { organizationId: activeOrganizationId } });
  }, [activeOrganizationId, activeMemberRoleState?.refetch, isAnonymous, sessionKey]);

  const value = useMemo<SessionContextValue>(() => ({
    session: sessionData ?? null,
    isPending,
    error,
    isAnonymous,
    activeOrganizationId,
    activePracticeId,
    activeMemberRole,
    activeMemberRoleLoading,
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
    activeMemberRole,
    activeMemberRoleLoading,
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
