import { createContext, useContext, useEffect, useRef } from 'preact/compat';
import { ComponentChildren } from 'preact';
import { useActiveMemberRole, useTypedSession } from '@/shared/lib/authClient';
import { parseRoutingClaims, type RoutingClaims } from '@/shared/types/routing';

export interface SessionContextValue {
  session: ReturnType<typeof useTypedSession>['data'];
  isPending: boolean;
  error: unknown;
  isAnonymous: boolean;
  stripeCustomerId: string | null;
  activePracticeId: string | null;
  activeMemberRole: string | null;
  activeMemberRoleLoading: boolean;
  /**
   * Backend-computed routing claims from GET /auth/get-session.
   * Present when the backend routing PR #101 is deployed.
   * Falls back to null — callers should use useWorkspaceResolver which
   * handles both the claims path and the legacy fallback path.
   */
  routingClaims: RoutingClaims | null;
}

export const SessionContext = createContext<SessionContextValue | undefined>(undefined);

type SessionData = ReturnType<typeof useTypedSession>['data'];
type ActiveMemberRoleState = ReturnType<typeof useActiveMemberRole> | null;

const getActivePracticeId = (sessionData: SessionData | null | undefined): string | null => {
  const sessionRecord = sessionData?.session as Record<string, unknown> | undefined;
  const activeOrgId =
    (typeof sessionRecord?.activeOrganizationId === 'string'
      ? sessionRecord.activeOrganizationId
      : typeof sessionRecord?.active_organization_id === 'string'
        ? sessionRecord.active_organization_id
        : null);
  return activeOrgId ?? null;
};

const buildSessionContextValue = ({
  sessionData,
  isPending,
  error,
  activeMemberRoleState
}: {
  sessionData: SessionData | null | undefined;
  isPending: boolean;
  error: unknown;
  activeMemberRoleState?: ActiveMemberRoleState;
}): SessionContextValue => {
  const userRecord = (sessionData?.user as unknown as Record<string, unknown> | undefined) ?? undefined;
  const isAnonymous = sessionData?.user?.isAnonymous ?? !sessionData?.user;
  const stripeCustomerId =
    (typeof userRecord?.stripeCustomerId === 'string'
      ? userRecord.stripeCustomerId
      : typeof userRecord?.stripe_customer_id === 'string'
        ? userRecord.stripe_customer_id
        : null) ?? null;
  const activePracticeId = getActivePracticeId(sessionData);
  const activeMemberRole = activeMemberRoleState?.data?.role ?? null;
  const activeMemberRoleLoading = activeMemberRoleState?.isPending ?? false;

  // Parse backend routing claims if present (PR #101)
  const routingClaims = parseRoutingClaims(sessionData);

  return {
    session: sessionData ?? null,
    isPending,
    error,
    isAnonymous,
    stripeCustomerId,
    activePracticeId,
    activeMemberRole,
    activeMemberRoleLoading,
    routingClaims,
  };
};

function AuthenticatedSessionProvider({
  children,
  sessionData,
  isPending,
  error,
  sessionKey
}: {
  children: ComponentChildren;
  sessionData: SessionData | null | undefined;
  isPending: boolean;
  error: unknown;
  sessionKey: string | null;
}) {
  const isAnonymous = sessionData?.user?.isAnonymous ?? !sessionData?.user;
  const activePracticeId = getActivePracticeId(sessionData);

  // Only fetch role when we have an active practice context.
  // Avoids noisy 400s from Better Auth organization role endpoint on public/onboarding routes.
  if (!sessionKey || isAnonymous || !activePracticeId) {
    const value = buildSessionContextValue({ sessionData, isPending, error });
    return (
      <SessionContext.Provider value={value}>
        {children}
      </SessionContext.Provider>
    );
  }

  return (
    <AuthenticatedSessionProviderWithRole
      sessionData={sessionData}
      isPending={isPending}
      error={error}
      sessionKey={sessionKey}
      activePracticeId={activePracticeId}
    >
      {children}
    </AuthenticatedSessionProviderWithRole>
  );
}

function AuthenticatedSessionProviderWithRole({
  children,
  sessionData,
  isPending,
  error,
  sessionKey,
  activePracticeId
}: {
  children: ComponentChildren;
  sessionData: SessionData | null | undefined;
  isPending: boolean;
  error: unknown;
  sessionKey: string;
  activePracticeId: string;
}) {
  const activeMemberRoleState = useActiveMemberRole();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!sessionKey || !activePracticeId) return;

    const refetch = activeMemberRoleState?.refetch;
    if (typeof refetch !== 'function') return;
    void refetch({ query: { organizationId: activePracticeId } });
  }, [activeMemberRoleState?.refetch, activePracticeId, sessionKey]);

  const value = buildSessionContextValue({ sessionData, isPending, error, activeMemberRoleState });

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
}

export function SessionProvider({ children }: { children: ComponentChildren }) {
  const { data: sessionData, isPending, error } = useTypedSession();

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

  if (isAnonymous) {
    const value = buildSessionContextValue({ sessionData, isPending, error });

    return (
      <SessionContext.Provider value={value}>
        {children}
      </SessionContext.Provider>
    );
  }

  return (
    <AuthenticatedSessionProvider
      sessionData={sessionData}
      isPending={isPending}
      error={error}
      sessionKey={sessionKey}
    >
      {children}
    </AuthenticatedSessionProvider>
  );
}

export function useSessionContext() {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSessionContext must be used within a SessionProvider');
  }
  return context;
}
