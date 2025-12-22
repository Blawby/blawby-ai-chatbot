import { useState, useEffect, useCallback, useMemo, useRef } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import BusinessOnboardingModal from '../onboarding/BusinessOnboardingModal';
import { usePracticeManagement } from '../../hooks/usePracticeManagement';
import { useNavigation } from '../../utils/navigation';
import { useToastContext } from '../../contexts/ToastContext';
import { resolvePracticeKind, normalizeSubscriptionStatus } from '../../utils/subscription';
import { isForcePaidEnabled } from '../../utils/devFlags';
import type { OnboardingStep } from '../onboarding/hooks/useStepValidation';
import {
  updatePractice
} from '../../lib/apiClient';
import {
  buildPracticeOnboardingMetadata,
  extractProgressFromPracticeMetadata,
  ONBOARDING_STEP_SEQUENCE,
  type OnboardingStatusValue
} from '../../utils/practiceOnboarding';

export const BusinessOnboardingPage = () => {
  const location = useLocation();
  const { navigate } = useNavigation();
  const { currentPractice, practices, refetch, loading, error } = usePracticeManagement();
  const { showSuccess, showError } = useToastContext();
  const devForcePaid = isForcePaidEnabled();
  const [isOpen] = useState(true);
  const [ready, setReady] = useState(false);
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const [refetchError, setRefetchError] = useState<Error | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const completionRef = useRef(false);

  // Derive step from URL path like /business-onboarding/:step
  const currentStepFromUrl: OnboardingStep = useMemo(() => {
    const segments = location.path.split('/').filter(Boolean);
    const stepCandidate = segments[1] as OnboardingStep | undefined;
    if (!stepCandidate) return 'welcome';
    return (ONBOARDING_STEP_SEQUENCE as string[]).includes(stepCandidate) ? stepCandidate : 'welcome';
  }, [location.path]);

  const practiceId = currentPractice?.id ?? practices?.[0]?.id ?? null;
  
  const targetPractice = useMemo(() => {
    if (currentPractice) {
      return currentPractice;
    }
    const upgraded = practices?.find(org => resolvePracticeKind(org.kind, org.isPersonal ?? null) === 'business');
    return upgraded ?? practices?.[0] ?? null;
  }, [practices, currentPractice]);
  
  const targetPracticeId = targetPractice?.id ?? practiceId;
  const metadataSource = targetPractice?.config?.metadata;
  const onboardingProgress = useMemo(
    () => extractProgressFromPracticeMetadata(metadataSource),
    [metadataSource]
  );
  const onboardingStatus = onboardingProgress?.status;
  const markOnboardingStatus = useCallback(
    async (status: OnboardingStatusValue) => {
      if (!targetPracticeId) return;
      try {
        const metadata = buildPracticeOnboardingMetadata(metadataSource, {
          status,
          savedAt: Date.now()
        });
        await updatePractice(targetPracticeId, { metadata });
        await refetch();
      } catch (error) {
        console.error(`[ONBOARDING][STATUS] Failed to update status to ${status}`, error);
        throw error;
      }
    },
    [targetPracticeId, metadataSource, refetch]
  );

  // Local timeout to avoid indefinite spinner when practices loading takes too long
  useEffect(() => {
    let timeoutId: number | undefined;
    if (loading) {
      timeoutId = window.setTimeout(() => setLoadTimedOut(true), 15000);
    } else {
      setLoadTimedOut(false);
    }
    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [loading]);

  // Clear timeout flag once we have a target practice
  useEffect(() => {
    if (targetPracticeId) {
      setLoadTimedOut(false);
    }
  }, [targetPracticeId]);

  // Retry function with exponential backoff (3 attempts: 500ms, 1000ms, 2000ms)
  const refetchWithRetry = useCallback(async (): Promise<void> => {
    const delays = [500, 1000, 2000];
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await refetch();
        setReady(true);
        setRefetchError(null);
        setIsRetrying(false);
        return; // Success - exit early
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`[ONBOARDING] Refetch attempt ${attempt + 1}/3 failed:`, lastError);

        // If this is not the last attempt, wait before retrying
        if (attempt < 2) {
          const delay = delays[attempt];
          console.log(`[ONBOARDING] Retrying in ${delay}ms...`);
          setIsRetrying(true);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All retries failed
    console.error('[ONBOARDING] All refetch attempts failed after 3 retries:', lastError);
    setRefetchError(lastError);
    setIsRetrying(false);
    setReady(false); // Keep ready=false to prevent guards from running with stale data
  }, [refetch]);

  // Refetch practice data on mount to get latest subscription status
  // Staging-api handles all Stripe webhooks, so subscription should already be updated
  useEffect(() => {
    if (!targetPracticeId) return;
    
    // Reset error state when targetPracticeId changes
    setRefetchError(null);
    setIsRetrying(false);
    setReady(false);
    
    // Refetch to ensure we have latest subscription status from staging-api
    // No explicit sync needed - staging-api webhooks handle subscription updates
    void refetchWithRetry();
  }, [targetPracticeId, refetchWithRetry]);

  // Manual retry handler for user-triggered retry
  const handleRetryRefetch = useCallback(() => {
    setRefetchError(null);
    setIsRetrying(true);
    void refetchWithRetry();
  }, [refetchWithRetry]);

  // Cancel handler - allow user to proceed with potentially stale data
  const handleCancelRefetch = useCallback(() => {
    console.warn('[ONBOARDING] User chose to proceed with potentially stale subscription data');
    setRefetchError(null);
    setIsRetrying(false);
    setReady(true); // Allow guards to run, but user is aware of potential stale data
  }, []);

  

  // Guard: Only allow business/enterprise tiers (after initial sync ready)
  useEffect(() => {
    if (!ready || !targetPractice) return;
    if (devForcePaid) {
      console.debug('[ONBOARDING][DEV_FORCE_PAID] Bypassing subscription eligibility guard.');
      return;
    }
    const resolvedKind = resolvePracticeKind(targetPractice.kind, targetPractice.isPersonal ?? null);
    const resolvedStatus = normalizeSubscriptionStatus(targetPractice.subscriptionStatus, resolvedKind);
    const allowedStatuses = new Set(['active', 'trialing', 'paused']);
    const eligible = resolvedKind === 'business' && allowedStatuses.has(resolvedStatus);
    if (!eligible) {
      console.warn('❌ Onboarding access denied: insufficient subscription state', {
        kind: resolvedKind,
        status: resolvedStatus,
      });
      showError('Not Available', 'Business onboarding is only available for active business subscriptions.');
      navigate('/');
    }
  }, [ready, targetPractice, showError, navigate, devForcePaid]);

  // Guard: Redirect if onboarding already completed
  useEffect(() => {
    if (!ready || !targetPracticeId) return;
    if (onboardingStatus === 'completed' && !completionRef.current) {
      console.log('✅ Onboarding already completed, redirecting');
      showSuccess('Setup Complete', 'Your business profile is already configured.');
      navigate('/');
    }
  }, [ready, targetPracticeId, onboardingStatus, showSuccess, navigate]);

  const handleComplete = useCallback(async () => {
    if (!targetPracticeId) return;

    completionRef.current = true;
    try {
      await refetch();
      showSuccess('Setup Complete!', 'Your business profile is ready.');
      navigate('/');
    } catch (error) {
      console.error('Failed to finalize onboarding:', error);
      showError('Error', 'Could not refresh onboarding status');
    }
  }, [targetPracticeId, refetch, showSuccess, showError, navigate]);

  const handleClose = useCallback(async () => {
    if (!targetPracticeId) {
      navigate('/');
      return;
    }

    if (completionRef.current) {
      navigate('/');
      return;
    }

    try {
      await markOnboardingStatus('skipped');
    } catch (error) {
      console.error('Failed to mark onboarding skipped:', error);
    }

    navigate('/');
  }, [targetPracticeId, navigate, markOnboardingStatus]);

  const handleStepChangeFromModal = useCallback((nextStep: OnboardingStep) => {
    // Prevent feedback loops: if URL already reflects this step, do nothing
    if (nextStep === currentStepFromUrl) return;
    try {
      const url = new URL(window.location.href);
      const search = url.search; // preserve all existing query params
      const base = '/business-onboarding';
      const nextPath = nextStep === 'welcome' ? base : `${base}/${nextStep}`;
      navigate(`${nextPath}${search}`, true);
    } catch {
      const base = '/business-onboarding';
      const nextPath = nextStep === 'welcome' ? base : `${base}/${nextStep}`;
      navigate(nextPath, true);
    }
  }, [navigate, currentStepFromUrl]);


  if (!targetPracticeId) {
    if (error || loadTimedOut) {
      const displayMessage = error
        ? (() => {
            if (typeof error === 'string') return error;
            if (error && typeof (error as { message?: unknown }).message === 'string') {
              const msg = (error as { message?: unknown }).message as string | undefined;
              return msg || 'An unexpected error occurred.';
            }
            try {
              const str = JSON.stringify(error);
              return str && str !== '{}' ? str : 'An unexpected error occurred.';
            } catch {
              return 'An unexpected error occurred.';
            }
          })()
        : 'Request timed out while loading practices.';
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <p className="text-red-600 mb-3">{displayMessage}</p>
            <button
              onClick={() => { setLoadTimedOut(false); void refetch(); }}
              className="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }

    if (!loading && (!practices || practices.length === 0)) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <p className="text-gray-700 mb-2">No practices found for your account.</p>
            <button
              onClick={() => navigate('/')}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
            >
              Go Home
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading your practices...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Retry banner for refetch errors */}
      {(refetchError || isRetrying) && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-50 border-b border-yellow-200 shadow-md">
          <div className="max-w-7xl mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {isRetrying ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-yellow-600" />
                    <p className="text-yellow-800 text-sm font-medium">
                      Retrying to fetch latest subscription data...
                    </p>
                  </>
                ) : (
                  <>
                    <svg
                      className="h-5 w-5 text-yellow-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                      />
                    </svg>
                    <div className="flex-1">
                      <p className="text-yellow-800 text-sm font-medium">
                        Failed to fetch latest subscription data
                      </p>
                      <p className="text-yellow-700 text-xs mt-1">
                        {refetchError?.message || 'Unable to refresh subscription status. You may proceed, but data may be stale.'}
                      </p>
                    </div>
                  </>
                )}
              </div>
              {!isRetrying && (
                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={handleRetryRefetch}
                    className="px-3 py-1.5 bg-yellow-600 text-white text-sm font-medium rounded hover:bg-yellow-700 transition-colors"
                  >
                    Retry
                  </button>
                  <button
                    onClick={handleCancelRefetch}
                    className="px-3 py-1.5 bg-yellow-100 text-yellow-800 text-sm font-medium rounded hover:bg-yellow-200 transition-colors"
                  >
                    Proceed Anyway
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <BusinessOnboardingModal
        isOpen={isOpen}
        practiceId={targetPracticeId}
        practiceName={targetPractice?.name}
        fallbackContactEmail={targetPractice?.config?.ownerEmail}
        onClose={handleClose}
        onCompleted={handleComplete}
        currentStepFromUrl={currentStepFromUrl}
        onStepChange={handleStepChangeFromModal}
      />
    </>
  );
};

export default BusinessOnboardingPage;
