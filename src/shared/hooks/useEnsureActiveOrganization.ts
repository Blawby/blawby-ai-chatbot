import { useEffect, useState, useCallback, useRef } from 'preact/hooks';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { authClient, getSession, getActiveOrganizationPointer } from '@/shared/lib/authClient';

type MembershipOrg = { id?: string | null };

async function listMembershipOrgs(): Promise<MembershipOrg[]> {
  // Better Auth's organization plugin endpoint lists EVERY org the user is a member
  // of, regardless of which one is currently active on the session. The worker's
  // /api/practice/list endpoint requires an active-org context and returns 403 when
  // it is missing — using it here would defeat the purpose of the recovery.
  //
  // No silent catch here on purpose: a thrown error from `authClient.organization.list`
  // (network blip, 5xx, SDK envelope failure) must propagate so the caller can refuse
  // to memoize the user as "resolved" and allow the next render to retry. Pre-fix
  // versions returned `[]` on error AND unconditionally memoized in a finally block,
  // which permanently locked users out of recovery after a single transient failure.
  // A non-array shape is also a failure (response contract violation), so throw rather
  // than coerce to empty.
  const result = await authClient.organization.list();
  const data = (result as { data?: unknown })?.data ?? result;
  if (!Array.isArray(data)) {
    throw new Error('authClient.organization.list returned a non-array response');
  }
  return data as MembershipOrg[];
}

async function setActiveOrganization(organizationId: string): Promise<void> {
  // Use Better Auth's direct setActive endpoint, NOT the worker's
  // /api/practice/{id}/active route. The worker route requires an existing
  // active-org context (it's middleware-gated), so it can't bootstrap one.
  await authClient.organization.setActive({ organizationId });
}

// Split the per-user memo by recovery outcome. The distinction matters for the
// post-recovery propagation gap: when recovery calls `setActive` successfully,
// the cookie/server state is updated and `getSession` is invoked, but the
// React-observed `session.active_organization_id` only updates on a subsequent
// render. During that gap the hook must keep reporting `isResolving: true` so
// the gate doesn't briefly see (no activeOrg + no membership + recovery done)
// and emit a `/pricing` redirect that gets undone ~100ms later.
//
// `resolvedWithOrgActivatedForUserIds` — recovery succeeded AND setActive was
// called. The user has at least one org; we're waiting for `activeOrgId` to
// appear on the session. Treated as still-resolving until that happens.
//
// `resolvedNoOrgsForUserIds` — recovery succeeded with an empty membership
// list. Terminal "no orgs" state. The gate may legitimately route to /pricing.
const resolvedWithOrgActivatedForUserIds = new Set<string>();
const resolvedNoOrgsForUserIds = new Set<string>();
const inFlightForUserIds = new Map<string, Promise<void>>();

const isResolvedForUser = (userId: string): boolean =>
  resolvedWithOrgActivatedForUserIds.has(userId) ||
  resolvedNoOrgsForUserIds.has(userId);

const dropMemo = () => {
  resolvedWithOrgActivatedForUserIds.clear();
  resolvedNoOrgsForUserIds.clear();
  inFlightForUserIds.clear();
};

if (typeof window !== 'undefined') {
  window.addEventListener('auth:session-cleared', dropMemo);
}

const isSubscriptionSuccessReturn = (): boolean => {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('subscription') === 'success';
};

