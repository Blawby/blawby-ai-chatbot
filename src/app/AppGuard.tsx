import { ComponentChildren } from 'preact';

interface AppGuardProps {
  children: ComponentChildren;
}

/**
 * AppGuard is intentionally a thin wrapper.
 * Route-level access and post-auth/subscription routing are handled in AppShell/RootRoute.
 */
export function AppGuard({ children }: AppGuardProps) {
  return <>{children}</>;
}
