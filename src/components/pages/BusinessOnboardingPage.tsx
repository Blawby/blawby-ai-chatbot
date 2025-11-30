import { useState, useEffect, useCallback, useMemo, useRef } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import BusinessOnboardingModal from '../onboarding/BusinessOnboardingModal';
import { useOrganizationManagement } from '../../hooks/useOrganizationManagement';
import { useNavigation } from '../../utils/navigation';
import { useToastContext } from '../../contexts/ToastContext';
import { resolveOrganizationKind, normalizeSubscriptionStatus } from '../../utils/subscription';
import { isForcePaidEnabled } from '../../utils/devFlags';
import type { OnboardingStep } from '../onboarding/hooks/useStepValidation';
import {
  syncSubscription as syncSubscriptionRequest,
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
  const { currentOrganization, organizations, refetch, loading, error } = useOrganizationManagement();
  const { showSuccess, showError } = useToastContext();
  const devForcePaid = isForcePaidEnabled();
  const [isOpen] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [ready, setReady] = useState(false);
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  // Track in-flight sync status across renders (separate from UI state)
  const isSyncInProgressRef = useRef(false);
  const completionRef = useRef(false);

  // Derive step from URL path like /business-onboarding/:step
  const currentStepFromUrl: OnboardingStep = useMemo(() => {
    const segments = location.path.split('/').filter(Boolean);
    const stepCandidate = segments[1] as OnboardingStep | undefined;
    if (!stepCandidate) return 'welcome';
    return (ONBOARDING_STEP_SEQUENCE as string[]).includes(stepCandidate) ? stepCandidate : 'welcome';
  }, [location.path]);

  const organizationId = currentOrganization?.id ?? organizations?.[0]?.id ?? null;
  
  const targetOrganization = useMemo(() => {
    if (currentOrganization) {
      return currentOrganization;
    }
    const upgraded = organizations?.find(org => resolveOrganizationKind(org.kind, org.isPersonal ?? null) === 'business');
    return upgraded ?? organizations?.[0] ?? null;
  }, [organizations, currentOrganization]);
  
  const targetOrganizationId = targetOrganization?.id ?? organizationId;
  const shouldSync = (Array.isArray(location.query?.sync) ? location.query?.sync[0] : location.query?.sync) === '1';
  const metadataSource = targetOrganization?.config?.metadata;
  const onboardingProgress = useMemo(
    () => extractProgressFromPracticeMetadata(metadataSource),
    [metadataSource]
  );
  const onboardingStatus = onboardingProgress?.status;
  const markOnboardingStatus = useCallback(
    async (status: OnboardingStatusValue) => {
      if (!targetOrganizationId) return;
      try {
        const metadata = buildPracticeOnboardingMetadata(metadataSource, {
          status,
          savedAt: Date.now()
        });
        await updatePractice(targetOrganizationId, { metadata });
        await refetch();
      } catch (error) {
        console.error(`[ONBOARDING][STATUS] Failed to update status to ${status}`, error);
        throw error;
      }
    },
    [targetOrganizationId, metadataSource, refetch]
  );

  // Local timeout to avoid indefinite spinner when organizations loading takes too long
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

  // Clear timeout flag once we have a target organization
  useEffect(() => {
    if (targetOrganizationId) {
      setLoadTimedOut(false);
    }
  }, [targetOrganizationId]);

  // Sync subscription data on mount if needed
  useEffect(() => {
    const inFlightRef = isSyncInProgressRef;
    const syncSubscription = async () => {
      // If no sync is needed, mark as ready so downstream guards can run
      if (!shouldSync) {
        setReady(true);
        return;
      }

      if (!targetOrganizationId || inFlightRef.current) return;
      console.debug('[ONBOARDING][SYNC] Starting subscription sync for org:', targetOrganizationId);
      
      inFlightRef.current = true;
      setSyncing(true);
      try {
        const result = await syncSubscriptionRequest(targetOrganizationId, {
          headers: devForcePaid ? { 'x-test-force-paid': '1' } : undefined
        });

        await refetch();

        if (result.synced) {
          showSuccess('Payment Successful', 'Your subscription has been activated!');
        }
      } catch (error) {
        console.error('Sync failed:', error);
        showError('Sync Failed', 'Could not refresh subscription status');
      } finally {
        inFlightRef.current = false;
        setSyncing(false);
        // Clean up URL
        try {
          const newUrl = new URL(window.location.href);
          newUrl.searchParams.delete('sync');
          window.history.replaceState({}, '', newUrl.toString());
          console.debug('[ONBOARDING][SYNC] Sync done. Cleaned URL.');
        } catch (_e) {
          // noop
        }
        setReady(true);
      }
    };

    syncSubscription();
  }, [shouldSync, targetOrganizationId, refetch, showSuccess, showError, devForcePaid]);

  

  // Guard: Only allow business/enterprise tiers (after initial sync ready)
  useEffect(() => {
    if (!ready || !targetOrganization) return;
    if (devForcePaid) {
      console.debug('[ONBOARDING][DEV_FORCE_PAID] Bypassing subscription eligibility guard.');
      return;
    }
    const resolvedKind = resolveOrganizationKind(targetOrganization.kind, targetOrganization.isPersonal ?? null);
    const resolvedStatus = normalizeSubscriptionStatus(targetOrganization.subscriptionStatus, resolvedKind);
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
  }, [ready, targetOrganization, showError, navigate, devForcePaid]);

  // Guard: Redirect if onboarding already completed
  useEffect(() => {
    if (!ready || !targetOrganizationId) return;
    if (onboardingStatus === 'completed' && !completionRef.current) {
      console.log('✅ Onboarding already completed, redirecting');
      showSuccess('Setup Complete', 'Your business profile is already configured.');
      navigate('/');
    }
  }, [ready, targetOrganizationId, onboardingStatus, showSuccess, navigate]);

  const handleComplete = useCallback(async () => {
    if (!targetOrganizationId) return;

    completionRef.current = true;
    try {
      await refetch();
      showSuccess('Setup Complete!', 'Your business profile is ready.');
      navigate('/');
    } catch (error) {
      console.error('Failed to finalize onboarding:', error);
      showError('Error', 'Could not refresh onboarding status');
    }
  }, [targetOrganizationId, refetch, showSuccess, showError, navigate]);

  const handleClose = useCallback(async () => {
    if (!targetOrganizationId) {
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
  }, [targetOrganizationId, navigate, markOnboardingStatus]);

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

  if (syncing) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4" />
          <p className="text-gray-600">Activating your subscription...</p>
        </div>
      </div>
    );
  }

  if (!targetOrganizationId) {
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
        : 'Request timed out while loading organizations.';
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

    if (!loading && (!organizations || organizations.length === 0)) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <p className="text-gray-700 mb-2">No organizations found for your account.</p>
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
          <p className="text-gray-600">Loading your organizations...</p>
        </div>
      </div>
    );
  }

  return (
    <BusinessOnboardingModal
      isOpen={isOpen}
      organizationId={targetOrganizationId}
      organizationName={targetOrganization?.name}
      fallbackContactEmail={targetOrganization?.config?.ownerEmail}
      onClose={handleClose}
      onCompleted={handleComplete}
      currentStepFromUrl={currentStepFromUrl}
      onStepChange={handleStepChangeFromModal}
    />
  );
};

export default BusinessOnboardingPage;
