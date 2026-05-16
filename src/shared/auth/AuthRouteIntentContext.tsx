import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import { useAuthRouteIntent } from '@/shared/hooks/useAuthRouteIntent';
import type { RouteIntent } from '@/shared/auth/routeIntent';
import type { ComponentChildren } from 'preact';

/**
 * Context that hoists the route intent to a single producer. AppShell mounts
 * `<AuthRouteIntentProvider>` so `useAuthRouteIntent` is called exactly once
 * per tree; downstream consumers (RootRoute, AuthenticatedRouter) read the
 * value via `useAuthRouteIntentValue()` instead of calling the hook again.
 *
 * Pre-refactor RootRoute called `useAuthRouteIntent` separately. That
 * doubled the cost (two recovery-hook calls, two practice-list fetches) and
 * — more importantly — could produce intent kinds that differed from
 * AppShell's view if the underlying inputs flipped between the two reads.
 */
const AuthRouteIntentContext = createContext<RouteIntent | null>(null);

interface AuthRouteIntentProviderProps {
  /**
   * Whether to auto-fetch the practice list. Pass `false` for routes where
   * practice membership is not relevant (e.g. /public, /auth, /onboarding).
   */
  autoFetchPractices?: boolean;
  children: ComponentChildren;
}

export function AuthRouteIntentProvider({
  autoFetchPractices = true,
  children,
}: AuthRouteIntentProviderProps) {
  const intent = useAuthRouteIntent({ autoFetchPractices });
  return (
    <AuthRouteIntentContext.Provider value={intent}>
      {children}
    </AuthRouteIntentContext.Provider>
  );
}

/**
 * Read the current route intent. Must be called inside an
 * `<AuthRouteIntentProvider>` — throws otherwise to surface configuration
 * errors at the consumer instead of returning a misleading default.
 */
export function useAuthRouteIntentValue(): RouteIntent {
  const value = useContext(AuthRouteIntentContext);
  if (value === null) {
    throw new Error(
      'useAuthRouteIntentValue must be called inside <AuthRouteIntentProvider>'
    );
  }
  return value;
}
