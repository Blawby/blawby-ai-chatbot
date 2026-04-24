import { createContext, useContext, useEffect, useRef, useMemo, useState } from 'preact/compat';
import { ComponentChildren } from 'preact';
import { useSession, authClient } from '@/shared/lib/authClient';
import { RoutePracticeContext } from '@/shared/contexts/RoutePracticeContext';
import { rememberAnonymousUserId, rememberAnonymousSessionId } from '@/shared/utils/anonymousIdentity';
import type { AuthSessionPayload, BackendSession, BackendSessionUser } from '@/shared/types/user';

export interface SessionContextValue {
  session: AuthSessionPayload;
  isPending: boolean;
  error: unknown;
  isAnonymous: boolean;
  stripeCustomerId: string | null;
  activePracticeId: string | null;
  activeMemberRole: string | null;
  activeMemberRoleLoading: boolean;
}

export const SessionContext = createContext<SessionContextValue | undefined>(undefined);

type SessionData = AuthSessionPayload | null | undefined;
type ActiveMemberRoleState = {
  role: string | null;
  loading: boolean;
  resolved: boolean;
  error?: unknown;
};

const getActivePracticeId = (sessionData: SessionData | null | undefined): string | null => {
  const sessionRecord = sessionData?.session as BackendSession | undefined;
  // Use backend field name only (greenfield decision)
  return typeof sessionRecord?.active_organization_id === 'string'
    ? sessionRecord.active_organization_id
    : null;
};

const buildSessionContextValue = ({
  sessionData,
  isPending,
  error,
  activeMemberRole,
  activeMemberRoleLoading,
}: {
  sessionData: SessionData | null | undefined;
  isPending: boolean;
  error: unknown;
  activeMemberRole: string | null;
  activeMemberRoleLoading: boolean;
}): SessionContextValue => {
  const userRecord = sessionData?.user as BackendSessionUser | undefined;
  // Rely on backend field names only
  const isAnonymous = userRecord?.is_anonymous === true;
  const stripeCustomerId = typeof userRecord?.stripe_customer_id === 'string'
    ? userRecord.stripe_customer_id
    : null;
  const activePracticeId = getActivePracticeId(sessionData);

  return {
    session: sessionData ?? null,
    isPending,
    error,
    isAnonymous,
    stripeCustomerId,
    activePracticeId,
    activeMemberRole,
    activeMemberRoleLoading,
  };
};

function ActiveMemberRoleBridge({
  onChange,
  activePracticeId,
}: {
  onChange: (next: ActiveMemberRoleState) => void;
  activePracticeId: string | null;
}) {
  useEffect(() => {
    let mounted = true;
    
    onChange({ role: null, loading: true, resolved: false });
    
    authClient.organization.getActiveMemberRole()
      .then((res) => {
        if (!mounted) return;
        const activeRoleData = res?.data;
        const resolvedActiveMemberRole = typeof activeRoleData === 'string'
          ? activeRoleData
          : activeRoleData && typeof activeRoleData === 'object' && typeof activeRoleData.role === 'string'
            ? activeRoleData.role
            : null;
            
        onChange({
          role: resolvedActiveMemberRole,
          loading: false,
          resolved: true,
          error: res?.error,
        });
      })
      .catch((err) => {
        if (!mounted) return;
        onChange({
          role: null,
          loading: false,
          resolved: true,
          error: err,
        });
      });
      
    return () => { mounted = false; };
  }, [onChange, activePracticeId]);

  return null;
}

export function SessionProvider({ children }: { children: ComponentChildren }) {
  const { session: sessionData, isPending, error } = useSession();
  const [activeMemberRoleState, setActiveMemberRoleState] = useState<ActiveMemberRoleState>({
    role: null,
    loading: false,
    resolved: false,
  });
  const currentUserId1 = sessionData?.user?.id ?? null;
  const sessionIsAnonymous = sessionData?.user?.is_anonymous === true;
  const sessionActivePracticeId = getActivePracticeId(sessionData);
  const shouldResolveActiveMemberRole = Boolean(currentUserId1 && !sessionIsAnonymous && sessionActivePracticeId);

  const sessionKey =
    currentUserId1 ??
    (sessionData?.session as BackendSession | undefined)?.id ??
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

  useEffect(() => {
    if (shouldResolveActiveMemberRole) {
      setActiveMemberRoleState((current) => (
        current.loading && !current.resolved
          ? current
          : {
              role: current.role,
              loading: true,
              resolved: false,
            }
      ));
      return;
    }

    setActiveMemberRoleState({ role: null, loading: false, resolved: false });
  }, [shouldResolveActiveMemberRole, sessionActivePracticeId, currentUserId1]);

  const effectiveActiveMemberRoleLoading = shouldResolveActiveMemberRole
    && (!activeMemberRoleState.resolved || activeMemberRoleState.loading);

  const value = useMemo(
    () => buildSessionContextValue({
      sessionData,
      isPending,
      error: error || activeMemberRoleState.error,
      activeMemberRole: activeMemberRoleState.role,
      activeMemberRoleLoading: effectiveActiveMemberRoleLoading,
    }),
    [activeMemberRoleState.role, activeMemberRoleState.error, effectiveActiveMemberRoleLoading, error, isPending, sessionData]
  );

  const valueUserId = value.session?.user?.id ?? null;
  const valueIsAnon = value.session?.user?.is_anonymous === true;

  useEffect(() => {
    if (!valueUserId) return;
    if (!valueIsAnon) return;
    rememberAnonymousUserId(valueUserId);
    const anonSessionId = typeof (value.session?.session as BackendSession | undefined)?.id === 'string'
      ? (value.session?.session as BackendSession).id
      : null;
    if (anonSessionId) {
      rememberAnonymousSessionId(anonSessionId);
    }
  }, [value.session, valueUserId, valueIsAnon]);

  return (
    <SessionContext.Provider value={value}>
      {shouldResolveActiveMemberRole ? (
        <ActiveMemberRoleBridge 
          onChange={setActiveMemberRoleState} 
          activePracticeId={sessionActivePracticeId} 
        />
      ) : null}
      {children}
    </SessionContext.Provider>
  );
}

export function useSessionContext() {
  const sessionContext = useContext(SessionContext);
  const routePractice = useContext(RoutePracticeContext);
  if (sessionContext === undefined) {
    throw new Error('useSessionContext must be used within a SessionProvider');
  }
  const isRouteScopedWorkspace = routePractice?.workspace === 'practice' || routePractice?.workspace === 'client';
  if (!routePractice || !isRouteScopedWorkspace) {
    return sessionContext;
  }
  return {
    ...sessionContext,
    // Route-selected practice is authoritative for route-scoped pages.
    // When unresolved during navigation, expose null (not legacy active org)
    // so pages render loaders instead of fetching the wrong workspace.
    activePracticeId: routePractice.practiceId ?? null,
  };
}
