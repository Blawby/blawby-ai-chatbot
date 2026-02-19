import { createContext, useContext, useEffect, useRef } from 'preact/compat';
import { ComponentChildren } from 'preact';
import { useActiveMemberRole, useTypedSession } from '@/shared/lib/authClient';
import type { WorkspaceType } from '@/shared/types/workspace';

type WorkspaceAccess = {
  practice: boolean;
  client: boolean;
  public: boolean;
};

export interface SessionContextValue {
  session: ReturnType<typeof useTypedSession>['data'];
  isPending: boolean;
  error: unknown;
  isAnonymous: boolean;
  stripeCustomerId: string | null;
  activeOrganizationId: string | null;
  activePracticeId: string | null;
  activeMemberRole: string | null;
  activeMemberRoleLoading: boolean;
  workspaceAccess: WorkspaceAccess;
  routingDefaultWorkspace: WorkspaceType;
}

export const SessionContext = createContext<SessionContextValue | undefined>(undefined);

type SessionData = ReturnType<typeof useTypedSession>['data'];
type ActiveMemberRoleState = ReturnType<typeof useActiveMemberRole> | null;

const parseWorkspaceType = (value: unknown): WorkspaceType | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'practice' || normalized === 'client' || normalized === 'public') {
    return normalized as WorkspaceType;
  }
  return null;
};

const parseWorkspaceAccess = (record: Record<string, unknown> | null | undefined): WorkspaceAccess => {
  const source = record && typeof record === 'object'
    ? (record.workspace_access as Record<string, unknown> | undefined)
      ?? (record.workspaceAccess as Record<string, unknown> | undefined)
    : undefined;

  const readBoolean = (value: unknown, fallback: boolean): boolean => (
    typeof value === 'boolean' ? value : fallback
  );

  return {
    practice: readBoolean(source?.practice, false),
    client: readBoolean(source?.client, false),
    public: readBoolean(source?.public, true)
  };
};

const getRoutingRecord = (sessionData: SessionData | null | undefined): Record<string, unknown> | null => {
  if (!sessionData || typeof sessionData !== 'object' || Array.isArray(sessionData)) {
    return null;
  }
  const record = sessionData as Record<string, unknown>;
  const routing = record.routing;
  if (routing && typeof routing === 'object' && !Array.isArray(routing)) {
    return routing as Record<string, unknown>;
  }
  return null;
};

const getActiveOrganizationId = (sessionData: SessionData | null | undefined): string | null => {
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
  const activeOrganizationId = getActiveOrganizationId(sessionData);
  const activePracticeId = activeOrganizationId;
  const routingRecord = getRoutingRecord(sessionData);
  const workspaceAccess = parseWorkspaceAccess(routingRecord);
  const routingDefaultWorkspace =
    parseWorkspaceType(routingRecord?.default_workspace ?? routingRecord?.defaultWorkspace)
      ?? (workspaceAccess.practice ? 'practice' : workspaceAccess.client ? 'client' : 'public');
  const routingActiveRoleRaw = routingRecord?.active_membership_role ?? routingRecord?.activeMembershipRole;
  const routingActiveRole = typeof routingActiveRoleRaw === 'string' ? routingActiveRoleRaw : null;
  const activeMemberRole = routingActiveRole ?? activeMemberRoleState?.data?.role ?? null;
  const activeMemberRoleLoading = routingActiveRole !== null ? false : (activeMemberRoleState?.isPending ?? false);

  return {
    session: sessionData ?? null,
    isPending,
    error,
    isAnonymous,
    stripeCustomerId,
    activeOrganizationId,
    activePracticeId,
    activeMemberRole,
    activeMemberRoleLoading,
    workspaceAccess,
    routingDefaultWorkspace,
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
  const activeMemberRoleState = useActiveMemberRole();
  const isAnonymous = sessionData?.user?.isAnonymous ?? !sessionData?.user;
  const activeOrganizationId = getActiveOrganizationId(sessionData);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!sessionKey || isAnonymous || !activeOrganizationId) return;

    const refetch = activeMemberRoleState?.refetch;
    if (typeof refetch !== 'function') return;
    void refetch({ query: { organizationId: activeOrganizationId } });
  }, [activeOrganizationId, activeMemberRoleState?.refetch, isAnonymous, sessionKey]);

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

  const activeOrganizationId = getActiveOrganizationId(sessionData);

  if (isAnonymous || !activeOrganizationId) {
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
