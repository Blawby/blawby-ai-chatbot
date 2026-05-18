import { describe, expect, it } from 'vitest';
import { SERVICE_CATALOG } from '@/features/services/data/serviceCatalog';
import {
  getServiceDetailsForSave,
  mapSelectedServiceTitlesToServices,
  normalizeServices
} from '@/features/services/utils';
import type { Service } from '@/features/services/types';

describe('normalizeServices', () => {
  it('drops blank titles and collapses later duplicate titles', () => {
    const services: Service[] = [
      {
        id: 'custom-1',
        title: ' Mediation '
      },
      {
        id: 'custom-2',
        title: 'mediation'
      },
      {
        id: 'custom-blank',
        title: '   '
      }
    ];

    expect(normalizeServices(services, SERVICE_CATALOG)).toEqual([
      {
        id: 'custom-1',
        title: 'Mediation'
      }
    ]);
  });

  it('canonicalizes catalog titles while preserving the first matching service metadata', () => {
    const services: Service[] = [
      {
        id: 'legacy-family-law',
        title: 'family law'
      }
    ];

    expect(normalizeServices(services, SERVICE_CATALOG)).toEqual([
      {
        id: 'legacy-family-law',
        title: 'Family Law'
      }
    ]);
  });
});

describe('getServiceDetailsForSave', () => {
  it('trims values and dedupes titles case-insensitively for save', () => {
    const services: Service[] = [
      {
        id: 'custom-1',
        title: ' Mediation '
      },
      {
        id: 'custom-2',
        title: 'mediation'
      }
    ];

    expect(getServiceDetailsForSave(services)).toEqual([
      {
        id: 'custom-1',
        title: 'Mediation'
      }
    ]);
  });
});

describe('mapSelectedServiceTitlesToServices', () => {
  it('preserves an existing service matched by title case-insensitively', () => {
    const currentServices: Service[] = [
      {
        id: 'legacy-family-law',
        title: 'family law'
      }
    ];

    expect(
      mapSelectedServiceTitlesToServices(['Family Law'], currentServices, SERVICE_CATALOG)
    ).toEqual([
      {
        id: 'legacy-family-law',
        title: 'Family Law'
      }
    ]);
  });

  it('uses catalog metadata for new catalog selections and creates new custom rows for free-text values', () => {
    const selected = mapSelectedServiceTitlesToServices(
      ['Family Law', 'Tenant Advocacy'],
      [],
      SERVICE_CATALOG
    );

    expect(selected[0]).toEqual({
      id: 'family-law',
      title: 'Family Law'
    });
    expect(selected[1]).toMatchObject({
      title: 'Tenant Advocacy'
    });
    expect(selected[1].id).toMatch(/^custom-/);
  });

  it('dedupes selected titles case-insensitively', () => {
    const selected = mapSelectedServiceTitlesToServices(
      ['Family Law', ' family law ', 'FAMILY LAW'],
      [],
      SERVICE_CATALOG
    );

    expect(selected).toEqual([
      {
        id: 'family-law',
        title: 'Family Law'
      }
    ]);
  });
});
