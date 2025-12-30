/**
 * Services Step Component
 */

import { Button } from '@/shared/ui/Button';
import { ValidationAlert } from '../components/ValidationAlert';
import { OnboardingActions } from '../components/OnboardingActions';
import { SERVICE_CATALOG } from '@/features/services/data/serviceCatalog';
import { ServiceCard } from '@/features/services/components/ServiceCard';
import { ServiceForm } from '@/features/services/components/ServiceForm';
import { useServices } from '@/features/services/hooks/useServices';
import { isCatalogService } from '@/features/services/utils';
import type { Service } from '@/features/services/types';

interface ServicesStepProps {
  data: Service[];
  onChange: (services: Service[]) => void;
  onContinue: () => void;
  onBack: () => void;
  errors?: string | null;
}

export function ServicesStep({ data, onChange, onContinue, onBack, errors }: ServicesStepProps) {
  const {
    services,
    toggleCatalogService,
    addCustomService,
    updateService,
    removeService,
    selectedCatalogIds
  } = useServices({
    initialServices: data,
    catalog: SERVICE_CATALOG,
    onChange
  });

  const customServices = services.filter((service) => !isCatalogService(service, SERVICE_CATALOG));

  return (
    <div className="space-y-6">
      {errors && (
        <ValidationAlert type="error">
          {errors}
        </ValidationAlert>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            Practice Areas & Services
          </h3>
        </div>

        <p className="text-sm text-gray-600 dark:text-gray-400">
          Select the legal services you offer. We&apos;ll prefill descriptions and you can edit them later in settings.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          {SERVICE_CATALOG.map((service) => (
            <ServiceCard
              key={service.id}
              title={service.title}
              description={service.description}
              icon={service.icon}
              selected={selectedCatalogIds.has(service.id)}
              onSelect={() => toggleCatalogService(service)}
            />
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Custom Services</h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Add anything not listed above. You can edit these now.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => addCustomService()}>
            Add Custom Service
          </Button>
        </div>

        {customServices.length === 0 ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            No custom services added yet.
          </p>
        ) : (
          <div className="space-y-4">
            {customServices.map((service, index) => (
              <div
                key={service.id}
                className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                    Custom Service {index + 1}
                  </h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeService(service.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    Remove
                  </Button>
                </div>

                <ServiceForm
                  value={{ title: service.title, description: service.description }}
                  onChange={(value) => updateService(service.id, value)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <OnboardingActions
        onContinue={onContinue}
        onBack={onBack}
      />
    </div>
  );
}
