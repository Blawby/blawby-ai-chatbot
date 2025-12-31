import { useMemo, useRef, useState, useCallback, useEffect } from 'preact/hooks';
import { ArrowLeftIcon, PlusIcon } from '@heroicons/react/24/outline';
import { usePracticeManagement, type Practice } from '@/shared/hooks/usePracticeManagement';
import { Button } from '@/shared/ui/Button';
import { ServicesList } from '@/features/services/components/ServicesList';
import { SERVICE_CATALOG } from '@/features/services/data/serviceCatalog';
import { useServices } from '@/features/services/hooks/useServices';
import { createServiceId, type Service } from '@/features/services/types';
import { getServiceDetailsForSave, getServiceTitles, normalizeServices } from '@/features/services/utils';
import type { PracticeConfig } from '../../../../worker/types';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useNavigation } from '@/shared/utils/navigation';
import Modal from '@/shared/components/Modal';
import { ServiceForm } from '@/features/services/components/ServiceForm';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const resolveVoiceProvider = (value: unknown): PracticeConfig['voice']['provider'] => {
  if (value === 'cloudflare' || value === 'elevenlabs' || value === 'custom') {
    return value;
  }
  return 'cloudflare';
};

const resolveConversationConfig = (practice: Practice | null): PracticeConfig | null => {
  if (!practice) return null;
  const metadata = practice.metadata;
  if (isPlainObject(metadata)) {
    const candidate = metadata.conversationConfig;
    if (isPlainObject(candidate)) {
      if ('availableServices' in candidate || 'serviceQuestions' in candidate) {
        return candidate as unknown as PracticeConfig;
      }
    }
  }
  const config = practice.config;
  if (isPlainObject(config)) {
    const nestedCandidate = (config as Record<string, unknown>).conversationConfig;
    if (isPlainObject(nestedCandidate)) {
      return nestedCandidate as unknown as PracticeConfig;
    }
    if (
      'availableServices' in config ||
      'serviceQuestions' in config ||
      'introMessage' in config
    ) {
      return config as unknown as PracticeConfig;
    }
  }
  return null;
};

const buildBaseConversationConfig = (config: PracticeConfig | null): PracticeConfig => {
  const voice = isPlainObject(config?.voice) ? (config?.voice as Record<string, unknown>) : {};
  return {
    ownerEmail: typeof config?.ownerEmail === 'string' ? config.ownerEmail : undefined,
    availableServices: Array.isArray(config?.availableServices) ? config.availableServices : [],
    serviceQuestions: isPlainObject(config?.serviceQuestions)
      ? (config?.serviceQuestions as Record<string, string[]>)
      : {},
    domain: typeof config?.domain === 'string' ? config.domain : '',
    description: typeof config?.description === 'string' ? config.description : '',
    brandColor: typeof config?.brandColor === 'string' ? config.brandColor : '#000000',
    accentColor: typeof config?.accentColor === 'string' ? config.accentColor : '#000000',
    introMessage: typeof config?.introMessage === 'string' ? config.introMessage : '',
    profileImage: typeof config?.profileImage === 'string' ? config.profileImage : undefined,
    voice: {
      enabled: typeof voice.enabled === 'boolean' ? voice.enabled : false,
      provider: resolveVoiceProvider(voice.provider),
      voiceId: typeof voice.voiceId === 'string' ? voice.voiceId : null,
      displayName: typeof voice.displayName === 'string' ? voice.displayName : null,
      previewUrl: typeof voice.previewUrl === 'string' ? voice.previewUrl : null
    },
    metadata: isPlainObject(config?.metadata) ? (config?.metadata as Record<string, unknown>) : {}
  };
};

const coerceServiceDetails = (value: unknown): Service[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!isPlainObject(item)) return null;
      const title = typeof item.title === 'string' ? item.title : '';
      if (!title.trim()) return null;
      const rawId = typeof item.id === 'string' ? item.id.trim() : '';
      return {
        id: rawId || createServiceId(),
        title,
        description: typeof item.description === 'string' ? item.description : ''
      } as Service;
    })
    .filter((item): item is Service => item !== null);
};

