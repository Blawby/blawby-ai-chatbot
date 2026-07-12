import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockApiClient } = vi.hoisted(() => ({
  mockApiClient: { get: vi.fn(), post: vi.fn() },
}));

vi.mock('@/shared/lib/apiClient', () => ({ apiClient: mockApiClient }));

import { practiceExportsApi } from '@/features/settings/services/practiceExportsApi';

const practiceId = '11111111-1111-4111-8111-111111111111';
const exportId = '22222222-2222-4222-8222-222222222222';
const requestKey = '33333333-3333-4333-8333-333333333333';
const userId = '44444444-4444-4444-8444-444444444444';

const job = {
  id: exportId,
  organization_id: practiceId,
  requested_by: userId,
  idempotency_key: requestKey,
  type: 'full_practice_archive',
  status: 'queued',
  content_type: null,
  byte_size: null,
  manifest: null,
  error: null,
  created_at: '2026-07-12T12:00:00.000Z',
  started_at: null,
  completed_at: null,
  failed_at: null,
  download: null,
};

describe('practiceExportsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requests a durable export with its idempotency key', async () => {
    mockApiClient.post.mockResolvedValueOnce({ data: { export: job } });
    await expect(practiceExportsApi.request(practiceId, 'full_practice_archive', requestKey)).resolves.toMatchObject({
      id: exportId,
      status: 'queued',
    });
    expect(mockApiClient.post).toHaveBeenCalledWith(`/api/practices/${practiceId}/exports`, {
      type: 'full_practice_archive',
      idempotency_key: requestKey,
    });
  });

  it('gets a completed job with a time-limited download URL', async () => {
    mockApiClient.get.mockResolvedValueOnce({
      data: {
        export: {
          ...job,
          status: 'completed',
          content_type: 'application/json',
          byte_size: 512,
          manifest: { schema_version: 1 },
          completed_at: '2026-07-12T12:01:00.000Z',
          download: {
            url: 'https://storage.example.test/signed',
            expires_at: '2026-07-12T12:06:00.000Z',
          },
        },
      },
    });
    await expect(practiceExportsApi.get(practiceId, exportId)).resolves.toMatchObject({
      status: 'completed',
      download: { url: 'https://storage.example.test/signed' },
    });
    expect(mockApiClient.get).toHaveBeenCalledWith(`/api/practices/${practiceId}/exports/${exportId}`, {
      signal: undefined,
    });
  });

  it('fast-fails malformed job state', async () => {
    mockApiClient.get.mockResolvedValueOnce({ data: { export: { ...job, status: 'pretend-complete' } } });
    await expect(practiceExportsApi.get(practiceId, exportId)).rejects.toThrow('Practice export response was malformed.');
  });
});
