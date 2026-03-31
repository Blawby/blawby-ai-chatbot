import type { Service, ServiceTemplate } from './types';
import { createServiceId } from './types';

export interface CatalogIndex {
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
  catalog: ServiceTemplate[] | CatalogIndex
): ServiceTemplate | undefined {
  const index = Array.isArray(catalog) ? buildCatalogIndex(catalog) : catalog;
  const byId = service.id ? index.byId.get(service.id) : undefined;
  if (byId) return byId;
  const titleKey = service.title ? normalizeTitleKey(service.title) : '';
  return titleKey ? index.byTitle.get(titleKey) : undefined;
}

export function normalizeServices(
  services: Service[] = [],
  catalog: ServiceTemplate[] = []
): Service[] {
  const index = buildCatalogIndex(catalog);
  const seen = new Set<string>();

  return services.flatMap((service) => {
    const id = service.id?.trim() || '';
    const title = service.title?.trim() || '';
    if (!title) return [];

    const titleKey = normalizeTitleKey(title);
    const template = (id && index.byId.get(id)) || (titleKey ? index.byTitle.get(titleKey) : undefined);
    const normalizedTitle = template?.title || title;
    const normalizedKey = normalizeTitleKey(normalizedTitle);

    if (seen.has(normalizedKey)) {
      return [];
    }
    seen.add(normalizedKey);

    return [{
      id: id || template?.id || createServiceId(),
      title: normalizedTitle
    }];
  });
}

export function getServiceTitles(services: Service[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  services.forEach((service) => {
    const title = service.title?.trim() || '';
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
    const title = service.title?.trim() || '';
    if (!title) return;
    const key = normalizeTitleKey(title);
    if (seen.has(key)) return;
    seen.add(key);
    result.push({
      id: service.id?.trim() || createServiceId(),
      title
    });
  });

  return result;
}

export function mapSelectedServiceTitlesToServices(
  selectedTitles: string[],
  currentServices: Service[],
  catalog: ServiceTemplate[] = []
): Service[] {
  const normalizedCurrentServices = normalizeServices(currentServices, catalog);
  const currentByTitle = new Map<string, Service>();
  const catalogIndex = buildCatalogIndex(catalog);
  const nextServices: Service[] = [];
  const seen = new Set<string>();

  normalizedCurrentServices.forEach((service) => {
    currentByTitle.set(normalizeTitleKey(service.title), service);
  });

  selectedTitles.forEach((value) => {
    const title = value.trim();
    if (!title) return;

    const titleKey = normalizeTitleKey(title);
    if (seen.has(titleKey)) return;
    seen.add(titleKey);

    const existing = currentByTitle.get(titleKey);
    if (existing) {
      nextServices.push(existing);
      return;
    }

    const template = catalogIndex.byTitle.get(titleKey);
    if (template) {
      nextServices.push({
        id: template.id,
        title: template.title
      });
      return;
    }

    nextServices.push({
      id: createServiceId('custom'),
      title
    });
  });

  return nextServices;
}
