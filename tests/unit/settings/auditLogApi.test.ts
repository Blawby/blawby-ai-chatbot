import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockApiClient } = vi.hoisted(() => ({
  mockApiClient: { get: vi.fn() },
}));

vi.mock('@/shared/lib/apiClient', () => ({ apiClient: mockApiClient }));
vi.mock('@/config/urls', () => ({
  practiceAuditLogPath: (practiceId: string) => `/api/practices/${practiceId}/audit-log`,
  practiceAuditLogExportPath: (practiceId: string) => `/api/practices/${practiceId}/audit-log/export`,
  getWorkerApiUrl: () => 'https://local.blawby.com',
}));

import { auditLogApi } from '@/features/settings/services/auditLogApi';

const practiceId = '11111111-1111-4111-8111-111111111111';
const entry = {
  id: '22222222-2222-4222-8222-222222222222',
  occurred_at: '2026-07-12T12:00:00.000Z',
  actor: {
    id: '33333333-3333-4333-8333-333333333333',
    type: 'user',
    name: 'Practice Owner',
    email: 'owner@example.test',
  },
  action_type: 'invoice.paid',
  target: { type: 'invoice', id: 'invoice-1' },
  summary: 'Invoice paid',
  source: {
    system: 'domain_event',
    producer: 'invoice.webhook',
    record_id: '22222222-2222-4222-8222-222222222222',
  },
};

describe('auditLogApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('loads a cursor page with server-side filters', async () => {
    mockApiClient.get.mockResolvedValueOnce({
      data: {
        data: [entry],
        page_info: {
          has_next_page: true,
          has_previous_page: false,
          next_cursor: 'cursor-2',
          previous_cursor: null,
        },
      },
    });

    await expect(auditLogApi.list(practiceId, { limit: 25, search: 'invoice' })).resolves.toMatchObject({
      data: [{ action_type: 'invoice.paid' }],
      page_info: { next_cursor: 'cursor-2' },
    });
    expect(mockApiClient.get).toHaveBeenCalledWith(`/api/practices/${practiceId}/audit-log`, {
      params: { limit: 25, search: 'invoice' },
      signal: undefined,
    });
  });

  it('fast-fails malformed audit rows', async () => {
    mockApiClient.get.mockResolvedValueOnce({ data: { data: [{ ...entry, source: null }], page_info: {} } });
    await expect(auditLogApi.list(practiceId)).rejects.toThrow('Audit log response was malformed.');
  });

  it('downloads authenticated CSV and preserves the server filename', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'Content-Disposition': 'attachment; filename="practice-audit.csv"' }),
      blob: vi.fn().mockResolvedValue(new Blob(['occurred_at,action_type'])),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(auditLogApi.exportCsv(practiceId, { search: 'invoice' })).resolves.toMatchObject({
      filename: 'practice-audit.csv',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `https://local.blawby.com/api/practices/${practiceId}/audit-log/export?search=invoice`,
      { credentials: 'include' },
    );
  });
});
