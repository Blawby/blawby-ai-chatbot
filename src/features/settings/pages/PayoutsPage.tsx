import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Button } from '@/shared/ui/Button';
import { SectionDivider, EditorShell } from '@/shared/ui';
import { SettingsHelperText } from '@/features/settings/components/SettingsHelperText';
import { SettingsNotice } from '@/features/settings/components/SettingsNotice';
import { SettingSection } from '@/features/settings/components/SettingSection';
import { SettingRow } from '@/features/settings/components/SettingRow';
import { Input } from '@/shared/ui/input';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { usePracticeDetails } from '@/shared/hooks/usePracticeDetails';
import { useToastContext } from '@/shared/contexts/ToastContext';
import {
  createConnectedAccount,
  getOnboardingStatusPayload
} from '@/shared/lib/apiClient';
import { extractStripeStatusFromPayload } from '@/features/onboarding/utils';
import type { StripeConnectStatus } from '@/features/onboarding/types';
import { getValidatedStripeOnboardingUrl } from '@/shared/utils/stripeOnboarding';
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  LockClosedIcon,
  ShieldCheckIcon
} from '@heroicons/react/24/outline';
import { Icon } from '@/shared/ui/Icon';
import { UserIcon } from '@heroicons/react/24/outline';

const maskStripeAccountId = (value?: string | null) => {
  if (!value) return 'Not created';
  if (value.length <= 10) return value;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
};

