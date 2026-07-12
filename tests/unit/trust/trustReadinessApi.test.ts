import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockApiClient } = vi.hoisted(() => ({
  mockApiClient: { get: vi.fn(), post: vi.fn() },
}));

vi.mock('@/shared/lib/apiClient', () => ({
  apiClient: mockApiClient,
  unwrapApiResponse: (payload: unknown) => {
    if (typeof payload === 'object' && payload !== null && 'data' in payload) {
      return (payload as { data: unknown }).data;
    }
    return payload;
  },
}));

import { trustReadinessApi } from '@/features/trust/services/trustReadinessApi';

const practiceId = '11111111-1111-4111-8111-111111111111';
const reconciliation = {
  id: '22222222-2222-4222-8222-222222222222',
  organization_id: practiceId,
  idempotency_key: '33333333-3333-4333-8333-333333333333',
  statement_ending_at: '2026-06-30T23:59:59.999Z',
  bank_statement_balance: 10_000,
  trust_book_balance: 10_000,
  client_ledger_balance: 10_000,
  bank_to_book_variance: 0,
  book_to_client_variance: 0,
  status: 'balanced',
  source: 'manual_statement',
  notes: null,
  created_by: '44444444-4444-4444-8444-444444444444',
  created_at: '2026-07-01T00:00:00.000Z',
};

describe('trustReadinessApi', () => {
  beforeEach(() => {
    mockApiClient.get.mockReset();
    mockApiClient.post.mockReset();
  });

  it('loads and validates the readiness boundary contract', async () => {
    mockApiClient.get.mockResolvedValueOnce({
      data: {
        data: {
          ledger: { client_ledger_balance: 10_000, as_of_at: '2026-07-01T00:00:00.000Z' },
          latest_reconciliation: reconciliation,
          retainer_targets: [],
          boundaries: {
            bank_source: 'manual_statement',
            operating_account_status: 'not_connected',
            invoice_receivables_included: false,
            operating_revenue_included: false,
          },
        },
      },
    });

    await expect(trustReadinessApi.getReadiness(practiceId)).resolves.toMatchObject({
      latest_reconciliation: { status: 'balanced' },
      boundaries: { operating_account_status: 'not_connected' },
    });
    expect(mockApiClient.get).toHaveBeenCalledWith(`/api/trust/${practiceId}/readiness`, { signal: undefined });
  });

  it('fast-fails malformed readiness responses', async () => {
    mockApiClient.get.mockResolvedValueOnce({ data: { data: { ledger: { client_ledger_balance: '100.00' } } } });
    await expect(trustReadinessApi.getReadiness(practiceId)).rejects.toThrow('Trust readiness response was malformed.');
  });

  it('posts immutable reconciliation inputs and validates the response', async () => {
    mockApiClient.post.mockResolvedValueOnce({ data: { data: reconciliation } });
    const input = {
      idempotency_key: reconciliation.idempotency_key,
      statement_ending_at: reconciliation.statement_ending_at,
      bank_statement_balance: 10_000,
      trust_book_balance: 10_000,
    };

    await expect(trustReadinessApi.reconcile(practiceId, input)).resolves.toMatchObject({ status: 'balanced' });
    expect(mockApiClient.post).toHaveBeenCalledWith(`/api/trust/${practiceId}/reconciliations`, input);
  });
});
