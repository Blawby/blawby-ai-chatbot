import { useState, useEffect, useCallback } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import BusinessOnboardingModal from '../onboarding/BusinessOnboardingModal';
import { useOrganizationManagement } from '../../hooks/useOrganizationManagement';
import { useMemo } from 'preact/hooks';
import { useNavigation } from '../../utils/navigation';
import { useToastContext } from '../../contexts/ToastContext';

export const BusinessOnboardingPage = () => {
  const location = useLocation();
  const { navigate } = useNavigation();
  const { currentOrganization, organizations, refetch, loading, error } = useOrganizationManagement();
  const { showSuccess, showError } = useToastContext();
  const [isOpen] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [ready, setReady] = useState(false);
  const [loadTimedOut, setLoadTimedOut] = useState(false);

  // Extract query params
  const sessionId = location.query?.session_id;
  void sessionId; // currently unused, reserved for future use
  const organizationId = (Array.isArray(location.query?.organizationId) ? location.query?.organizationId[0] : location.query?.organizationId) || currentOrganization?.id;
  
  // Prefer the upgraded business/enterprise org when available to ensure we mark the correct org
  const targetOrganization = useMemo(() => {
    // If the URL explicitly specifies an org, try to match it first
    const fromUrl = organizations?.find(org => org.id === organizationId);
    if (fromUrl) return fromUrl;
    // Otherwise, prefer any non-personal business/enterprise org
    const upgraded = organizations?.find(org => (org.subscriptionTier === 'business' || org.subscriptionTier === 'enterprise'));
    return upgraded || currentOrganization || null;
  }, [organizations, organizationId, currentOrganization]);
  
  const targetOrganizationId = targetOrganization?.id || organizationId;

  // Normalize URL to use the resolved target organization to avoid completing onboarding on the wrong org
  useEffect(() => {
    if (!targetOrganizationId) return;
    try {
      console.debug('[ONBOARDING][RESOLVE_ORG] Using targetOrganizationId:', targetOrganizationId);
      const url = new URL(window.location.href);
      const current = url.searchParams.get('organizationId');
      if (current !== targetOrganizationId) {
        console.debug('[ONBOARDING][RESOLVE_ORG] Normalizing URL organizationId from', current, 'to', targetOrganizationId);
        url.searchParams.set('organizationId', targetOrganizationId);
        window.history.replaceState({}, '', url.toString());
      }
    } catch {
      // noop
    }
  }, [targetOrganizationId]);
  const shouldSync = (Array.isArray(location.query?.sync) ? location.query?.sync[0] : location.query?.sync) === '1';

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
    const syncSubscription = async () => {
      // If no sync is needed, mark as ready so downstream guards can run
      if (!shouldSync) {
        setReady(true);
        return;
      }

      if (!targetOrganizationId || syncing) return;
      console.debug('[ONBOARDING][SYNC] Starting subscription sync for org:', targetOrganizationId);
      
      setSyncing(true);
      try {
        // Dev/test-only header to force paid tier during E2E flows
        const devForcePaid = (import.meta.env.MODE !== 'production') && (typeof window !== 'undefined') && (
          new URLSearchParams(window.location.search).get('forcePaid') === '1' ||
          (typeof localStorage !== 'undefined' && localStorage.getItem('forcePaid') === '1')
        );
        const response = await fetch('/api/subscription/sync', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            ...(devForcePaid ? { 'x-test-force-paid': '1' } : {})
          },
          body: JSON.stringify({ organizationId: targetOrganizationId })
        });

        if (!response.ok) {
          throw new Error('Failed to sync subscription');
        }

        // Refetch organization data to get updated tier
        await refetch();

        showSuccess('Payment Successful', 'Your subscription has been activated!');
      } catch (error) {
        console.error('Sync failed:', error);
        showError('Sync Failed', 'Could not refresh subscription status');
      } finally {
        setSyncing(false);
        // Clean up URL
        try {
          const newUrl = new URL(window.location.href);
          newUrl.searchParams.delete('sync');
          newUrl.searchParams.delete('session_id');
          window.history.replaceState({}, '', newUrl.toString());
          console.debug('[ONBOARDING][SYNC] Sync done. Cleaned URL.');
        } catch (_e) {
          // noop
        }
        setReady(true);
      }
    };

    syncSubscription();
	 }, [shouldSync, targetOrganizationId, syncing, refetch, showSuccess, showError]);

  // Guard: Only allow business/enterprise tiers (after initial sync ready)
  useEffect(() => {
    if (!ready || !targetOrganization) return;
    const tier = targetOrganization.subscriptionTier;
    if (tier !== 'business' && tier !== 'enterprise') {
      console.warn('❌ Onboarding access denied: invalid tier', { tier });
      showError('Not Available', 'Business onboarding is only available for paid plans.');
      navigate('/');
    }
  }, [ready, targetOrganization, showError, navigate]);

  // Guard: Redirect if onboarding already completed
  useEffect(() => {
    if (!ready || !targetOrganizationId) return;
    const checkCompletion = async () => {
      try {
        const response = await fetch(`/api/onboarding/status?organizationId=${targetOrganizationId}`, { credentials: 'include' });
        if (response.ok) {
          const status = await response.json() as { completed?: boolean } | null;
          if (status?.completed) {
            console.log('✅ Onboarding already completed, redirecting');
            showSuccess('Setup Complete', 'Your business profile is already configured.');
            navigate('/');
          }
        }
      } catch (e) {
        console.warn('Failed to check onboarding status:', e);
      }
    };
    checkCompletion();
  }, [ready, targetOrganizationId, showSuccess, navigate]);

  const handleComplete = useCallback(async () => {
    if (!targetOrganizationId) return;

    try {
      console.debug('[ONBOARDING][COMPLETE] Marking onboarding complete for org:', targetOrganizationId);
      const response = await fetch('/api/onboarding/complete', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: targetOrganizationId })
      });

      if (!response.ok) {
        throw new Error('Failed to mark onboarding complete');
      }

      showSuccess('Setup Complete!', 'Your business profile is ready.');
      navigate('/');
    } catch (error) {
      console.error('Failed to complete onboarding:', error);
      showError('Error', 'Could not save onboarding status');
    }
  }, [targetOrganizationId, showSuccess, showError, navigate]);

  const handleClose = useCallback(async () => {
    if (!targetOrganizationId) {
      navigate('/');
      return;
    }

    try {
      console.debug('[ONBOARDING][SKIP] Marking onboarding skipped for org:', targetOrganizationId);
      await fetch('/api/onboarding/skip', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: targetOrganizationId })
      });
    } catch (error) {
      console.error('Failed to mark onboarding skipped:', error);
    }

    navigate('/');
  }, [targetOrganizationId, navigate]);

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
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <p className="text-red-600 mb-3">{error || 'Request timed out while loading organizations.'}</p>
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
    />
  );
};

export default BusinessOnboardingPage;


