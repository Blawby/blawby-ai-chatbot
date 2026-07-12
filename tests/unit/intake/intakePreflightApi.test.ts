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

import { intakePreflightApi } from '@/features/intake/api/intakePreflightApi';

const practiceId = '11111111-1111-4111-8111-111111111111';
const intakeId = '22222222-2222-4222-8222-222222222222';
const keys = ['conflict', 'jurisdiction', 'practice-fit', 'capacity', 'documents', 'identity-verification'] as const;

describe('intakePreflightApi', () => {
  beforeEach(() => mockApiClient.get.mockReset());

  it('loads all six deterministic checks', async () => {
    mockApiClient.get.mockResolvedValueOnce({ data: { data: {
      intake_id: intakeId,
      overall_status: 'review',
      generated_at: '2026-07-12T12:00:00.000Z',
      checks: keys.map((key) => ({
        key,
        status: key === 'identity-verification' ? 'not_available' : 'pass',
        summary: `${key} result`,
        evidence: [],
      })),
    } } });

    const result = await intakePreflightApi.get(practiceId, intakeId);
    expect(result.overall_status).toBe('review');
    expect(result.checks).toHaveLength(6);
    expect(result.checks[0]).toMatchObject({ key: 'conflict' });
    expect(mockApiClient.get).toHaveBeenCalledWith(
      `/api/practice-client-intakes/${practiceId}/${intakeId}/preflight`,
      { signal: undefined },
    );
  });

  it('fast-fails incomplete check sets', async () => {
    mockApiClient.get.mockResolvedValueOnce({ data: { data: {
      intake_id: intakeId,
      overall_status: 'ready',
      generated_at: '2026-07-12T12:00:00.000Z',
      checks: [],
    } } });
    await expect(intakePreflightApi.get(practiceId, intakeId)).rejects.toThrow(
      'Intake preflight response was malformed.',
    );
  });
});
