import { useEffect, useState, useCallback, useRef } from 'preact/hooks';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { authClient, getSession } from '@/shared/lib/authClient';

type MembershipOrg = { id?: string | null };

// Better Auth's organization plugin endpoint lists every org the user is a
// member of, regardless of which one is currently active on the session. The
// worker's /api/practice/list endpoint requires an active-org context and
// returns 403 when it is missing — using it here would defeat the purpose of
// the recovery (see docs/solutions/conventions/better-auth-active-organization-id-pointer-2026-05-15.md).
async function listMembershipOrgs(): Promise<MembershipOrg[]> {
  const result = await authClient.organization.list();
  const data = (result as { data?: unknown })?.data ?? result;
  if (!Array.isArray(data)) {
    throw new Error('authClient.organization.list returned a non-array response');
  }
  return data as MembershipOrg[];
}

async function setActiveOrganization(organizationId: string): Promise<void> {
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
  session: { session?: Record<string, unknown> | null } | null | undefined
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
        // Verified-empty: user genuinely has zero orgs. Memoize as terminal so
        // the gate stops asking on every render.
        resolvedForUserIds.add(userId);
        return;
      }
      await setActiveOrganization(firstId);
      await getSession();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('auth:session-updated'));
      }
      console.info('[Workspace] auto-activated first practice (no active_organization_id on session)');
      resolvedForUserIds.add(userId);
    } catch (error) {
      // Transient failure (network, 5xx, setActive rejection, etc.) — do NOT
      // memoize. Next render is allowed to retry; one bad request mustn't
      // permanently lock a user out of recovery.
      console.warn('[Workspace] failed to auto-activate practice', error);
    } finally {
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

export default useEnsureActiveOrganization;
