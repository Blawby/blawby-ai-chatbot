import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockApiClient } = vi.hoisted(() => ({
  mockApiClient: { get: vi.fn() },
}));

vi.mock('@/shared/lib/apiClient', () => ({
  apiClient: mockApiClient,
  unwrapApiResponse: (payload: unknown) => (
    typeof payload === 'object' && payload !== null && 'data' in payload
      ? (payload as { data: unknown }).data
      : payload
  ),
}));

import { practiceInsightsApi } from '@/features/insights/services/practiceInsightsApi';

const practiceId = '11111111-1111-4111-8111-111111111111';

describe('practiceInsightsApi', () => {
  beforeEach(() => mockApiClient.get.mockReset());

  it('loads grounded client check-in signals', async () => {
    mockApiClient.get.mockResolvedValueOnce({ data: { data: {
      topic: 'client-checkins',
      generated_at: '2026-07-12T12:00:00.000Z',
      data: [{
        client_id: '22222222-2222-4222-8222-222222222222',
        signal: 'silent',
        last_contact_at: '2026-06-01T12:00:00.000Z',
        last_contact_source: 'memo-event',
        recency_days: 41,
        open_matter_count: 1,
        highest_urgency: 'routine',
        reasons: ['no recorded contact for 30 days'],
      }],
    } } });

    await expect(practiceInsightsApi.getClientCheckins(practiceId)).resolves.toMatchObject([
      { signal: 'silent', recency_days: 41 },
    ]);
  });

  it('loads grounded matter risk signals', async () => {
    mockApiClient.get.mockResolvedValueOnce({ data: { data: {
      topic: 'matter-risk',
      generated_at: '2026-07-12T12:00:00.000Z',
      data: [{
        matter_id: '33333333-3333-4333-8333-333333333333',
        signal: 'warn',
        last_activity_at: '2026-07-02T12:00:00.000Z',
        last_activity_source: 'activity-log',
        recency_days: 10,
        tags: ['low-retainer'],
        reasons: ['retainer is below threshold'],
      }],
    } } });

    await expect(practiceInsightsApi.getMatterRisks(practiceId)).resolves.toMatchObject([
      { signal: 'warn', tags: ['low-retainer'] },
    ]);
  });

  it('fast-fails malformed signal responses', async () => {
    mockApiClient.get.mockResolvedValueOnce({ data: { data: { topic: 'client-checkins', data: [] } } });
    await expect(practiceInsightsApi.getClientCheckins(practiceId)).rejects.toThrow(
      'Client check-in insights response was malformed.',
    );
  });
});
