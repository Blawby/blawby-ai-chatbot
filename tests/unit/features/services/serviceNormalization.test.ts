import { describe, expect, it } from 'vitest';
import { resolveServiceDetails } from '@/features/services/utils/serviceNormalization';

describe('resolveServiceDetails', () => {
  it('drops blank titles and collapses later duplicate practice-detail rows', () => {
    const resolved = resolveServiceDetails(
      {
        services: [
          {
            id: 'custom-1',
            name: ' Mediation '
          },
          {
            id: 'custom-2',
            name: 'mediation'
          },
          {
            id: 'custom-blank',
            name: '   '
          }
        ]
      },
      null
    );

    expect(resolved).toEqual([
      {
        id: 'custom-1',
        title: 'Mediation'
      }
    ]);
  });

  it('falls back to practice services and canonicalizes matching catalog titles', () => {
    const resolved = resolveServiceDetails(
      null,
      {
        id: 'practice-1',
        name: 'Practice',
        slug: 'practice',
        consultationFee: null,
        paymentUrl: null,
        businessPhone: null,
        businessEmail: null,
        calendlyUrl: null,
        services: [
          {
            id: 'legacy-family-law',
            name: 'family law'
          }
        ]
      } as Parameters<typeof resolveServiceDetails>[1]
    );

    expect(resolved).toEqual([
      {
        id: 'legacy-family-law',
        title: 'Family Law'
      }
    ]);
  });
});
