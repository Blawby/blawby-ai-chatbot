import { useMemo, useRef, useState, useCallback } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { usePracticeDetails } from '@/shared/hooks/usePracticeDetails';
import { ServicesEditor } from '@/features/services/components/ServicesEditor';
import { SERVICE_CATALOG } from '@/features/services/data/serviceCatalog';
import type { Service } from '@/features/services/types';
import { getServiceDetailsForSave } from '@/features/services/utils';
import { resolveServiceDetails } from '@/features/services/utils/serviceNormalization';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useNavigation } from '@/shared/utils/navigation';
import { Button } from '@/shared/ui/Button';
import { SettingsPageLayout } from '@/features/settings/components/SettingsPageLayout';
import { buildSettingsPath, resolveSettingsBasePath } from '@/shared/utils/workspace';

interface PracticeServicesPageProps {
  onNavigate?: (path: string) => void;
}

export const PracticeServicesPage = ({ onNavigate }: PracticeServicesPageProps) => {
  const { currentPractice } = usePracticeManagement({ fetchPracticeDetails: true });
  const { details, updateDetails } = usePracticeDetails(currentPractice?.id, null, false);
  const { showError, showSuccess } = useToastContext();
  const { navigate: baseNavigate } = useNavigation();
  const navigate = onNavigate ?? baseNavigate;
  const location = useLocation();
  const [servicesError, setServicesError] = useState<string | null>(null);
  const settingsBasePath = resolveSettingsBasePath(location.path);
  const toSettingsPath = (subPath?: string) => buildSettingsPath(settingsBasePath, subPath);
  const lastSavedKeyRef = useRef<string>('');
  const lastToastAtRef = useRef(0);
  const toastCooldownMs = 4000;

  const initialServiceDetails = useMemo(
    () => resolveServiceDetails(details, currentPractice),
    [details, currentPractice]
  );

  const saveServices = useCallback(async (nextServices: Service[]) => {
    if (!currentPractice) return;
    setServicesError(null);
    const details = getServiceDetailsForSave(nextServices);
    const apiServices = details
      .map(({ id, title, description }) => ({
        id: id.trim(),
        name: title.trim(),
        ...(description.trim() ? { description: description.trim() } : {})
      }))
      .filter((service) => service.id && service.name);
    const payloadKey = JSON.stringify(apiServices);
    if (payloadKey === lastSavedKeyRef.current) {
      return;
    }

    try {
      await updateDetails({
        services: apiServices
      });

      lastSavedKeyRef.current = payloadKey;
      const now = Date.now();
      if (now - lastToastAtRef.current > toastCooldownMs) {
        showSuccess('Services saved', 'Your services have been updated.');
        lastToastAtRef.current = now;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update services';
      setServicesError(message);
      showError('Services update failed', message);
    }
  }, [currentPractice, showError, showSuccess, updateDetails]);

  if (!currentPractice) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-input-placeholder">No practice selected.</p>
      </div>
    );
  }

  return (
    <SettingsPageLayout
      title="Services"
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
          Manage the legal services shown to clients during intake.
        </p>
      </div>

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
    </SettingsPageLayout>
  );
};
