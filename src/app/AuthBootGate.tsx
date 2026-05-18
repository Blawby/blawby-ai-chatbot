import type { ComponentChildren } from 'preact';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { LoadingScreen } from '@/shared/ui/layout/LoadingScreen';

/**
 * Renders a single full-screen LoadingScreen while the session is still
 * resolving on cold load. Once `isPending` flips false, mounts the
 * children — every downstream route can assume session is ready (either
 * authenticated, anonymous, or null) and skip its own `sessionPending`
 * check.
 *
 * Sits between SessionProvider and AppShell so all per-route session
 * checks become redundant. Routes still pull `session` from context;
 * they no longer need to gate on `isPending`.
 */
export function AuthBootGate({ children }: { children: ComponentChildren }) {
  const { isPending } = useSessionContext();
  if (isPending) {
    return <LoadingScreen minDurationMs={150} />;
  }
  return <>{children}</>;
}