const resolveServiceDetails = (config: PracticeConfig | null): Service[] => {
  if (!config) return [];
  const metadata = isPlainObject(config.metadata) ? (config.metadata as Record<string, unknown>) : null;
  const details = metadata ? coerceServiceDetails(metadata.serviceDetails) : [];
  if (details.length > 0) {
    return normalizeServices(details, SERVICE_CATALOG);
  }
  const available = Array.isArray(config.availableServices)
    ? config.availableServices.filter((item): item is string => typeof item === 'string')
    : [];
  const fallback = available.map((title) => ({ id: '', title, description: '' }));
  return normalizeServices(fallback, SERVICE_CATALOG);
};

interface PracticeServicesPageProps {
  onNavigate?: (path: string) => void;
}

export const PracticeServicesPage = ({ onNavigate }: PracticeServicesPageProps) => {
  const { currentPractice, updatePractice } = usePracticeManagement();
  const { showError, showSuccess } = useToastContext();
  const { navigate: baseNavigate } = useNavigation();
  const navigate = onNavigate ?? baseNavigate;
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addDraft, setAddDraft] = useState<{ title: string; description: string }>({
    title: '',
    description: ''
  });
  const saveTimeoutRef = useRef<number | null>(null);
  const lastSavedKeyRef = useRef<string>('');
  const lastToastAtRef = useRef(0);
  const toastCooldownMs = 4000;

  const conversationConfig = useMemo(
    () => resolveConversationConfig(currentPractice),
    [currentPractice]
  );
  const initialServiceDetails = useMemo(
    () => resolveServiceDetails(conversationConfig),
    [conversationConfig]
  );

  const saveServices = useCallback(async (nextServices: Service[]) => {
    if (!currentPractice) return;
    const titles = getServiceTitles(nextServices);
    const details = getServiceDetailsForSave(nextServices);
    const payloadKey = JSON.stringify({ titles, details });
    if (payloadKey === lastSavedKeyRef.current) {
      return;
    }

    try {
      const baseConfig = buildBaseConversationConfig(conversationConfig);
      const updatedConfig: PracticeConfig = {
        ...baseConfig,
        availableServices: titles,
        metadata: {
          ...(baseConfig.metadata || {}),
          serviceDetails: details
        }
      };

      const metadataBase = isPlainObject(currentPractice.metadata)
        ? currentPractice.metadata
        : {};

      await updatePractice(currentPractice.id, {
        metadata: {
          ...metadataBase,
          conversationConfig: updatedConfig
        }
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
  }, [conversationConfig, currentPractice, showError, showSuccess, updatePractice]);

  const scheduleSave = useCallback((nextServices: Service[]) => {
    if (!currentPractice) return;
    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
    }
    setServicesError(null);
    saveTimeoutRef.current = window.setTimeout(() => {
      void saveServices(nextServices);
    }, 400);
  }, [currentPractice, saveServices]);

  const {
    services: serviceDrafts,
    addCustomService,
    updateService,
    removeService
  } = useServices({
    initialServices: initialServiceDetails,
    catalog: SERVICE_CATALOG,
    onChange: (nextServices) => {
      scheduleSave(nextServices);
    }
  });

  useEffect(() => () => {
    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
    }
  }, []);

  const openAddModal = () => {
    setAddDraft({ title: '', description: '' });
    setIsAddModalOpen(true);
  };

  const handleAddService = () => {
    if (!addDraft.title.trim()) return;
    addCustomService(addDraft);
    setAddDraft({ title: '', description: '' });
    setIsAddModalOpen(false);
  };

  if (!currentPractice) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-gray-500">No practice selected.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
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
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Services</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Manage the legal services shown to clients during intake.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button size="sm" onClick={openAddModal}>
                <PlusIcon className="w-4 h-4 mr-2" />
                Add Service
              </Button>
            </div>
          </div>
        </div>

        {servicesError && (
          <p className="text-xs text-red-600 dark:text-red-400 mb-4">
            {servicesError}
          </p>
        )}

        <ServicesList
          services={serviceDrafts}
          onUpdateService={updateService}
          onRemoveService={removeService}
          emptyMessage="Use Add Service to create your first service."
        />
      </div>

      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add Service"
      >
        <div className="space-y-4">
          <ServiceForm
            value={addDraft}
            onChange={setAddDraft}
            titleLabel="Service Title"
            descriptionLabel="Description"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleAddService} disabled={!addDraft.title.trim()}>
              Add Service
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
