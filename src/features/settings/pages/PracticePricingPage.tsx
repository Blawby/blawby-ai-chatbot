import { useMemo, useState } from 'preact/hooks';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useNavigation } from '@/shared/utils/navigation';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { asMajor, fromMinorUnits, toMinorUnits, type MajorAmount } from '@/shared/utils/money';
import { Button } from '@/shared/ui/Button';
import { CurrencyInput, Input, Switch } from '@/shared/ui/input';
import Modal from '@/shared/components/Modal';
import { normalizePracticeRole } from '@/shared/utils/practiceRoles';

const DEFAULT_BILLING_INCREMENT = 1;

export const PracticePricingPage = () => {
  const { activeMemberRole, activeMemberRoleLoading } = useSessionContext();
  const { currentPractice, loading, updatePracticeDetails } = usePracticeManagement({ fetchPracticeDetails: true });
  const { showSuccess, showError } = useToastContext();
  const { navigate } = useNavigation();
  const [isFeeModalOpen, setIsFeeModalOpen] = useState(false);
  const [feeEnabledDraft, setFeeEnabledDraft] = useState(false);
  const [feeDraft, setFeeDraft] = useState<MajorAmount | undefined>(undefined);
  const [feeEnabledOverride, setFeeEnabledOverride] = useState<boolean | null>(null);
  const [isBillingModalOpen, setIsBillingModalOpen] = useState(false);
  const [billingDraft, setBillingDraft] = useState<number | undefined>(undefined);
  const [showBillingValidation, setShowBillingValidation] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const locale = typeof navigator !== 'undefined' ? navigator.language : 'en';
  const normalizedRole = normalizePracticeRole(activeMemberRole);
  const canEdit = normalizedRole === 'owner' || normalizedRole === 'admin';
  const isReadOnly = !activeMemberRoleLoading && !canEdit;

  const activeFee = useMemo(() => {
    const raw = currentPractice?.consultationFee;
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
  }, [currentPractice?.consultationFee]);
  const activeBillingIncrement = useMemo(() => {
    const raw = currentPractice?.billingIncrementMinutes;
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
  }, [currentPractice?.billingIncrementMinutes]);

  const feeEnabled = typeof activeFee === 'number' && activeFee > 0;
  const feeEnabledDisplay = feeEnabledOverride ?? feeEnabled;
  const currencyCode = (currentPractice as unknown as { currency?: string })?.currency || 'USD';
  const formattedFee = useMemo(() => {
    if (!feeEnabled || typeof activeFee !== 'number') return null;
    return formatCurrency(activeFee, currencyCode, locale);
  }, [activeFee, feeEnabled, locale, currencyCode]);

  const effectiveBillingIncrement = Number.isFinite(activeBillingIncrement)
    ? (activeBillingIncrement as number)
    : DEFAULT_BILLING_INCREMENT;
  const feeValidationError = showValidation && feeEnabledDraft && (!Number.isFinite(feeDraft) || (feeDraft ?? 0) <= 0)
    ? `Enter a fee greater than ${formatCurrency(0, currencyCode, locale)}.`
    : undefined;

  const openFeeModal = () => {
    const nextFee = typeof activeFee === 'number' && activeFee > 0 ? activeFee : undefined;
    setFeeDraft(nextFee !== undefined ? fromMinorUnits(nextFee) : undefined);
    setFeeEnabledDraft(Boolean(nextFee));
    setShowValidation(false);
    setIsFeeModalOpen(true);
  };

  const closeFeeModal = () => {
    setIsFeeModalOpen(false);
    setFeeEnabledOverride(null);
  };

  const openBillingModal = () => {
    setBillingDraft(effectiveBillingIncrement);
    setShowBillingValidation(false);
    setIsBillingModalOpen(true);
  };

  const closeBillingModal = () => {
    setIsBillingModalOpen(false);
  };

  const handleSaveFee = async () => {
    if (!currentPractice) {
      showError('Consultation fee', 'Missing practice information.');
      return;
    }
    if (!canEdit) {
      showError('Consultation fee', 'Only owners and admins can update pricing.');
      return;
    }
    if (feeEnabledDraft && (!Number.isFinite(feeDraft) || (feeDraft ?? 0) <= 0)) {
      setShowValidation(true);
      showError('Consultation fee', 'Enter a fee greater than $0.');
      return;
    }

    const currentFeeMinor = typeof activeFee === 'number' ? activeFee : null;
    const nextFeeMinor = feeEnabledDraft && typeof feeDraft === 'number' ? toMinorUnits(feeDraft) : null;

    if ((nextFeeMinor as unknown as number | null) === (currentFeeMinor as unknown as number | null) || (!feeEnabledDraft && !feeEnabled)) {
      setIsFeeModalOpen(false);
      return;
    }

    setIsSaving(true);
    try {
      await updatePracticeDetails(currentPractice.id, {
        consultationFee: nextFeeMinor,
        paymentLinkEnabled: feeEnabledDraft,
        paymentLinkPrefillAmount: nextFeeMinor
      });
      showSuccess(
        feeEnabledDraft ? 'Consultation fee enabled' : 'Consultation fee disabled',
        feeEnabledDraft ? 'New intakes will require payment.' : 'New intakes will no longer require payment.'
      );
      setIsFeeModalOpen(false);
      setFeeEnabledOverride(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update consultation fee.';
      showError('Consultation fee', message);
    } finally {
      setIsSaving(false);
    }
  };

  const billingValidationError = showBillingValidation
    && (!Number.isFinite(billingDraft) || !Number.isInteger(billingDraft) || (billingDraft ?? 0) < 1 || (billingDraft ?? 0) > 60)
    ? 'Enter a whole number between 1 and 60 minutes.'
    : undefined;

  const handleSaveBillingIncrement = async () => {
    if (!currentPractice) {
      showError('Billing increment', 'Missing practice information.');
      return;
    }
    if (!canEdit) {
      showError('Billing increment', 'Only owners and admins can update pricing.');
      return;
    }
    if (!Number.isFinite(billingDraft) || !Number.isInteger(billingDraft) || (billingDraft ?? 0) < 1 || (billingDraft ?? 0) > 60) {
      setShowBillingValidation(true);
      showError('Billing increment', 'Enter a whole number between 1 and 60 minutes.');
      return;
    }

    const nextValue = billingDraft ?? DEFAULT_BILLING_INCREMENT;
    if (nextValue === activeBillingIncrement) {
      setIsBillingModalOpen(false);
      return;
    }

    setIsSaving(true);
    try {
      await updatePracticeDetails(currentPractice.id, { billingIncrementMinutes: nextValue });
      showSuccess('Billing increment updated', 'Your billing increment has been saved.');
      setIsBillingModalOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update billing increment.';
      showError('Billing increment', message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleFeeToggle = async (enabled: boolean) => {
    if (!currentPractice) {
      showError('Consultation fee', 'Missing practice information.');
      return;
    }
    if (!canEdit) {
      showError('Consultation fee', 'Only owners and admins can update pricing.');
      return;
    }

    if (enabled) {
      setFeeEnabledOverride(true);
      openFeeModal();
      return;
    }

    setFeeEnabledOverride(false);
    setIsSaving(true);
    try {
      await updatePracticeDetails(currentPractice.id, {
        consultationFee: null,
        paymentLinkEnabled: false,
        paymentLinkPrefillAmount: null
      });
      showSuccess('Consultation fee disabled', 'New intakes will no longer require payment.');
      setFeeEnabledOverride(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update consultation fee.';
      showError('Consultation fee', message);
      setFeeEnabledOverride(null);
    } finally {
      setIsSaving(false);
    }
  };

  if (loading && !currentPractice) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-gray-500">Loading pricing settings...</p>
      </div>
    );
  }

  if (!currentPractice && !loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-gray-500">Select or create a practice to configure pricing.</p>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <div className="pt-4 pb-6">
          <button
            type="button"
            onClick={() => navigate('/settings/practice')}
            className="flex items-center gap-2 mb-4 text-gray-600 dark:text-gray-300"
            aria-label="Back to practice settings"
          >
            <ArrowLeftIcon className="w-5 h-5" aria-hidden="true" />
            <span className="text-sm font-medium">Back to Practice</span>
          </button>

          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Pricing &amp; Fees</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Configure intake payments and billing increments for this practice.
              </p>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200 dark:border-dark-border">
          <div className="py-3">
            <Switch
              id="consultation-fee-enabled"
              label="Consultation fee"
              description="Require payment before confirming an intake."
              value={feeEnabledDisplay}
              onChange={(value) => void handleFeeToggle(value)}
              disabled={!canEdit || isSaving}
              className="py-0"
            />
          </div>
          {feeEnabledDisplay && (
            <div className="py-3 border-t border-gray-200 dark:border-dark-border">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Amount</div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {formattedFee ?? 'Not set'}
                  </p>
                </div>
                <Button variant="secondary" size="sm" onClick={openFeeModal} disabled={!canEdit || isSaving}>
                  {formattedFee ? 'Edit' : 'Set amount'}
                </Button>
              </div>
              {isReadOnly && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Owner/admin access required to update pricing.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 dark:border-dark-border mt-6">
          <div className="py-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Billing increment</div>
                <p className="mt-1 text-sm text-gray-500">
                  Current increment: {effectiveBillingIncrement} {effectiveBillingIncrement === 1 ? 'minute' : 'minutes'}.
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={openBillingModal} disabled={!canEdit || isSaving}>
                Manage
              </Button>
            </div>
            {!canEdit && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                Owner/admin access required to update billing increments.
              </p>
            )}
          </div>
        </div>
      </div>

      <Modal isOpen={isFeeModalOpen} onClose={closeFeeModal} title="Consultation fee">
        <div className="space-y-4">
          <Switch
            id="consultation-fee-toggle"
            label="Collect consultation fee"
            description="Require payment before confirming an intake."
            value={feeEnabledDraft}
            onChange={(value) => {
              setFeeEnabledDraft(value);
              if (!value) {
                setShowValidation(false);
              }
            }}
            disabled={!canEdit || isSaving}
          />

          {feeEnabledDraft && (
            <CurrencyInput
              label="Fee amount"
              value={feeDraft}
              onChange={(value) => setFeeDraft(typeof value === 'number' ? asMajor(value) : undefined)}
              placeholder="150.00"
              disabled={!canEdit || isSaving}
              step={0.01}
              min={0.01}
              description={currencyCode}
              error={feeValidationError}
            />
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={closeFeeModal} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSaveFee}
              disabled={!canEdit || isSaving}
            >
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isBillingModalOpen} onClose={closeBillingModal} title="Billing increment">
        <div className="space-y-4">
          <Input
            type="number"
            label="Billing increment (minutes)"
            description="Used for time-based billing."
            value={Number.isFinite(billingDraft) ? String(billingDraft) : ''}
            onChange={(value) => {
              setShowBillingValidation(false);
              const trimmed = value.trim();
              if (!trimmed) {
                setBillingDraft(undefined);
                return;
              }
              const parsed = Number(trimmed);
              if (Number.isFinite(parsed)) {
                setBillingDraft(parsed);
                if (!Number.isInteger(parsed)) {
                  setShowBillingValidation(true);
                }
              }
            }}
            min={1}
            max={60}
            step={1}
            inputMode="numeric"
            disabled={!canEdit || isSaving}
            error={billingValidationError}
          />

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={closeBillingModal} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSaveBillingIncrement}
              disabled={!canEdit || isSaving}
            >
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
