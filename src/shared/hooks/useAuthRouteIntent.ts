import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { useEnsureActiveOrganization } from '@/shared/hooks/useEnsureActiveOrganization';
import { useWorkspaceResolver } from '@/shared/hooks/useWorkspaceResolver';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { getActiveOrganizationPointer } from '@/shared/lib/authClient';
import {
  computeRouteIntent,
  type RouteIntent,
  type RouteIntentInputs,
} from '@/shared/auth/routeIntent';

interface UseAuthRouteIntentOptions {
  /**
   * Whether to auto-fetch the practice list. Pass `false` for routes where
   * practice membership is not relevant (e.g. /public, /auth, /onboarding).
   * Defaults to `true` so the intent's "no-subscription" decision has real
   * data to read.
   */
  autoFetchPractices?: boolean;
}

/**
 * The single owner of "where should this user be?".
 *
 * Gathers inputs from existing primitives (session, recovery hook, workspace
 * resolver, useLocation) and delegates the decision tree to the pure
 * `computeRouteIntent` function. Consumers (AppShell, RootRoute) render the
 * matched UI or a `<Redirect>` based on the returned `RouteIntent.kind`.
 *
 * Also owns post-Stripe sync state (was previously RootRoute-local): when the
 * URL carries `?subscription=success`, the hook holds `isSubscriptionSyncInFlight`
 * while the recovery hook auto-activates the new org, then strips the query
 * param from the URL once the sync resolves.
 */
export function useAuthRouteIntent(
  options: UseAuthRouteIntentOptions = {}
): RouteIntent {
  const { autoFetchPractices = true } = options;
  const location = useLocation();
  const { session, isPending: isSessionPending } = useSessionContext();
  const { isResolving: isResolvingActiveOrg, forceResolve } = useEnsureActiveOrganization();
  const {
    practices,
    currentPractice,
    practicesLoading,
    hasPracticeMembership,
    defaultWorkspace,
  } = useWorkspaceResolver({ autoFetchPractices });
  const { refetch: refetchPractices } = usePracticeManagement({ autoFetchPractices: false });

  const isSubscriptionSuccessReturn = location.query.subscription === 'success';
  const subscriptionSyncHandledRef = useRef(false);
  const [subscriptionSyncInFlight, setSubscriptionSyncInFlight] = useState(() =>
    isSubscriptionSuccessReturn
  );

  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Post-Stripe round-trip: when ?subscription=success is present, kick the
  // recovery hook imperatively (the auto-fire path is blocked by the same URL
  // flag — that's intentional, the post-Stripe effect IS the owner of this
  // round-trip), then refetch practices, then strip the URL param.
  useEffect(() => {
    if (!isSubscriptionSuccessReturn) {
      subscriptionSyncHandledRef.current = false;
      return;
    }
    if (subscriptionSyncHandledRef.current) return;

    subscriptionSyncHandledRef.current = true;
    setSubscriptionSyncInFlight(true);

    void forceResolve()
      .catch((error) => {
        console.warn('[Workspace] failed to refresh session after Stripe checkout', error);
      })
      .then(() => refetchPractices())
      .catch((error) => {
        console.warn('[Workspace] failed to refresh practices after Stripe checkout', error);
      })
      .finally(() => {
        if (typeof window !== 'undefined') {
          const newUrl = new URL(window.location.href);
          newUrl.searchParams.delete('subscription');
          window.history.replaceState(
            {},
            '',
            `${newUrl.pathname}${newUrl.search}${newUrl.hash}`
          );
        }
        if (mountedRef.current) {
          setSubscriptionSyncInFlight(false);
        }
      });
  }, [forceResolve, isSubscriptionSuccessReturn, refetchPractices]);

  const user = session?.user;
  const userId = user?.id ?? null;
  const isAnonymous = user?.is_anonymous === true;
  const onboardingComplete = user?.onboarding_complete === true;

  const activeOrganizationId = getActiveOrganizationPointer(session);

  const currentPracticeSlug = currentPractice?.slug ?? null;
  const fallbackPracticeSlug = practices[0]?.slug ?? null;

  const inputs = useMemo<RouteIntentInputs>(
    () => ({
      isSessionPending,
      user: userId
        ? { id: userId, isAnonymous, onboardingComplete }
        : null,
      activeOrganizationId,
      isResolvingActiveOrg,
      isPracticesLoading: practicesLoading,
      hasPracticeMembership,
      defaultWorkspace,
      currentPracticeSlug,
      fallbackPracticeSlug,
      isSubscriptionSuccessReturn,
      isSubscriptionSyncInFlight: subscriptionSyncInFlight,
      currentPath: location.path,
    }),
    [
      isSessionPending,
      userId,
      isAnonymous,
      onboardingComplete,
      activeOrganizationId,
      isResolvingActiveOrg,
      practicesLoading,
      hasPracticeMembership,
      defaultWorkspace,
      currentPracticeSlug,
      fallbackPracticeSlug,
      isSubscriptionSuccessReturn,
      subscriptionSyncInFlight,
      location.path,
    ]
  );

  return computeRouteIntent(inputs);
}
