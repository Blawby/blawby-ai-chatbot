import { useEffect, useState, useCallback, useRef } from 'preact/hooks';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { authClient, getSession } from '@/shared/lib/authClient';

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

const resolvedForUserIds = new Set<string>();
const inFlightForUserIds = new Map<string, Promise<void>>();

const dropMemo = () => {
  resolvedForUserIds.clear();
  inFlightForUserIds.clear();
};

if (typeof window !== 'undefined') {
  window.addEventListener('auth:session-cleared', dropMemo);
}

const isSubscriptionSuccessReturn = (): boolean => {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('subscription') === 'success';
};

const getActiveOrganizationId = (
  session: { session?: Record<string, unknown> } | null | undefined
): string | null => {
  const value = session?.session?.active_organization_id;
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
};

async function runRecovery(userId: string): Promise<void> {
  const existing = inFlightForUserIds.get(userId);
  if (existing) return existing;
  if (resolvedForUserIds.has(userId)) return;

  const promise = (async () => {
    try {
      const orgs = await listMembershipOrgs();
      const firstId = typeof orgs[0]?.id === 'string' ? orgs[0].id : null;
      if (!firstId) {
        // Verified-empty membership list — user genuinely has zero orgs. Memoize
        // as a terminal "no-orgs" state so the gate stops asking on every render.
        resolvedForUserIds.add(userId);
        return;
      }
      await setActiveOrganization(firstId);
      await getSession();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('auth:session-updated'));
      }
      console.info('[Workspace] auto-activated first practice (no active_organization_id on session)');
      // Verified-success — memoize as terminal so the next render skips the work.
      resolvedForUserIds.add(userId);
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
  const [isResolving, setIsResolving] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const userId = session?.user?.id ?? null;
  const onboardingComplete = session?.user?.onboarding_complete === true;
  const activeOrgId = getActiveOrganizationId(session);

  const eligible = Boolean(
    !isPending &&
    userId &&
    !isAnonymous &&
    onboardingComplete &&
    !activeOrgId &&
    !resolvedForUserIds.has(userId)
  );

  useEffect(() => {
    if (!eligible || !userId) return;
    if (isSubscriptionSuccessReturn()) return;

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

  return { isResolving, forceResolve };
}
