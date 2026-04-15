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
import { SectionDivider, SettingsPage } from '@/shared/ui/layout';
import { Tabs } from '@/shared/ui/tabs';
import { TagInput } from '@/shared/ui/tag';
import { Button } from '@/shared/ui/Button';
import { SettingsHelperText } from '@/features/settings/components/SettingsHelperText';
import { buildPracticeProfilePayloads } from '@/shared/utils/practiceProfile';

type CoverageSettingsTab = 'services' | 'states';

const COVERAGE_TABS = [
  { id: 'services', label: 'Services' },
  { id: 'states', label: 'Licensed states' },
];

const US_STATE_CODES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
];

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
  const [activeTab, setActiveTab] = useState<CoverageSettingsTab>('services');
  const [licensedStatesDraft, setLicensedStatesDraft] = useState<string[]>([]);
  const [statesDraftTouched, setStatesDraftTouched] = useState(false);
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
      if (saveId >= confirmedSaveIdRef.current) {
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

  const validateStateTag = useCallback((tag: string): boolean | string => {
    const upper = tag.trim().toUpperCase();
    if (!US_STATE_CODES.includes(upper)) {
      return `"${tag}" is not a valid US state code`;
    }
    return true;
  }, []);

  const handleSaveLicensedStates = async () => {
    if (!currentPractice) return;
    const validStates = licensedStatesDraft.filter((state) => US_STATE_CODES.includes(state));
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
      setDetails(savedDetails);
      setLicensedStatesDraft(validStates);
      setStatesDraftTouched(false);
      showSuccess('Licensed states updated.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update licensed states';
      setStatesError(message);
      showError(message);
    } finally {
      setIsSavingStates(false);
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
    <SettingsPage
      title="Coverage"
      subtitle="Services and licensed states"
      showBack={Boolean(onBack)}
      backVariant="close"
      onBack={onBack}
      className={className}
    >
      <div className="space-y-6">
        <Tabs
          items={COVERAGE_TABS}
          activeId={activeTab}
          onChange={(id) => setActiveTab(id as CoverageSettingsTab)}
        />

        {servicesError && (
          <p className="text-xs text-red-600 dark:text-red-400 mb-4">
            {servicesError}
          </p>
        )}
        {statesError && (
          <p className="text-xs text-red-600 dark:text-red-400 mb-4">
            {statesError}
          </p>
        )}

        {activeTab === 'services' ? (
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
        ) : (
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-input-text">Licensed states</h3>
              <SettingsHelperText className="mt-1">
                Enter US state codes where this practice is licensed. Used to help the assistant reason about jurisdiction.
              </SettingsHelperText>
            </div>
            <TagInput
              value={displayedLicensedStates}
              onChange={(nextStates) => {
                setLicensedStatesDraft(nextStates);
                setStatesDraftTouched(true);
              }}
              suggestions={US_STATE_CODES}
              placeholder="Add state code (e.g. NC)"
              normalizeTag={(tag) => tag.trim().toUpperCase()}
              onValidate={validateStateTag}
              maxTagLength={2}
              disabled={isSavingStates}
              aria-label="Licensed states"
            />
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
        )}
      </div>
    </SettingsPage>
  );
};
