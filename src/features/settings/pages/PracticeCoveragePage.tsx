import { useMemo, useRef, useState, useCallback } from 'preact/hooks';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { usePracticeDetails } from '@/shared/hooks/usePracticeDetails';
import { ServicesEditor } from '@/features/services/components/ServicesEditor';
import { SERVICE_CATALOG } from '@/features/services/data/serviceCatalog';
import type { Service } from '@/features/services/types';
import { getServiceDetailsForSave } from '@/features/services/utils';
import { resolveServiceDetails } from '@/features/services/utils/serviceNormalization';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useTranslation } from '@/shared/i18n/hooks';
import { SectionDivider, EditorShell } from '@/shared/ui/layout';

import { Combobox } from '@/shared/ui/input/Combobox';
import { Input } from '@/shared/ui/input';
import { STATE_OPTIONS } from '@/shared/ui/address/AddressFields';
import { Button } from '@/shared/ui/Button';
import { SettingsHelperText } from '@/features/settings/components/SettingsHelperText';
import { buildPracticeProfilePayloads } from '@/shared/utils/practiceProfile';



// const US_STATE_CODES = [
//   'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
//   'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
//   'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
//   'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
//   'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
// ];

interface PracticeCoveragePageProps {
  className?: string;
  onBack?: () => void;
}

