import { createContext, useContext, useEffect, useRef, useMemo } from 'preact/compat';
import { ComponentChildren } from 'preact';
import { useTypedSession } from '@/shared/lib/authClient';
import { parseRoutingClaims, type RoutingClaims } from '@/shared/types/routing';
import { RoutePracticeContext } from '@/shared/contexts/RoutePracticeContext';
import { rememberAnonymousUserId, rememberAnonymousSessionId } from '@/shared/utils/anonymousIdentity';
import type { BetterAuthSessionUser } from '@/shared/types/user';

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
}: {
 sessionData: SessionData | null | undefined;
 isPending: boolean;
 error: unknown;
}): SessionContextValue => {
 // Safely narrow to fully-typed user, checking the new transformError discriminator
 const isTransformError = sessionData && 'transformError' in sessionData && sessionData.transformError === true;
 const typedUser = (isTransformError ? null : sessionData?.user) as BetterAuthSessionUser | null | undefined;
 const rawUserRecord = isTransformError ? (sessionData?.user as unknown as Record<string, unknown> | undefined) : undefined;

 const userRecord = (typedUser as unknown as Record<string, unknown> | undefined) ?? undefined;
 const isAnonymous = isTransformError
  ? (rawUserRecord?.isAnonymous as boolean | undefined ?? !sessionData?.user)
  : (typedUser?.isAnonymous ?? !sessionData?.user);
 const stripeCustomerId =
  (typeof userRecord?.stripeCustomerId === 'string'
   ? userRecord.stripeCustomerId
   : typeof userRecord?.stripe_customer_id === 'string'
    ? userRecord.stripe_customer_id
    : null) ?? null;
 const activePracticeId = getActivePracticeId(sessionData);

 // Parse backend routing claims if present (PR #101)
 const routingClaims = parseRoutingClaims(sessionData);

 // Trust backend claims for role if available, otherwise fallback to null.
 // This eliminates the need for useActiveMemberRole() which triggered an extra API call.
 const activeMemberRole = routingClaims?.active_membership_role ?? null;
 const activeMemberRoleLoading = false;

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

export function SessionProvider({ children }: { children: ComponentChildren }) {
 const { data: sessionData, isPending, error } = useTypedSession();

 const isTransformError = sessionData && 'transformError' in sessionData && sessionData.transformError === true;
 const typedUser = (isTransformError ? null : sessionData?.user) as BetterAuthSessionUser | null | undefined;
 const rawUserRecord1 = isTransformError ? (sessionData?.user as unknown as Record<string, unknown> | undefined) : undefined;
 const currentUserId1 = isTransformError ? (rawUserRecord1?.id as string | undefined) : typedUser?.id;

 const sessionKey =
  currentUserId1 ??
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

 const value = useMemo(() => buildSessionContextValue({ sessionData, isPending, error }), [sessionData, isPending, error]);

 const valueIsTransformError = value.session && 'transformError' in value.session && value.session.transformError === true;
 const valueTypedUser = (valueIsTransformError ? null : value.session?.user) as BetterAuthSessionUser | null | undefined;
 const rawUserRecord2 = valueIsTransformError ? (value.session?.user as unknown as Record<string, unknown> | undefined) : undefined;
 const currentUserId2 = valueIsTransformError ? (rawUserRecord2?.id as string | undefined) : valueTypedUser?.id;
 const isAnon2 = valueIsTransformError ? (rawUserRecord2?.isAnonymous as boolean | undefined ?? !value.session?.user) : valueTypedUser?.isAnonymous;

 useEffect(() => {
  if (!currentUserId2) return;
  if (!isAnon2) return;
  rememberAnonymousUserId(currentUserId2);
  const anonSessionId = typeof (value.session.session as { id?: string } | null | undefined)?.id === 'string'
   ? (value.session.session as { id: string }).id
   : null;
  if (anonSessionId) {
   rememberAnonymousSessionId(anonSessionId);
  }
 }, [value.session?.session, currentUserId2, isAnon2]);

 return (
  <SessionContext.Provider value={value}>
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
