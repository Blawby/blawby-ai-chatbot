import { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { LoadingScreen } from '@/shared/ui/layout/LoadingScreen';

interface AppGuardProps {
  children: ComponentChildren;
}

/**
 * AppGuard wraps the entire app and handles cross-cutting concerns that must
 * run on every route.
 *
 * Current responsibilities:
 *   1. Post-subscription sync — when Stripe redirects back with `?subscription=success`,
 *      we re-fetch practices so the frontend reflects the new subscription state immediately.
 *
 * Removed (for history):
 *   - Onboarding enforcement: moved to per-route checks in AppShell/RootRoute so that
 *     public workspace routes never redirect anonymous users to /onboarding.
 *
 * Planned:
 *   - Keep AppGuard limited to app-wide side effects. Route access and workspace
 *     selection should stay in the dedicated routing/resolver hooks.
 */
export function AppGuard({ children }: AppGuardProps) {
  const { refetch: refetchPractices } = usePracticeManagement({
    autoFetchPractices: false, // Handled manually here during sync
  });
  const subscriptionSuccessHandledRef = useRef(false);
  const [isSyncingSubscription, setIsSyncingSubscription] = useState(false);

  // Re-fetch practice data when Stripe completes a checkout and redirects back.
  // We read the flag in a ref so we only run this once even if the component
  // re-renders before the async refetch resolves.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (subscriptionSuccessHandledRef.current) return;

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('subscription') !== 'success') return;

    subscriptionSuccessHandledRef.current = true;
    setIsSyncingSubscription(true);

    if (import.meta.env.DEV) {
      console.debug('[AppGuard] Syncing practice data after Stripe checkout');
    }

    void refetchPractices()
      .then(() => {
        if (import.meta.env.DEV) {
          console.debug('[AppGuard] Practice data synced');
        }
      })
      .catch((error) => {
        console.error('[AppGuard] Failed to sync practice data after subscription', error);
      })
      .finally(() => {
        // Remove the flag so a refresh doesn't re-trigger the sync unnecessarily
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete('subscription');
        window.history.replaceState({}, '', `${newUrl.pathname}${newUrl.search}${newUrl.hash}`);
        setIsSyncingSubscription(false);
      });
  }, [refetchPractices]);

  if (isSyncingSubscription) {
    return <LoadingScreen />;
  }

  return <>{children}</>;
}
