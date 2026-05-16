import type { WorkspacePreference } from '@/shared/types/workspace';

/**
 * Discriminated union describing where an authenticated (or
 * not-yet-authenticated) user should be in the app. Produced by
 * `computeRouteIntent` and consumed by `AuthenticatedRouter`.
 *
 * Loading is an explicit kind, not an implied "all flags false" state. Any
 * input being in-flight (session pending, practices loading, recovery
 * resolving, post-Stripe sync) returns `kind: 'loading'` so consumers can
 * render a loader instead of mis-routing while flags settle.
 */
/**
 * Why the intent is in `loading`. Carried as a tag so observability (logs,
 * tests) can distinguish a session that's still resolving from one that's
 * processing the post-Stripe round-trip — without the consumer having to
 * branch on a separate kind.
 */
export type RouteLoadingReason =
  | 'session-pending'
  | 'recovery-resolving'
  | 'practices-loading'
  | 'practices-pending'
  | 'post-stripe-syncing'
  | 'practice-slug-pending'
  | 'on-onboarding-route';

export type RouteIntent =
  /** Any required input is still in-flight. Render a loader; never redirect. */
  | { kind: 'loading'; reason?: RouteLoadingReason }
  /** No authenticated user. Send to /auth, optionally preserving where they were headed. */
  | { kind: 'unauthenticated'; redirectAfterAuth?: string }
  /** Authenticated but onboarding incomplete. Send to /onboarding. */
  | { kind: 'onboarding-required'; userId: string; returnTo?: string }
  /** Authenticated and onboarded but no practice membership. Send to /pricing. */
  | { kind: 'no-subscription' }
  /** Practice-default user. Send to /practice/{slug}. */
  | { kind: 'practice-workspace'; slug: string }
  /** Client-default user. Send to /client/dashboard. */
  | { kind: 'client-workspace' };

export interface RouteIntentInputs {
  isSessionPending: boolean;
  user:
    | { id: string; isAnonymous: boolean; onboardingComplete: boolean }
    | null;
  activeOrganizationId: string | null;
  isResolvingActiveOrg: boolean;
  isPracticesLoading: boolean;
  hasPracticeMembership: boolean;
  defaultWorkspace: WorkspacePreference | null;
  currentPracticeSlug: string | null;
  fallbackPracticeSlug: string | null;
  isSubscriptionSuccessReturn: boolean;
  isSubscriptionSyncInFlight: boolean;
  /** Pathname only (e.g. `/practice/foo`). Used to skip redundant redirects. */
  currentPath: string;
}

/**
 * Pure computation of "where should this user be?".
 *
 * Decision tree (early returns, evaluated top-to-bottom):
 *   1. session pending → loading
 *   2. no user → unauthenticated
 *   3. anonymous user → workspace kinds (skipping onboarding/subscription gates)
 *   4. onboarding incomplete → onboarding-required (unless already on /onboarding)
 *   5. ?subscription=success + sync in flight → post-stripe-syncing
 *   6. recovery resolving OR practices loading → loading (THE fix for the /pricing flash)
 *   7. no membership AND no active org → no-subscription
 *   8. default workspace is client (or no practice access) → client-workspace
 *   9. otherwise → practice-workspace
 */
export function computeRouteIntent(inputs: RouteIntentInputs): RouteIntent {
  const {
    isSessionPending,
    user,
    activeOrganizationId,
    isResolvingActiveOrg,
    isPracticesLoading,
    hasPracticeMembership,
    defaultWorkspace,
    currentPracticeSlug,
    fallbackPracticeSlug,
    isSubscriptionSuccessReturn,
    isSubscriptionSyncInFlight,
    currentPath,
  } = inputs;

  if (isSessionPending) {
    return { kind: 'loading', reason: 'session-pending' };
  }

  if (!user) {
    const redirectAfterAuth = computeRedirectAfterAuth(currentPath);
    return redirectAfterAuth
      ? { kind: 'unauthenticated', redirectAfterAuth }
      : { kind: 'unauthenticated' };
  }

  // Anonymous users bypass onboarding AND subscription gates entirely. They
  // land in the workspace kinds; downstream guards surface access-denied if
  // the route is unreachable for an anonymous identity.
  if (!user.isAnonymous && !user.onboardingComplete) {
    if (currentPath.startsWith('/onboarding')) {
      return { kind: 'loading', reason: 'on-onboarding-route' };
    }
    const returnTo = computeOnboardingReturnTo(currentPath);
    return returnTo
      ? { kind: 'onboarding-required', userId: user.id, returnTo }
      : { kind: 'onboarding-required', userId: user.id };
  }

  if (isSubscriptionSuccessReturn && isSubscriptionSyncInFlight) {
    return { kind: 'loading', reason: 'post-stripe-syncing' };
  }

  // THE FIX: loading is a first-class kind. Inputs in flight → loading, NOT
  // "no-subscription". Pre-refactor the gate read `hasPracticeMembership: false`
  // while practices were still loading and routed to /pricing.
  if (isResolvingActiveOrg) {
    return { kind: 'loading', reason: 'recovery-resolving' };
  }
  if (isPracticesLoading) {
    return { kind: 'loading', reason: 'practices-loading' };
  }

  // Belt-and-braces from the convention doc: a non-null active_organization_id
  // is independent proof of membership. Never gate at /pricing while it's set.
  // Anonymous users always skip this gate.
  if (!user.isAnonymous && !hasPracticeMembership && !activeOrganizationId) {
    return { kind: 'no-subscription' };
  }

  // Inconsistency: session has activeOrg set but workspace resolver hasn't
  // seen the practice list yet. Better Auth only sets active_organization_id
  // after a member-link exists (per the convention doc), so this state implies
  // the practices fetch is pending or stale. Return loading rather than
  // emitting a client-workspace kick-out for a user who's about to be
  // recognized as a practice member.
  if (!user.isAnonymous && activeOrganizationId && !hasPracticeMembership) {
    return { kind: 'loading', reason: 'practices-pending' };
  }

  const slug = normalizeSlug(currentPracticeSlug) ?? normalizeSlug(fallbackPracticeSlug);

  if (defaultWorkspace === 'client' || !hasPracticeMembership) {
    return { kind: 'client-workspace' };
  }

  if (!slug) {
    // Practice user but no resolvable slug yet — keep loading rather than
    // emitting a `practice-workspace` with no destination.
    return { kind: 'loading', reason: 'practice-slug-pending' };
  }

  return { kind: 'practice-workspace', slug };
}

const AUTH_RETURN_BLOCKED_PATHS = new Set(['/', '/auth', '/auth/accept-invitation']);

function computeRedirectAfterAuth(currentPath: string): string | undefined {
  if (!currentPath || AUTH_RETURN_BLOCKED_PATHS.has(currentPath)) return undefined;
  if (currentPath.startsWith('/auth')) return undefined;
  if (currentPath.startsWith('/public/')) return undefined;
  return currentPath;
}

function computeOnboardingReturnTo(currentPath: string): string | undefined {
  if (!currentPath) return undefined;
  if (currentPath.startsWith('/onboarding')) return undefined;
  if (currentPath.startsWith('/auth')) return undefined;
  if (currentPath === '/') return undefined;
  return currentPath;
}

function normalizeSlug(value: string | null): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Exhaustiveness helper for `switch (intent.kind)`. A new kind added to
 * `RouteIntent` without a matching case will fail to typecheck where
 * `assertNeverIntent` is called.
 */
export function assertNeverIntent(value: never): never {
  throw new Error(`Unhandled RouteIntent kind: ${JSON.stringify(value)}`);
}
