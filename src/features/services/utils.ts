import type { Service, ServiceTemplate } from './types';
import { createServiceId } from './types';

interface CatalogIndex {
  byId: Map<string, ServiceTemplate>;
  byTitle: Map<string, ServiceTemplate>;
}

const normalizeTitleKey = (title: string) => title.trim().toLowerCase();

export function buildCatalogIndex(catalog: ServiceTemplate[]): CatalogIndex {
  const byId = new Map<string, ServiceTemplate>();
  const byTitle = new Map<string, ServiceTemplate>();

  catalog.forEach((item) => {
    if (item.id) {
      byId.set(item.id, item);
    }
    if (item.title) {
      byTitle.set(normalizeTitleKey(item.title), item);
    }
  });

  return { byId, byTitle };
}

export function findTemplateForService(
  service: Service,
  catalog: ServiceTemplate[]
): ServiceTemplate | undefined {
  const index = buildCatalogIndex(catalog);
  const byId = service.id ? index.byId.get(service.id) : undefined;
  if (byId) return byId;
  const titleKey = service.title ? normalizeTitleKey(service.title) : '';
  return titleKey ? index.byTitle.get(titleKey) : undefined;
}

export function doesServiceMatchTemplate(service: Service, template: ServiceTemplate): boolean {
  if (service.id && service.id === template.id) return true;
  const serviceTitle = service.title.trim().toLowerCase();
  const templateTitle = template.title.trim().toLowerCase();
  return serviceTitle.length > 0 && serviceTitle === templateTitle;
}

export function isCatalogService(service: Service, catalog: ServiceTemplate[]): boolean {
  return Boolean(findTemplateForService(service, catalog));
}

export function normalizeServices(
  services: Service[] = [],
  catalog: ServiceTemplate[] = []
): Service[] {
  const index = buildCatalogIndex(catalog);

  return services.map((service) => {
    const id = service.id?.trim() || '';
    const title = service.title ?? '';
    const description = service.description ?? '';
    const titleKey = title ? normalizeTitleKey(title) : '';
    const template = (id && index.byId.get(id)) || (titleKey ? index.byTitle.get(titleKey) : undefined);

    return {
      id: id || template?.id || createServiceId(),
      title: title.trim() || template?.title || '',
      description: description.trim().length > 0 ? description : template?.description || ''
    };
  });
}

export function getServiceTitles(services: Service[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  services.forEach((service) => {
    const title = service.title.trim();
    if (!title) return;
    const key = normalizeTitleKey(title);
    if (seen.has(key)) return;
    seen.add(key);
    result.push(title);
  });

  return result;
}

export function getServiceDetailsForSave(services: Service[]): Service[] {
  const seen = new Set<string>();
  const result: Service[] = [];

  services.forEach((service) => {
    const title = service.title.trim();
    if (!title) return;
    const key = normalizeTitleKey(title);
    if (seen.has(key)) return;
    seen.add(key);
    result.push({
      id: service.id?.trim() || createServiceId(),
      title,
      description: service.description.trim()
    });
  });

  return result;
}
