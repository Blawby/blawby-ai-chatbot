import { useMemo, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useNavigation } from '@/shared/utils/navigation';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { asMajor, fromMinorUnits, type MajorAmount } from '@/shared/utils/money';
import { Button } from '@/shared/ui/Button';
import { SettingsPageLayout } from '@/features/settings/components/SettingsPageLayout';
import { SettingsHelperText } from '@/features/settings/components/SettingsHelperText';
import { SectionDivider } from '@/shared/ui/layout';
import { CurrencyInput, Input, Switch } from '@/shared/ui/input';
import Modal from '@/shared/components/Modal';
import { normalizePracticeRole } from '@/shared/utils/practiceRoles';
import { buildSettingsPath, resolveSettingsBasePath } from '@/shared/utils/workspace';

const DEFAULT_BILLING_INCREMENT = 1;

export const PracticePricingPage = () => {
  const { activeMemberRole, activeMemberRoleLoading } = useSessionContext();
  const { currentPractice, loading, updatePracticeDetails } = usePracticeManagement({ fetchPracticeDetails: true });
  const { showSuccess, showError } = useToastContext();
  const { navigate } = useNavigation();
  const location = useLocation();
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
  const canEdit = !activeMemberRoleLoading && (normalizedRole === 'owner' || normalizedRole === 'admin');
  const isReadOnly = !activeMemberRoleLoading && !canEdit;
  const settingsBasePath = resolveSettingsBasePath(location.path);
  const toSettingsPath = (subPath?: string) => buildSettingsPath(settingsBasePath, subPath);

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
  const currencyCode = currentPractice?.currency || 'USD';
  const formattedFee = useMemo(() => {
    if (!feeEnabled || typeof activeFee !== 'number') return null;
    return formatCurrency(fromMinorUnits(activeFee), currencyCode, locale);
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
      showError('Consultation fee', `Enter a fee greater than ${formatCurrency(0, currencyCode, locale)}.`);
      return;
    }

    const currentVal = typeof activeFee === 'number' ? fromMinorUnits(activeFee) : null;
    const nextVal = feeEnabledDraft && typeof feeDraft === 'number' ? feeDraft : null;

    if ((nextVal as number) === (currentVal as number) || (!feeEnabledDraft && !feeEnabled)) {
      setIsFeeModalOpen(false);
      return;
    }

    setIsSaving(true);
    try {
      await updatePracticeDetails(currentPractice.id, {
        consultationFee: nextVal as MajorAmount | null,
        paymentLinkEnabled: feeEnabledDraft,
        paymentLinkPrefillAmount: nextVal as MajorAmount | null
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
        <p className="text-sm text-input-placeholder">Loading pricing settings...</p>
      </div>
    );
  }

  if (!currentPractice && !loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-input-placeholder">Select or create a practice to configure pricing.</p>
      </div>
    );
  }

  return (
    <SettingsPageLayout
      title="Pricing &amp; Fees"
      wrapChildren={false}
      contentClassName="pb-6"
      headerLeading={(
        <Button
          variant="icon"
          size="icon"
          onClick={() => navigate(toSettingsPath('practice'))}
          aria-label="Back to practice settings"
          icon={<ArrowLeftIcon className="w-5 h-5" />}
        />
      )}
    >
      <div className="pt-2 pb-6">
        <p className="text-sm text-input-placeholder">
          Configure intake payments and billing increments for this practice.
        </p>
      </div>

      <SectionDivider />
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
        <>
          <SectionDivider />
          <div className="py-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-input-text">Amount</div>
                <SettingsHelperText className="mt-1">
                  {formattedFee ?? 'Not set'}
                </SettingsHelperText>
              </div>
              <Button variant="secondary" size="sm" onClick={openFeeModal} disabled={!canEdit || isSaving}>
                {formattedFee ? 'Edit' : 'Set amount'}
              </Button>
            </div>
            {isReadOnly && (
              <SettingsHelperText className="mt-2">
                Owner/admin access required to update pricing.
              </SettingsHelperText>
            )}
          </div>
        </>
      )}

      <SectionDivider className="mt-6" />
      <div className="py-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-input-text">Billing increment</div>
              <p className="mt-1 text-sm text-input-placeholder">
                Current increment: {effectiveBillingIncrement} {effectiveBillingIncrement === 1 ? 'minute' : 'minutes'}.
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={openBillingModal} disabled={!canEdit || isSaving}>
              Manage
            </Button>
          </div>
          {isReadOnly && (
            <SettingsHelperText className="mt-2">
              Owner/admin access required to update billing increments.
            </SettingsHelperText>
          )}
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
    </SettingsPageLayout>
  );
};
