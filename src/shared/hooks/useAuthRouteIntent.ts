import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { useEnsureActiveOrganization } from '@/shared/hooks/useEnsureActiveOrganization';
import { useWorkspaceResolver } from '@/shared/hooks/useWorkspaceResolver';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { useNavigation } from '@/shared/utils/navigation';
import { getActiveOrganizationPointer } from '@/shared/lib/authClient';
import {
  computeRouteIntent,
  type RouteIntent,
  type RouteIntentInputs,
} from '@/shared/auth/routeIntent';

/**
 * Strip the `subscription` query parameter from a URL while preserving the
 * rest of the search string and fragment. Used by the post-Stripe success
 * path to remove `?subscription=success` so a reload doesn't re-trigger
 * the sync.
 */
function stripSubscriptionParam(url: string): string {
  const qIndex = url.indexOf('?');
  if (qIndex === -1) return '';
  const hashIndex = url.indexOf('#', qIndex);
  const queryString = hashIndex === -1 ? url.slice(qIndex + 1) : url.slice(qIndex + 1, hashIndex);
  const hash = hashIndex === -1 ? '' : url.slice(hashIndex);
  const params = new URLSearchParams(queryString);
  params.delete('subscription');
  const remaining = params.toString();
  return `${remaining ? `?${remaining}` : ''}${hash}`;
}

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
  const { navigate } = useNavigation();
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
  //
  // Error contract: if `forceResolve` fails, DO NOT call `refetchPractices`
  // (the org isn't activated yet, so the list would be stale) and DO NOT strip
  // the URL (so a reload can retry the sync). The in-flight flag always resets
  // so the intent's `post-stripe-syncing` kind doesn't stick around forever.
  useEffect(() => {
    if (!isSubscriptionSuccessReturn) {
      subscriptionSyncHandledRef.current = false;
      return;
    }
    if (subscriptionSyncHandledRef.current) return;

    subscriptionSyncHandledRef.current = true;
    setSubscriptionSyncInFlight(true);

    void (async () => {
      try {
        await forceResolve();
        await refetchPractices();
        // Success path: strip the query param so a reload doesn't re-trigger
        // the sync. Route through preact-iso so useLocation's reactive query
        // stays in sync — replaceState alone would leave stale state in the
        // router.
        const cleanUrl = `${location.path}${stripSubscriptionParam(location.url)}`;
        navigate(cleanUrl, true);
      } catch (error) {
        // Partial failure: leave the URL intact so the user can retry by
        // reloading. The recovery hook keeps its own per-error memoization
        // contract (post-PR #580: it does NOT memoize on transient failure).
        console.warn('[Workspace] post-Stripe sync failed; URL kept for retry', error);
      } finally {
        if (mountedRef.current) {
          setSubscriptionSyncInFlight(false);
        }
      }
    })();
  }, [forceResolve, isSubscriptionSuccessReturn, refetchPractices, navigate, location.path, location.url]);

  const user = session?.user;
  const userId = user?.id ?? null;
  const isAnonymous = user?.is_anonymous === true;
  const onboardingComplete = user?.onboarding_complete === true;

  const activeOrganizationId = getActiveOrganizationPointer(session);

  const currentPracticeSlug = currentPractice?.slug ?? null;

  // Pick a deterministic fallback so list reorderings don't shuffle the
  // intent's `practice-workspace.slug`. `currentPractice` is the
  // strongly-preferred source; only fall back to the membership list when no
  // current practice has been activated yet. Sort by id so the fallback is
  // stable across re-renders even if the API returns rows in a different
  // order (and so memoization can key on that stable id).
  const fallbackPracticeSlug = useMemo(() => {
    if (currentPractice?.slug) return currentPractice.slug;
    if (practices.length === 0) return null;
    const sorted = [...practices].sort((a, b) => (a.id ?? '').localeCompare(b.id ?? ''));
    return sorted[0]?.slug ?? null;
  }, [currentPractice?.slug, practices]);

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