async function runRecovery(userId: string): Promise<void> {
  const existing = inFlightForUserIds.get(userId);
  if (existing) return existing;
  if (isResolvedForUser(userId)) return;

  const promise = (async () => {
    try {
      const orgs = await listMembershipOrgs();
      const firstId = typeof orgs[0]?.id === 'string' ? orgs[0].id : null;
      if (!firstId) {
        // Verified-empty membership list — user genuinely has zero orgs.
        // Memoize as terminal "no-orgs" so the gate may route to /pricing.
        resolvedNoOrgsForUserIds.add(userId);
        return;
      }
      await setActiveOrganization(firstId);
      await getSession();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('auth:session-updated'));
      }
      console.info('[Workspace] auto-activated first practice (no active_organization_id on session)');
      // Verified-success — memoize as "activated, awaiting session propagation".
      // The hook's returned `isResolving` stays true until session reflects
      // the new activeOrg, closing the post-recovery /pricing flash.
      resolvedWithOrgActivatedForUserIds.add(userId);
    } catch (error) {
      // Transient failure (network, 5xx, SDK envelope error, setActive rejection,
      // getSession failure). DO NOT memoize. A subsequent render with the same
      // session state is allowed to retry — the user shouldn't be permanently
      // locked out of recovery because of one bad request.
      console.warn('[Workspace] failed to auto-activate practice', error);
    } finally {
      // Always clear the in-flight tracker so future attempts (next render's effect,
      // a forceResolve call) can run instead of awaiting a dead promise.
      inFlightForUserIds.delete(userId);
    }
  })();

  inFlightForUserIds.set(userId, promise);
  return promise;
}

export function useEnsureActiveOrganization() {
  const { session, isPending, isAnonymous } = useSessionContext();
  const userId = session?.user?.id ?? null;
  const onboardingComplete = session?.user?.onboarding_complete === true;
  const activeOrgId = getActiveOrganizationPointer(session);

  const eligible = Boolean(
    !isPending &&
    userId &&
    !isAnonymous &&
    onboardingComplete &&
    !activeOrgId &&
    !isResolvedForUser(userId)
  );

  // Post-recovery propagation gap: when `runRecovery` successfully calls
  // setActive, the server-side cookie is updated, but `session.active_organization_id`
  // on the React side only flips on a subsequent render. During that gap the
  // hook MUST report `isResolving: true` so the gate doesn't see (no activeOrg
  // + no membership + recovery done) and emit a /pricing flash. The state
  // clears naturally once `activeOrgId` becomes truthy on the session.
  const isAwaitingPropagation = Boolean(
    userId && resolvedWithOrgActivatedForUserIds.has(userId) && !activeOrgId
  );

  // Tristate: state flag for "currently firing or in-flight", derived predicate
  // for "would-fire-on-this-render". OR them together so the returned value is
  // true the moment eligibility flips — without waiting for the auto-fire
  // effect to run after render. This closes the post-sign-in /pricing flash:
  // the hook mounts at app boot with session=null (eligible=false), then
  // session resolves on a later render. The state flag is stale `false` until
  // the effect commits; the derived predicate fills that gap synchronously.
  const [isResolvingState, setIsResolving] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // Effect owns the state flag: sets true when firing, false when done or
    // when eligibility fails. The derived `wouldFire` predicate (below) covers
    // the one-render gap where the effect hasn't committed yet.
    if (!eligible || !userId || isSubscriptionSuccessReturn()) {
      if (mountedRef.current) {
        setIsResolving(false);
      }
      return;
    }

    setIsResolving(true);
    void runRecovery(userId).finally(() => {
      if (mountedRef.current) {
        setIsResolving(false);
      }
    });
  }, [eligible, userId]);

  const forceResolve = useCallback(async (): Promise<void> => {
    if (!userId) return;
    setIsResolving(true);
    try {
      await runRecovery(userId);
    } finally {
      if (mountedRef.current) {
        setIsResolving(false);
      }
    }
  }, [userId]);

  // Synchronous "would-fire-on-this-render" predicate. Mirrors the effect's
  // fire conditions exactly. When true and the state flag is still false (i.e.
  // the effect hasn't run yet for this eligibility transition), the OR below
  // reports `isResolving: true` so the gate stays in a `loading` kind during
  // the gap render.
  const wouldFire = Boolean(
    eligible && userId && !isSubscriptionSuccessReturn()
  );
  const isResolving = isResolvingState || wouldFire || isAwaitingPropagation;

  return { isResolving, forceResolve };
}
