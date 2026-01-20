import axios from 'axios';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Button } from '@/shared/ui/Button';
import { SectionDivider } from '@/shared/ui';
import { SettingHeader } from '@/features/settings/components/SettingHeader';
import { SettingSection } from '@/features/settings/components/SettingSection';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { useToastContext } from '@/shared/contexts/ToastContext';
import {
  createConnectedAccount,
  getOnboardingStatusPayload
} from '@/shared/lib/apiClient';
import { StripeOnboardingStep } from '@/features/onboarding/steps/StripeOnboardingStep';
import { extractStripeStatusFromPayload } from '@/features/onboarding/utils';
import type { StripeConnectStatus } from '@/features/onboarding/types';
import { getValidatedStripeOnboardingUrl } from '@/shared/utils/stripeOnboarding';
import { CheckCircleIcon, LockClosedIcon, ShieldCheckIcon, UserCircleIcon } from '@heroicons/react/24/outline';

export const PayoutsPage = ({ className = '' }: { className?: string }) => {
  const { session, activeOrganizationId } = useSessionContext();
  const { currentPractice } = usePracticeManagement();
  const { showError } = useToastContext();
  const organizationId = useMemo(() => activeOrganizationId, [activeOrganizationId]);
  const lastOrganizationIdRef = useRef<string | null>(null);
  const [stripeStatus, setStripeStatus] = useState<StripeConnectStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchStatus = useCallback(async (signal: AbortSignal) => {
    if (!organizationId) {
      if (lastOrganizationIdRef.current !== null) {
        lastOrganizationIdRef.current = null;
        setStripeStatus(null);
      }
      return;
    }

    if (lastOrganizationIdRef.current !== organizationId) {
      lastOrganizationIdRef.current = organizationId;
      setStripeStatus(null);
    }

    setIsLoading(true);
    try {
      const payload = await getOnboardingStatusPayload(organizationId, { signal });
      if (signal.aborted) {
        return;
      }
      const status = extractStripeStatusFromPayload(payload);
      if (status) {
        setStripeStatus(status);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      if ((error as { name?: string }).name === 'AbortError') {
        return;
      }
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        setStripeStatus(null);
        return;
      }
      console.warn('[PAYOUTS] Failed to load Stripe status:', error);
      showError('Payouts', 'Unable to load payout account status.');
    } finally {
      if (!signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [organizationId, showError]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchStatus(controller.signal);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (url.searchParams.has('stripe')) {
        url.searchParams.delete('stripe');
        window.history.replaceState({}, '', url.toString());
      }
    }
    return () => {
      controller.abort();
    };
  }, [fetchStatus]);

  const handleSubmitDetails = useCallback(async () => {
    if (!organizationId) {
      showError('Payouts', 'Missing active organization.');
      return;
    }

    const email = currentPractice?.businessEmail || session?.user?.email || '';
    if (!email) {
      showError('Payouts', 'Add a business email before submitting details.');
      return;
    }

    if (typeof window === 'undefined') {
      showError('Payouts', 'Unable to start Stripe onboarding in this environment.');
      return;
    }
    const returnUrl = new URL(window.location.href);
    returnUrl.searchParams.set('stripe', 'return');
    const refreshUrl = new URL(window.location.href);
    refreshUrl.searchParams.set('stripe', 'refresh');

    setIsSubmitting(true);
    try {
      const connectedAccount = await createConnectedAccount({
        practiceEmail: email,
        practiceUuid: organizationId,
        returnUrl: returnUrl.toString(),
        refreshUrl: refreshUrl.toString()
      });

      if (connectedAccount.onboardingUrl) {
        const validatedUrl = getValidatedStripeOnboardingUrl(connectedAccount.onboardingUrl);
        if (validatedUrl) {
          window.location.href = validatedUrl;
          return;
        }
        showError('Payouts', 'Received an invalid Stripe onboarding link. Please try again.');
        return;
      }

      const message = 'Stripe hosted onboarding link was not provided. Please try again later.';
      showError('Payouts', message);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start Stripe onboarding';
      showError('Payouts', message);
    } finally {
      setIsSubmitting(false);
    }
  }, [organizationId, currentPractice?.businessEmail, session?.user?.email, showError]);

  const detailsSubmitted = stripeStatus?.details_submitted === true;
  return (
    <div className={`h-full flex flex-col ${className}`}>
      <SettingHeader title="Payouts" />

      <div className="flex-1 overflow-y-auto px-6 pb-8">
        <SettingSection title="External payout accounts">
          {detailsSubmitted ? (
            <div className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-400">
              <span className="mt-0.5 flex h-8 w-8 items-center justify-center">
                <CheckCircleIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </span>
              <p>
                Your Blawby payout account is set up and ready to receive payments. You can now start sending invoices and receiving payments.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-400">
                <span className="mt-0.5 flex h-8 w-8 items-center justify-center">
                  <ShieldCheckIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                </span>
                <p>
                  Information about your business, and authorized representative(s) of your business, will need to be verified to comply with the law. This may require you to provide documents such as government-issued identification.
                </p>
              </div>
              <div className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-400">
                <span className="mt-0.5 flex h-8 w-8 items-center justify-center">
                  <UserCircleIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                </span>
                <p>
                  It&apos;s recommended that the person filling out the information is either the owner of the business, or someone with a significant role in the business, such as a director or executive.
                </p>
              </div>
              <div className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-400">
                <span className="mt-0.5 flex h-8 w-8 items-center justify-center">
                  <LockClosedIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                </span>
                <p>
                  Any information and documentation you submit will be securely handled in accordance with Blawby&apos;s Privacy Policy, and may be used to create a faster onboarding experience for you if you choose to use other Blawby products.
                </p>
              </div>
            </div>
          )}

          {!detailsSubmitted && (
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button
                variant="primary"
                size="sm"
                onClick={handleSubmitDetails}
                disabled={isSubmitting || isLoading}
              >
                {isSubmitting ? 'Preparing Stripe...' : 'Submit details'}
              </Button>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                You will be prompted to complete Stripe verification.
              </span>
            </div>
          )}
        </SettingSection>

        {isLoading && (
          <>
            <SectionDivider />
            <div className="mt-4">
              <StripeOnboardingStep
                status={stripeStatus}
                loading={isLoading}
                showIntro={false}
                showInfoCard={false}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PayoutsPage;
