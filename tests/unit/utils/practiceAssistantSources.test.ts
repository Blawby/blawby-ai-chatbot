import { describe, expect, it } from 'vitest';
import { parsePracticeAssistantSources } from '@/shared/utils/practiceAssistantSources';

describe('parsePracticeAssistantSources', () => {
  it('preserves valid grounded source metadata for UI messages', () => {
    expect(parsePracticeAssistantSources([
      { type: 'matter', id: 'matter-1', label: 'Smith matter', href: '/practice/acme/matters/matter-1' },
      { type: 'report', id: 'revenue', label: 'Revenue report' },
    ])).toEqual([
      { type: 'matter', id: 'matter-1', label: 'Smith matter', href: '/practice/acme/matters/matter-1' },
      { type: 'report', id: 'revenue', label: 'Revenue report' },
    ]);
  });

  it.each([undefined, null, [], [{ type: 'matter', id: '', label: 'Broken' }]])(
    'omits absent or malformed source metadata: %j',
    (value) => {
      expect(parsePracticeAssistantSources(value)).toBeUndefined();
    },
  );
});
