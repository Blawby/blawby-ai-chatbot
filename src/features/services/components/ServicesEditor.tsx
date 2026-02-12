/**
 * ServicesEditor - Shared services selection UI.
 */

import { Button } from '@/shared/ui/Button';
import { SERVICE_CATALOG } from '@/features/services/data/serviceCatalog';
import { ServiceCard } from '@/features/services/components/ServiceCard';
import { ServiceForm } from '@/features/services/components/ServiceForm';
import { useServices } from '@/features/services/hooks/useServices';
import { isCatalogService } from '@/features/services/utils';
import type { Service, ServiceTemplate } from '@/features/services/types';

interface ServicesEditorProps {
  services: Service[];
  onChange: (services: Service[]) => void;
  catalog?: ServiceTemplate[];
}

export const ServicesEditor = ({
  services: initialServices,
  onChange,
  catalog = SERVICE_CATALOG
}: ServicesEditorProps) => {
  const {
    services,
    toggleCatalogService,
    addCustomService,
    updateService,
    removeService,
    selectedCatalogIds
  } = useServices({
    initialServices,
    catalog,
    onChange
  });

  const customServices = services.filter((service) => !isCatalogService(service, catalog));

  return (
    <div className="space-y-6">
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
          {catalog.map((service) => (
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
                className="border border-line-default rounded-lg p-4 space-y-3 bg-surface-card shadow-card"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-input-text">
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
    </div>
  );
};
