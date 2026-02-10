import type { Practice } from '@/shared/hooks/usePracticeManagement';
import { SERVICE_CATALOG } from '@/features/services/data/serviceCatalog';
import { normalizeServices } from '@/features/services/utils';
import type { Service } from '@/features/services/types';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const createServiceId = (value: string) => value.toLowerCase().replace(/\s+/g, '-');

const coerceServiceDetails = (value: unknown): Service[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!isPlainObject(item)) return null;
      const title = typeof item.name === 'string'
        ? item.name
        : (typeof item.title === 'string' ? item.title : '');
      if (!title.trim()) return null;
      const rawId = typeof item.id === 'string' ? item.id.trim() : '';
      return {
        id: rawId || createServiceId(title),
        title,
        description: typeof item.description === 'string' ? item.description : ''
      } as Service;
    })
    .filter((item): item is Service => item !== null);
};

export const resolveServiceDetails = (
  details: { services?: Array<Record<string, unknown>> | null } | null,
  practice: Practice | null
): Service[] => {
  if (Array.isArray(details?.services)) {
    const fromDetails = coerceServiceDetails(details.services);
    return normalizeServices(fromDetails, SERVICE_CATALOG);
  }
  if (details?.services === null) {
    return [];
  }
  if (practice?.services) {
    const fromPractice = coerceServiceDetails(practice.services);
    if (fromPractice.length > 0) {
      return normalizeServices(fromPractice, SERVICE_CATALOG);
    }
  }
  return [];
};
