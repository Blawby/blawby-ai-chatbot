import { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';

interface AppGuardProps {
  children: ComponentChildren;
}

/**
 * AppGuard handles high-level application state enforcement:
 * 1. Post-subscription data synchronization
 */
export function AppGuard({ children }: AppGuardProps) {
  const { refetch: refetchPractices } = usePracticeManagement({ 
    autoFetchPractices: false // Handled manually here during sync
  });
  const subscriptionSuccessHandledRef = useRef(false);

  // 1. Handle Subscription Success Sync
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (subscriptionSuccessHandledRef.current) return;
    
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('subscription') !== 'success') return;
    
    subscriptionSuccessHandledRef.current = true;
    
    if (import.meta.env.DEV) {
      console.debug('[AppGuard][SUBSCRIPTION] Syncing data after Stripe checkout');
    }
    
    // Refetch practices and session to ensure the frontend reflects the new subscription
    void refetchPractices().then(() => {
      if (import.meta.env.DEV) {
        console.debug('[AppGuard][SUBSCRIPTION] Data synced successfully');
      }
      
      // Clean up the URL to prevent re-triggering on refresh
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('subscription');
      window.history.replaceState({}, '', `${newUrl.pathname}${newUrl.search}${newUrl.hash}`);
    }).catch((error) => {
      console.error('[AppGuard][SUBSCRIPTION] Failed to sync data:', error);
    });
  }, [refetchPractices]);

  // 2. Onboarding enforcement removed (no automatic redirect).

  return <>{children}</>;
}
