import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Service, ServiceTemplate } from '../types';
import {
  buildCatalogIndex,
  doesServiceMatchTemplate,
  getServiceDetailsForSave as buildServiceDetailsForSave,
  getServiceTitles,
  normalizeServices
} from '../utils';
import { createServiceId } from '../types';

interface UseServicesOptions {
  initialServices?: Service[];
  catalog?: ServiceTemplate[];
  onChange?: (services: Service[]) => void;
}

interface UseServicesResult {
  services: Service[];
  setServices: (services: Service[]) => void;
  toggleCatalogService: (template: ServiceTemplate) => void;
  addCustomService: (initial?: Partial<Service>) => void;
  updateService: (id: string, updates: Partial<Pick<Service, 'title' | 'description'>>) => void;
  removeService: (id: string) => void;
  selectedCatalogIds: Set<string>;
  getServiceTitlesForSave: () => string[];
  getServiceDetailsForSave: () => Service[];
}

export function useServices({
  initialServices = [],
  catalog = [],
  onChange
}: UseServicesOptions): UseServicesResult {
  const [services, setServicesState] = useState<Service[]>(() =>
    normalizeServices(initialServices, catalog)
  );
  const isDirty = useRef(false);

  useEffect(() => {
    // Sync from upstream data until a local edit occurs.
    if (isDirty.current) return;
    setServicesState(normalizeServices(initialServices, catalog));
  }, [initialServices, catalog]);

  const setServices = useCallback((next: Service[]) => {
    isDirty.current = true;
    setServicesState(next);
    onChange?.(next);
  }, [onChange]);

  const selectedCatalogIds = useMemo(() => {
    const index = buildCatalogIndex(catalog);
    const selected = new Set<string>();

    services.forEach((service) => {
      if (service.id && index.byId.has(service.id)) {
        selected.add(service.id);
        return;
      }
      if (typeof service.title !== 'string' || !service.title.trim()) return;
      const titleKey = service.title.trim().toLowerCase();
      const template = index.byTitle.get(titleKey);
      if (template) {
        selected.add(template.id);
      }
    });

    return selected;
  }, [services, catalog]);

  const toggleCatalogService = useCallback((template: ServiceTemplate) => {
    const isSelected = services.some((service) => doesServiceMatchTemplate(service, template));
    if (isSelected) {
      const next = services.filter((service) => !doesServiceMatchTemplate(service, template));
      setServices(next);
      return;
    }

    setServices([
      ...services,
      {
        id: template.id,
        title: template.title,
        description: template.description
      }
    ]);
  }, [services, setServices]);

  const addCustomService = useCallback((initial?: Partial<Service>) => {
    const nextService: Service = {
      id: initial?.id || createServiceId('custom'),
      title: initial?.title || '',
      description: initial?.description || ''
    };

    setServices([...services, nextService]);
  }, [services, setServices]);

  const updateService = useCallback((id: string, updates: Partial<Pick<Service, 'title' | 'description'>>) => {
    const next = services.map((service) => {
      if (service.id !== id) return service;
      return {
        ...service,
        ...updates
      };
    });
    setServices(next);
  }, [services, setServices]);

  const removeService = useCallback((id: string) => {
    setServices(services.filter((service) => service.id !== id));
  }, [services, setServices]);

  const getServiceTitlesForSave = useCallback(() => getServiceTitles(services), [services]);
  const getServiceDetailsForSave = useCallback(() => buildServiceDetailsForSave(services), [services]);

  return {
    services,
    setServices,
    toggleCatalogService,
    addCustomService,
    updateService,
    removeService,
    selectedCatalogIds,
    getServiceTitlesForSave,
    getServiceDetailsForSave
  };
}
