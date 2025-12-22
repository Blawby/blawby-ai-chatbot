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

  // Refetch practice data on mount to get latest subscription status
  // Staging-api handles all Stripe webhooks, so subscription should already be updated
  useEffect(() => {
    if (!targetPracticeId) return;
    
    // Refetch to ensure we have latest subscription status from staging-api
    // No explicit sync needed - staging-api webhooks handle subscription updates
    refetch().then(() => {
        setReady(true);
    }).catch((error) => {
      console.error('[ONBOARDING] Failed to refetch practice data:', error);
      setReady(true); // Still mark as ready to allow guards to run
    });
  }, [targetPracticeId, refetch]);

  

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
  );
};

export default BusinessOnboardingPage;
