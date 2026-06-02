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
import { Combobox } from '@/shared/ui/input/Combobox';
import { STATE_OPTIONS } from '@/shared/ui/address/AddressFields';
import { Button } from '@/shared/ui/Button';
import { SettingsHelperText } from '@/features/settings/components/SettingsHelperText';
import { SettingSection } from '@/features/settings/components/SettingSection';
import { SettingsCard } from '@/features/settings/components/SettingsCard';
import { cn } from '@/shared/utils/cn';
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
  const [isSavingStates, setIsSavingStates] = useState(false);
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
  const displayedLicensedStates = statesDraftTouched || isSavingStates
    ? licensedStatesDraft
    : savedLicensedStates;

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
    // Honor an explicitly emptied draft: if the user touched the field, save
    // exactly what they entered (including an empty list) instead of falling
    // back to the previously-saved value.
    const validStates = statesDraftTouched
      ? licensedStatesDraft.filter(validateStateCode)
      : savedLicensedStates;
    // Only send state codes to backend
    const { detailsPayload } = buildPracticeProfilePayloads({ serviceStates: validStates });
    setStatesError(null);
    setIsSavingStates(true);
    const prevDetails = details;
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
      showSuccess(t('settings:practice.licensedStatesUpdated') || 'Licensed states updated.');
    } catch (err) {
      // Revert the optimistic update so the UI matches server state on failure.
      setDetails(prevDetails);
      const message = err instanceof Error ? err.message : (t('settings:practice.licensedStatesUpdateFailed') || 'Failed to update licensed states');
      setStatesError(message);
      showError(message);
    } finally {
      setIsSavingStates(false);
    }
  };

  if (!currentPractice) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-dim-2">No practice selected.</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'h-full overflow-y-auto bg-[radial-gradient(rgba(15,30,54,0.025)_1px,transparent_1.2px)] [background-size:3px_3px]',
        className,
      )}
    >
      <div className="max-w-[920px] px-14 pb-20 pt-9 max-[980px]:px-[22px] max-[980px]:pb-12 max-[980px]:pt-6">
        <header className="mb-9">
          <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-dim">Settings · Practice · Coverage</div>
          <div className="flex items-start justify-between gap-4 max-sm:flex-col">
            <div>
              <h1 className="font-serif text-[48px] font-normal leading-[1.05] tracking-[-0.02em] text-ink [&_em]:text-accent">
                Where you <em>practice.</em>
              </h1>
              <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-ink-2">
                Services you offer and the jurisdictions you are licensed in. The assistant uses this to route and qualify intakes.
              </p>
            </div>
            {onBack ? (
              <Button variant="secondary" size="sm" onClick={onBack}>
                Back
              </Button>
            ) : null}
          </div>
        </header>

        {servicesError && (
          <p className="mb-4 text-xs text-neg dark:text-neg">
            {servicesError}
          </p>
        )}
        {statesError && (
          <p className="mb-4 text-xs text-red-600 dark:text-red-400">
            {statesError}
          </p>
        )}

        <SettingSection
          first
          title="Services"
          description="Choose the service areas this practice accepts for intake routing, pricing, and assistant grounding."
        >
          <SettingsCard>
            <ServicesEditor
              services={initialServiceDetails}
              onChange={(nextServices) => void saveServices(nextServices)}
              catalog={SERVICE_CATALOG}
            />
          </SettingsCard>
        </SettingSection>

        <SettingSection
          title="Licensed jurisdictions"
          description="Select the states where this practice is authorized to operate so intake qualification stays within your licensed footprint."
        >
          <SettingsCard className="max-w-[760px]">
            <Combobox
              multiple
              options={STATE_OPTIONS}
              value={displayedLicensedStates}
              onChange={(nextStates) => {
                setLicensedStatesDraft(nextStates);
                setStatesDraftTouched(true);
              }}
              placeholder="Select licensed states"
              disabled={isSavingStates}
              aria-label="Licensed states"
            />
            <SettingsHelperText className="mt-3 block">
              Additional bar details can be added after selecting your licensed states.
            </SettingsHelperText>
            <div className="mt-5 flex items-center justify-end gap-2">
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
          </SettingsCard>
        </SettingSection>
      </div>
    </div>
  );
};
