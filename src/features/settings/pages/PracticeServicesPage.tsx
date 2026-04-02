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
import { ContentPageLayout } from '@/shared/ui/layout';

interface PracticeServicesPageProps {
  className?: string;
}

export const PracticeServicesPage = ({ className }: PracticeServicesPageProps) => {
  const { currentPractice } = usePracticeManagement({ fetchPracticeDetails: true });
  const { details, updateDetails, setDetails } = usePracticeDetails(currentPractice?.id, null, false);
  const { showError, showSuccess } = useToastContext();
  const { t } = useTranslation(['settings', 'common']);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const lastSavedKeyRef = useRef<string>('');
  const saveRequestIdRef = useRef(0);
  const pendingSaveSnapshotsRef = useRef(new Map<number, { optimisticDetails: typeof details }>());
  const confirmedDetailsRef = useRef(details);
  const confirmedSaveIdRef = useRef(0);
  const lastToastAtRef = useRef(0);
  const toastCooldownMs = 4000;
  if (pendingSaveSnapshotsRef.current.size === 0) {
    confirmedDetailsRef.current = details;
    confirmedSaveIdRef.current = saveRequestIdRef.current;
  }

  const initialServiceDetails = useMemo(
    () => resolveServiceDetails(details, currentPractice),
    [details, currentPractice]
  );

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

  if (!currentPractice) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-input-placeholder">No practice selected.</p>
      </div>
    );
  }

  return (
    <ContentPageLayout
      title={t('settings:practice.services')}
      className={className}
      wrapChildren={false}
      contentClassName="pb-6"
    >
      {servicesError && (
        <p className="text-xs text-red-600 dark:text-red-400 mb-4">
          {servicesError}
        </p>
      )}

      <ServicesEditor
        services={initialServiceDetails}
        onChange={(nextServices) => void saveServices(nextServices)}
        catalog={SERVICE_CATALOG}
      />
    </ContentPageLayout>
  );
};
