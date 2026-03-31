import { describe, expect, it } from 'vitest';
import { resolveServiceDetails } from '@/features/services/utils/serviceNormalization';

describe('resolveServiceDetails', () => {
  it('drops blank titles and collapses later duplicate practice-detail rows', () => {
    const resolved = resolveServiceDetails(
      {
        services: [
          {
            id: 'custom-1',
            name: ' Mediation ',
            description: 'Existing custom description'
          },
          {
            id: 'custom-2',
            name: 'mediation',
            description: 'Another custom description'
          },
          {
            id: 'custom-blank',
            name: '   ',
            description: 'Blank title description'
          }
        ]
      },
      null
    );

    expect(resolved).toEqual([
      {
        id: 'custom-1',
        title: 'Mediation',
        description: 'Existing custom description'
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
        services: [
          {
            id: 'legacy-family-law',
            name: 'family law',
            description: 'Existing intake copy'
          }
        ]
      } as Parameters<typeof resolveServiceDetails>[1]
    );

    expect(resolved).toEqual([
      {
        id: 'legacy-family-law',
        title: 'Family Law',
        description: 'Existing intake copy'
      }
    ]);
  });
});
