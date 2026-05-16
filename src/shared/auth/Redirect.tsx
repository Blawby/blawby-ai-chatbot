import { useEffect, useRef } from 'preact/hooks';
import { useNavigation } from '@/shared/utils/navigation';

interface RedirectProps {
  /** Target URL. The redirect fires once per distinct value of `to`. */
  to: string;
  /**
   * If true, replaces the current history entry instead of pushing. Defaults
   * to true — gate-style redirects should not leave the previous URL in
   * history.
   */
  replace?: boolean;
}

/**
 * One-shot declarative redirect.
 *
 * Calls `route(to, replace)` once when mounted (or when `to` changes), then
 * renders `null`. The parent decides when to mount this component — usually
 * when a `RouteIntent` resolves to one of the redirect kinds.
 *
 * Tracks the last-fired target in a ref so the same `to` across re-renders
 * doesn't trigger duplicate navigations, which would push the browser into
 * a redirect loop with preact-iso's `route()` API.
 */
export function Redirect({ to, replace = true }: RedirectProps) {
  const { navigate } = useNavigation();
  const lastFiredRef = useRef<string | null>(null);

  useEffect(() => {
    if (lastFiredRef.current === to) return;
    lastFiredRef.current = to;
    navigate(to, replace);
  }, [to, replace, navigate]);

  return null;
}