export const PracticeCoveragePage = ({ className, onBack }: PracticeCoveragePageProps) => {
  const { currentPractice } = usePracticeManagement({ fetchPracticeDetails: true });
  const { details, updateDetails, setDetails } = usePracticeDetails(currentPractice?.id, null, false);
  const { showError, showSuccess } = useToastContext();
  const { t } = useTranslation(['settings', 'common']);

  const [servicesError, setServicesError] = useState<string | null>(null);
  const [statesError, setStatesError] = useState<string | null>(null);

  const [licensedStatesDraft, setLicensedStatesDraft] = useState<string[]>([]);
  const [statesDraftTouched, setStatesDraftTouched] = useState(false);
  // Local-only: bar/admission info keyed by state code
  const [licensedStatesMeta, setLicensedStatesMeta] = useState<Record<string, { barNumber?: string; admissionDate?: string }>>({});
  const [isSavingStates, setIsSavingStates] = useState(false);
  const [billingIncrementDraft, setBillingIncrementDraft] = useState<number | ''>('');
  const [billingTouched, setBillingTouched] = useState(false);
  const [isSavingBilling, setIsSavingBilling] = useState(false);
  const lastSavedKeyRef = useRef<string>('');
  const saveRequestIdRef = useRef(0);
  const pendingSaveSnapshotsRef = useRef(new Map<number, { optimisticDetails: typeof details }>());
  const confirmedDetailsRef = useRef(details);
  const confirmedSaveIdRef = useRef(0);
  const lastToastAtRef = useRef(0);
  const toastCooldownMs = 4000;

  const initialServiceDetails = useMemo(
    () => resolveServiceDetails(details, currentPractice),
    [details, currentPractice]
  );
  const savedLicensedStates = useMemo(() => details?.serviceStates ?? [], [details?.serviceStates]);
  const savedBillingIncrement = useMemo(() => {
    const raw = details?.billingIncrementMinutes ?? currentPractice?.billingIncrementMinutes ?? null;
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : 6;
  }, [currentPractice?.billingIncrementMinutes, details?.billingIncrementMinutes]);
  const displayedLicensedStates = statesDraftTouched || isSavingStates
    ? licensedStatesDraft
    : savedLicensedStates;
  const displayedBillingIncrement = billingTouched ? billingIncrementDraft : savedBillingIncrement;

  const saveServices = useCallback(async (nextServices: Service[]) => {
    if (!currentPractice) return;
    setServicesError(null);
    const serviceDetails = getServiceDetailsForSave(nextServices);
    const apiServices = serviceDetails
      .map(({ id, title }) => ({
        id: id.trim(),
        name: title.trim()
      }))
      .filter((service) => service.id && service.name);
    const payloadKey = JSON.stringify(apiServices);
    if (payloadKey === lastSavedKeyRef.current) {
      return;
    }

    const saveId = ++saveRequestIdRef.current;
    if (pendingSaveSnapshotsRef.current.size === 0) {
      confirmedDetailsRef.current = details;
      confirmedSaveIdRef.current = saveId - 1;
    }
    const getLatestPendingSave = () => {
      let latestSaveId: number | null = null;
      let latestSave: { optimisticDetails: typeof details } | null = null;

      pendingSaveSnapshotsRef.current.forEach((pendingSave, pendingSaveId) => {
        if (latestSaveId === null || pendingSaveId > latestSaveId) {
          latestSaveId = pendingSaveId;
          latestSave = pendingSave;
        }
      });

      if (latestSaveId === null || !latestSave) {
        return null;
      }

      return {
        saveId: latestSaveId,
        optimisticDetails: latestSave.optimisticDetails
      };
    };
    const optimisticDetails = {
      ...(details ?? { services: [] }),
      services: apiServices
    };
    pendingSaveSnapshotsRef.current.set(saveId, { optimisticDetails });
    setDetails(optimisticDetails);

    try {
      const savedDetails = await updateDetails({
        services: apiServices
      });

      pendingSaveSnapshotsRef.current.delete(saveId);
      if (savedDetails !== undefined && saveId >= confirmedSaveIdRef.current) {
        confirmedSaveIdRef.current = saveId;
        confirmedDetailsRef.current = savedDetails;
      }

      const latestPendingSave = getLatestPendingSave();
      if (latestPendingSave && latestPendingSave.saveId > saveId) {
        setDetails(latestPendingSave.optimisticDetails);
        return;
      }

      if (saveId < confirmedSaveIdRef.current) {
        setDetails(confirmedDetailsRef.current);
        return;
      }

      if (saveId !== saveRequestIdRef.current) {
        return;
      }

      lastSavedKeyRef.current = payloadKey;
      const now = Date.now();
      if (now - lastToastAtRef.current > toastCooldownMs) {
        showSuccess(
          t('common:notifications.settingsSavedTitle'),
          t('common:notifications.settingsSavedBody')
        );
        lastToastAtRef.current = now;
      }
    } catch (err) {
      pendingSaveSnapshotsRef.current.delete(saveId);
      const latestPendingSave = getLatestPendingSave();
      setDetails(latestPendingSave?.optimisticDetails ?? confirmedDetailsRef.current);

      if (saveId !== saveRequestIdRef.current) {
        return;
      }

      const message = err instanceof Error
        ? err.message
        : t('common:notifications.settingsSaveErrorBody');
      setServicesError(message);
      showError(
        t('common:notifications.settingsSaveErrorTitle'),
        message
      );
    }
  }, [currentPractice, details, setDetails, showError, showSuccess, t, updateDetails]);

  // Helper: Only allow valid state codes
  const validateStateCode = useCallback((code: string) => {
    return STATE_OPTIONS.some(opt => opt.value === code);
  }, []);

  const handleSaveLicensedStates = async () => {
    if (!currentPractice) return;
    // Only use licensedStatesDraft if touched and non-empty, otherwise fallback to savedLicensedStates
    const validStates = (statesDraftTouched && licensedStatesDraft.length > 0)
      ? licensedStatesDraft.filter(validateStateCode)
      : savedLicensedStates;
    // Only send state codes to backend
    const { detailsPayload } = buildPracticeProfilePayloads({ serviceStates: validStates });
    setStatesError(null);
    setIsSavingStates(true);
    try {
      const optimisticDetails = {
        ...(details ?? { services: [] }),
        serviceStates: validStates,
      };
      setDetails(optimisticDetails);
      const savedDetails = await updateDetails(detailsPayload);
      if (savedDetails !== undefined) setDetails(savedDetails);
      setLicensedStatesDraft(validStates);
      setStatesDraftTouched(false);
      // Optionally: prune meta for removed states
      setLicensedStatesMeta(meta => {
        const next: typeof meta = {};
        for (const state of validStates) {
          if (meta[state]) next[state] = meta[state];
        }
        return next;
      });
      showSuccess(t('settings:practice.licensedStatesUpdated') || 'Licensed states updated.');
    } catch (err) {
      const message = err instanceof Error ? err.message : (t('settings:practice.licensedStatesUpdateFailed') || 'Failed to update licensed states');
      setStatesError(message);
      showError(message);
    } finally {
      setIsSavingStates(false);
    }
  };

  const handleSaveBillingIncrement = async () => {
    if (!currentPractice) return;
    const nextValue = typeof displayedBillingIncrement === 'number' ? displayedBillingIncrement : Number(displayedBillingIncrement);
    if (!Number.isInteger(nextValue) || nextValue < 1 || nextValue > 60) {
      showError(t('settings:billing.invalidIncrement') || 'Billing increment must be a whole number between 1 and 60 minutes.');
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
      showSuccess(t('settings:billing.updated') || 'Billing increment updated.');
    } catch (err) {
      const message = err instanceof Error ? err.message : (t('settings:billing.updateFailed') || 'Failed to update billing increment');
      showError(message);
    } finally {
      setIsSavingBilling(false);
    }
  };

  if (!currentPractice) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-input-placeholder">No practice selected.</p>
      </div>
    );
  }

  return (
    <EditorShell
      title="Coverage"
      subtitle="Services, licensed states, and billing rules"
      showBack={Boolean(onBack)}
      backVariant="close"
      onBack={onBack}
      className={className}
      contentMaxWidth={null}
    >
      <div className="space-y-6">


        {servicesError && (
          <p className="text-xs text-accent-error dark:text-accent-error-light mb-4">
            {servicesError}
          </p>
        )}
        {statesError && (
          <p className="text-xs text-red-600 dark:text-red-400 mb-4">
            {statesError}
          </p>
        )}

        <section className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-input-text">Services</h3>
            <SettingsHelperText className="mt-1">
              Choose the legal service areas this practice accepts for routing and intake setup.
            </SettingsHelperText>
          </div>
          <ServicesEditor
            services={initialServiceDetails}
            onChange={(nextServices) => void saveServices(nextServices)}
            catalog={SERVICE_CATALOG}
          />
        </section>
        <SectionDivider />
        <section className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-input-text">Time entry billing increment</h3>
            <SettingsHelperText className="mt-1">
              Round billable time to this many minutes when entries are created.
            </SettingsHelperText>
          </div>
          <div className="glass-panel rounded-xl p-4">
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
          </div>
        </section>

        <SectionDivider />
        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-input-text">Licensed states</h3>
            <SettingsHelperText className="mt-1">
              Enter US state codes where this practice is licensed. Used to help the assistant reason about jurisdiction.
            </SettingsHelperText>
          </div>
          <Combobox
            multiple
            options={STATE_OPTIONS}
            value={displayedLicensedStates}
            onChange={(nextStates) => {
              setLicensedStatesDraft(nextStates);
              setStatesDraftTouched(true);
              // Add meta for new states, prune for removed
              setLicensedStatesMeta(meta => {
                const next: typeof meta = {};
                for (const state of nextStates) {
                  next[state] = meta[state] || { barNumber: '', admissionDate: '' };
                }
                return next;
              });
            }}
            placeholder="Select licensed states"
            disabled={isSavingStates}
            aria-label="Licensed states"
          />
          {/* Per-state bar number/admission date fields (local only) */}
          {displayedLicensedStates.length > 0 && (
            <div className="mt-4 space-y-3">
              {displayedLicensedStates.map((state) => {
                const meta = licensedStatesMeta[state] || { barNumber: '', admissionDate: '' };
                const stateLabel = STATE_OPTIONS.find(opt => opt.value === state)?.label || state;
                return (
                  <div key={state} className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 border border-line-glass/10 rounded-xl p-3 bg-surface-workspace/40">
                    <div className="font-medium min-w-[120px]">{stateLabel}</div>
                    <input
                      type="text"
                      className="input input-sm w-full md:w-48"
                      placeholder="Bar number (optional)"
                      value={meta.barNumber || ''}
                      onInput={e => {
                        const val = (e.target as HTMLInputElement).value;
                        setLicensedStatesMeta(m => ({ ...m, [state]: { ...m[state], barNumber: val } }));
                      }}
                    />
                    <input
                      type="date"
                      className="input input-sm w-full md:w-48"
                      placeholder="Admission date (optional)"
                      value={meta.admissionDate || ''}
                      onInput={e => {
                        const val = (e.target as HTMLInputElement).value;
                        setLicensedStatesMeta(m => ({ ...m, [state]: { ...m[state], admissionDate: val } }));
                      }}
                    />
                  </div>
                );
              })}
            </div>
          )}
          <SectionDivider />
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setLicensedStatesDraft(savedLicensedStates);
                setStatesDraftTouched(false);
              }}
              disabled={isSavingStates}
            >
              Reset
            </Button>
            <Button
              size="sm"
              onClick={handleSaveLicensedStates}
              disabled={isSavingStates}
            >
              {isSavingStates ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </section>
      </div>
    </EditorShell>
  );
};