export const PayoutsPage = ({
  className = '',
  onBack
}: {
  className?: string;
  onBack?: () => void;
}) => {
  const { session } = useSessionContext();
  const { currentPractice } = usePracticeManagement({ fetchPracticeDetails: true });
  const { details, updateDetails, setDetails } = usePracticeDetails(currentPractice?.id, null, false);
  const { showError, showSuccess } = useToastContext();

  const organizationId = useMemo(
    () => currentPractice?.betterAuthOrgId ?? currentPractice?.id ?? null,
    [currentPractice?.betterAuthOrgId, currentPractice?.id]
  );
  const lastOrganizationIdRef = useRef<string | null>(null);
  const [stripeStatus, setStripeStatus] = useState<StripeConnectStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [billingIncrementDraft, setBillingIncrementDraft] = useState<number | ''>('');
  const [billingTouched, setBillingTouched] = useState(false);
  const [isSavingBilling, setIsSavingBilling] = useState(false);

  const savedBillingIncrement = useMemo(() => {
    const raw = details?.billingIncrementMinutes ?? currentPractice?.billingIncrementMinutes ?? null;
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : 6;
  }, [currentPractice?.billingIncrementMinutes, details?.billingIncrementMinutes]);
  const displayedBillingIncrement = billingTouched ? billingIncrementDraft : savedBillingIncrement;

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
      showError('Payouts', 'Missing practice context.');
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

  const hasStripeAccount = Boolean(stripeStatus?.stripe_account_id);
  const detailsSubmitted = stripeStatus?.details_submitted === true;
  const chargesEnabled = stripeStatus?.charges_enabled === true;
  const payoutsEnabled = stripeStatus?.payouts_enabled === true;
  const isReady = hasStripeAccount && payoutsEnabled;
  const needsAction = hasStripeAccount && !detailsSubmitted;
  const isPendingVerification = hasStripeAccount && detailsSubmitted && !payoutsEnabled;
  const statusTone = isReady ? 'ready' : needsAction ? 'action' : isPendingVerification ? 'pending' : 'not_started';
  const statusSummary = isReady
    ? {
        title: 'Stripe connected and ready',
        description: 'Your practice can receive payments and payouts through Stripe.',
        icon: CheckCircleIcon,
        iconClassName: 'text-emerald-600 dark:text-emerald-400'
      }
    : needsAction
    ? {
        title: 'Stripe setup needs your attention',
        description: 'Finish submitting your business and representative details to enable payouts.',
        icon: ExclamationTriangleIcon,
        iconClassName: 'text-amber-600 dark:text-amber-400'
      }
    : isPendingVerification
    ? {
        title: 'Verification in progress',
        description: 'Stripe has your details. Payouts will unlock after verification is complete.',
        icon: ShieldCheckIcon,
        iconClassName: 'text-sky-600 dark:text-sky-400'
      }
    : null;

  const businessEmail = currentPractice?.businessEmail || session?.user?.email || '';
  const missingBusinessEmail = !businessEmail;
  const statusLabel = statusTone === 'ready'
    ? 'Ready'
    : statusTone === 'action'
      ? 'Action required'
      : statusTone === 'pending'
        ? 'Verification in progress'
        : 'Not started';
  const actionButtonLabel = isSubmitting
    ? 'Preparing Stripe...'
    : hasStripeAccount
      ? 'Continue Stripe setup'
      : 'Start Stripe setup';

  const handleSaveBillingIncrement = async () => {
    if (!currentPractice) return;
    const nextValue = typeof displayedBillingIncrement === 'number' ? displayedBillingIncrement : Number(displayedBillingIncrement);
    if (!Number.isInteger(nextValue) || nextValue < 1 || nextValue > 60) {
      showError('Payouts and Billing', 'Billing increment must be a whole number between 1 and 60 minutes.');
      return;
    }

    if (nextValue === savedBillingIncrement) {
      setBillingTouched(false);
      setBillingIncrementDraft(nextValue);
      return;
    }

    setIsSavingBilling(true);
    try {
      const savedDetails = await updateDetails({ billingIncrementMinutes: nextValue });
      if (savedDetails !== undefined) setDetails(savedDetails);
      setBillingTouched(false);
      setBillingIncrementDraft(nextValue);
      showSuccess('Payouts and Billing', 'Billing increment updated.');
    } catch (error) {
      showError(
        'Payouts and Billing',
        error instanceof Error ? error.message : 'Failed to update billing increment.'
      );
    } finally {
      setIsSavingBilling(false);
    }
  };

  return (
    <EditorShell
      title="Payouts and Billing"
      showBack={Boolean(onBack)}
      onBack={onBack}
      className={className}
      contentMaxWidth={null}
    >
      <div className="space-y-6">
        <SettingSection
          title="Time entry billing increment"
          description="Round billable time to this many minutes when entries are created."
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="w-full max-w-[220px]">
              <label className="mb-2 block text-sm font-medium text-input-text" htmlFor="billing-increment-minutes">
                Minutes
              </label>
              <Input
                id="billing-increment-minutes"
                type="number"
                min={1}
                max={60}
                step={1}
                value={displayedBillingIncrement === '' ? '' : String(displayedBillingIncrement)}
                onChange={(value) => {
                  const trimmed = value.trim();
                  const parsed = trimmed === '' ? '' : Number.parseInt(trimmed, 10);
                  setBillingTouched(true);
                  setBillingIncrementDraft(Number.isFinite(parsed as number) ? (parsed as number) : '');
                }}
                disabled={isSavingBilling}
                placeholder="6"
              />
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => void handleSaveBillingIncrement()}
              disabled={isSavingBilling || (!billingTouched && displayedBillingIncrement === savedBillingIncrement)}
            >
              {isSavingBilling ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </SettingSection>

        <SectionDivider />

        <SettingSection
          title="External payout accounts"
          description="Connect Stripe to receive payouts for your practice."
        >
          <SettingsNotice variant={missingBusinessEmail ? 'warning' : 'info'} className="mb-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-5 w-5 items-center justify-center">
                <Icon
                  icon={missingBusinessEmail ? ExclamationTriangleIcon : (hasStripeAccount && statusSummary ? statusSummary.icon : ShieldCheckIcon)}
                  className={missingBusinessEmail
                    ? 'h-5 w-5 text-amber-600 dark:text-amber-400'
                    : hasStripeAccount && statusSummary
                      ? `h-5 w-5 ${statusSummary.iconClassName}`
                      : 'h-5 w-5 text-input-placeholder'}
                />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {missingBusinessEmail
                    ? 'Business email required'
                    : hasStripeAccount && statusSummary
                      ? statusSummary.title
                      : 'Stripe onboarding required'}
                </p>
                <p className="mt-1 text-sm">
                  {missingBusinessEmail
                    ? 'Add a business email in practice contact settings before starting Stripe verification.'
                    : hasStripeAccount && statusSummary
                      ? statusSummary.description
                      : 'Stripe will verify your business and representative details before enabling payouts.'}
                </p>
              </div>
            </div>
          </SettingsNotice>

        <SettingRow
          label="Stripe account"
          description={isReady ? undefined : 'Bank accounts and payout schedules are managed in Stripe after onboarding.'}
        >
          <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-end">
            <span className="text-sm font-medium text-input-text">
              {maskStripeAccountId(stripeStatus?.stripe_account_id)}
            </span>
            {hasStripeAccount ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleSubmitDetails}
                disabled={isSubmitting || isLoading || missingBusinessEmail}
              >
                Manage
              </Button>
            ) : null}
          </div>
        </SettingRow>

        <SectionDivider />

        <SettingRow
          label="Business email"
          labelNode={(
            <div className="flex items-center gap-3">
              <Icon icon={UserIcon} className="h-5 w-5 text-input-placeholder" />
              <span className="text-sm font-medium text-input-text">Business email</span>
            </div>
          )}
          description={isReady ? undefined : 'Stripe uses this email during onboarding and verification.'}
        >
          <span className="text-sm font-medium text-input-text">
            {businessEmail || 'Not set'}
          </span>
        </SettingRow>

        <SectionDivider />

        <SettingRow
          label="Charges"
          description={isReady ? undefined : 'Card payments can be accepted once Stripe finishes verifying the account.'}
        >
          <span className="text-sm font-medium text-input-text">
            {chargesEnabled ? 'Enabled' : 'Pending verification'}
          </span>
        </SettingRow>

        <SectionDivider />

        <SettingRow
          label="Payouts"
          labelNode={(
            <div className="flex items-center gap-3">
              <Icon icon={LockClosedIcon} className="h-5 w-5 text-input-placeholder" />
              <span className="text-sm font-medium text-input-text">Payouts</span>
            </div>
          )}
          description={isReady ? undefined : 'Payouts unlock after Stripe verifies your business details.'}
        >
          <span className="text-sm font-medium text-input-text">
            {payoutsEnabled ? 'Enabled' : 'Pending verification'}
          </span>
        </SettingRow>

        <SectionDivider />

        <SettingRow
          label="Status"
          labelNode={(
            <div className="flex items-center gap-3">
              <Icon icon={ShieldCheckIcon} className="h-5 w-5 text-input-placeholder" />
              <span className="text-sm font-medium text-input-text">Status</span>
            </div>
          )}
          description={isReady
            ? undefined
            : hasStripeAccount
              ? 'Review or complete Stripe onboarding to finish setup.'
              : 'Start Stripe onboarding to create your payout account.'}
        >
          <span className="text-sm font-medium text-input-text">
            {statusLabel}
          </span>
        </SettingRow>

        {!isReady && (
          <>
            <SectionDivider />
            <SettingRow
              label="Stripe setup"
              description="You will be redirected to Stripe to complete or review verification."
            >
              <Button
                variant="primary"
                size="sm"
                onClick={handleSubmitDetails}
                disabled={isSubmitting || isLoading || missingBusinessEmail}
              >
                {actionButtonLabel}
              </Button>
            </SettingRow>
          </>
        )}

        {!isReady && (
          <SettingsHelperText className="mt-3 block">
            {missingBusinessEmail
              ? 'Add a business email before starting Stripe verification.'
              : 'The recommended contact to complete onboarding is the business owner or another authorized representative.'}
          </SettingsHelperText>
        )}
      </SettingSection>
    </div>
    </EditorShell>
  );
};
