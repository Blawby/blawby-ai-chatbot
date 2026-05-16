import type { ComponentChildren } from 'preact';
import { assertNeverIntent, type RouteIntent } from '@/shared/auth/routeIntent';
import { Redirect } from '@/shared/auth/Redirect';

interface AuthenticatedRouterProps {
  intent: RouteIntent;
  currentPath: string;
  /**
   * What to render while the intent is in `loading`. Defaults to `null` so
   * AppShell (which mounts AuthenticatedRouter as a side-effect-only sibling
   * of the Router) doesn't paint anything during the brief loading window.
   * RootRoute passes `<LoadingScreen />` because it's the entire page body.
   */
  loadingFallback?: ComponentChildren;
}

/**
 * Side-effect-only consumer for a `RouteIntent`. Mounted as a sibling of the
 * application's `<Router>`. Emits a `<Redirect>` when the intent requires
 * routing the user away from the current path; otherwise renders
 * `loadingFallback` (defaults to `null`) and lets the matched route render
 * normally.
 *
 * Routes like `/auth`, `/pricing`, and `/onboarding` are kept reachable by
 * design — if the user is already on the destination of a redirect kind,
 * `AuthenticatedRouter` returns `null`. This matches the side-channel
 * behavior of the pre-refactor `useEffect`-and-`navigate()` gate without
 * unmounting the Router or hiding intermediate routes.
 *
 * For workspace kinds the only branch that emits a redirect is the
 * "wandered into /onboarding after completing it" case — preserved verbatim
 * from the previous AppShell gate.
 */
export function AuthenticatedRouter({
  intent,
  currentPath,
  loadingFallback = null,
}: AuthenticatedRouterProps) {
  switch (intent.kind) {
    case 'loading':
      return <>{loadingFallback}</>;

    case 'unauthenticated': {
      if (currentPath.startsWith('/auth')) return null;
      const target = intent.redirectAfterAuth
        ? `/auth?redirect=${encodeURIComponent(intent.redirectAfterAuth)}`
        : '/auth';
      return <Redirect to={target} />;
    }

    case 'onboarding-required': {
      if (currentPath.startsWith('/onboarding')) return null;
      const target = intent.returnTo
        ? `/onboarding?returnTo=${encodeURIComponent(intent.returnTo)}`
        : '/onboarding';
      return <Redirect to={target} />;
    }

    case 'no-subscription': {
      if (currentPath.startsWith('/pricing')) return null;
      return <Redirect to="/pricing" />;
    }

    case 'practice-workspace': {
      // Only kick the user out of /onboarding once it's complete. Every other
      // path is reachable — practice workspace routes match their own UIs,
      // pricing/auth stay reachable for upgrade/sign-in flows.
      if (currentPath.startsWith('/onboarding')) {
        return <Redirect to={`/practice/${intent.slug}`} />;
      }
      return null;
    }

    case 'client-workspace': {
      if (currentPath.startsWith('/onboarding')) {
        return <Redirect to="/client/dashboard" />;
      }
      return null;
    }

    default:
      return assertNeverIntent(intent);
  }
}
