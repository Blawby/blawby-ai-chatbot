import { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { getPreferencesCategory } from '@/shared/lib/preferencesApi';
import type { OnboardingPreferences } from '@/shared/types/preferences';

interface AppGuardProps {
  children: ComponentChildren;
}

/**
 * AppGuard handles high-level application state enforcement:
 * 1. Onboarding completion checks
 * 2. Post-subscription data synchronization
 * 3. Workspace state consistency
 */
export function AppGuard({ children }: AppGuardProps) {
  const { session, isPending: sessionIsPending, isAnonymous } = useSessionContext();
  const { refetch: refetchPractices } = usePracticeManagement({ 
    autoFetchPractices: false // Handled manually here during sync
  });
  const location = useLocation();
  
  const onboardingCheckRef = useRef(false);
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

  // 2. Handle Onboarding Check
  useEffect(() => {
    const resetOnboardingCheck = () => {
      onboardingCheckRef.current = false;
    };

    // Skip if session is loading, user is anonymous, or we're on public/auth routes
    const isAuthPage = location.path.startsWith('/auth');
    const isPublicPage = location.path.startsWith('/embed') || location.path.startsWith('/preview');
    
    if (sessionIsPending || isAnonymous || !session?.user?.id || isAuthPage || isPublicPage) {
      return resetOnboardingCheck;
    }

    if (typeof window === 'undefined') {
      return resetOnboardingCheck;
    }
    
    // Skip onboarding check if user is in the middle of a successful subscription flow
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('subscription') === 'success') {
      return resetOnboardingCheck;
    }
    
    if (onboardingCheckRef.current) return resetOnboardingCheck;
    onboardingCheckRef.current = true;

    const checkOnboarding = async () => {
      try {
        const prefs = await getPreferencesCategory<OnboardingPreferences>('onboarding');
        const needsOnboarding = prefs?.completed !== true;

        if (needsOnboarding) {
          if (import.meta.env.DEV) {
            console.debug('[AppGuard][ONBOARDING] Redirecting to onboarding flow');
          }
          // use window.location for hard redirect to ensure state is clean
          window.location.href = '/auth?mode=signin&onboarding=true';
        }
      } catch (error) {
        console.warn('[AppGuard][ONBOARDING] Preference check failed:', error);
        onboardingCheckRef.current = false;
      }
    };

    void checkOnboarding();
    return resetOnboardingCheck;
  }, [isAnonymous, session?.user?.id, sessionIsPending, location.path]);

  return <>{children}</>;
}
