import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockApiClient, mockInvalidate } = vi.hoisted(() => ({
  mockApiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
  mockInvalidate: vi.fn(),
}));

vi.mock('@/shared/lib/apiClient', () => ({
  apiClient: mockApiClient,
  isHttpError: (error: unknown): error is { response: { status: number; data: unknown } } =>
    typeof error === 'object' && error !== null && 'response' in error,
  unwrapApiResponse: <T,>(payload: unknown, fallbackMessage = 'Request failed'): T => {
    if (payload && typeof payload === 'object' && 'success' in payload) {
      const envelope = payload as { success: boolean; data?: unknown; error?: unknown; message?: unknown };
      if (envelope.success === false) {
        throw new Error(
          typeof envelope.error === 'string' ? envelope.error :
            typeof envelope.message === 'string' ? envelope.message :
              fallbackMessage,
        );
      }
      return envelope.data as T;
    }
    return payload as T;
  },
}));

vi.mock('@/shared/lib/queryCache', () => ({
  queryCache: {
    invalidate: mockInvalidate,
  },
}));

import {
  acceptEngagement,
  createEngagementContract,
  getEngagement,
  listEngagements,
  patchEngagementContract,
  sendEngagementToClient,
} from '@/features/engagements/api/engagementsApi';
import type { ProposalData } from '@/features/engagements/types/engagement';

const practiceId = 'practice-123';
const contractId = 'contract-123';

const proposalData: ProposalData = {
  client_summary: {
    client_name: 'Jane Client',
    matter_summary: 'Custody consultation',
    location_summary: '',
    goals_summary: '',
  },
  representation: {
    scope_summary: 'Limited scope representation.',
    included_services: [],
    excluded_services: [],
    client_identity_notes: '',
    jurisdiction_notes: '',
  },
  fees: {
    billing_type: 'fixed',
    fixed_fee_amount: 1500,
    fee_notes: '',
  },
  risk_review: {
    conflict_status: 'unknown',
    jurisdiction_status: 'unknown',
    risk_notes: [],
    open_questions: [],
  },
  source_snapshot: {
    intake_uuid: 'intake-123',
    conversation_id: 'conversation-123',
    matter_id: '',
    practice_area: '',
    urgency: '',
    desired_outcome: '',
    opposing_party: '',
    court_date: null,
  },
  draft_meta: {
    generated_at: '2026-05-22T10:00:00.000Z',
    generated_by: 'staff',
    version: 1,
  },
};

const engagementPayload = {
  id: contractId,
  intake_id: 'intake-123',
  matter_id: null,
  organization_id: practiceId,
  status: 'draft',
  contract_body: 'Contract text',
  billing_snapshot: null,
  engagement_notes: 'Notes',
  proposal_data: proposalData,
  created_at: '2026-05-22T10:00:00.000Z',
  updated_at: '2026-05-22T10:00:00.000Z',
};

describe('engagementsApi', () => {
  beforeEach(() => {
    mockApiClient.get.mockReset();
    mockApiClient.post.mockReset();
    mockApiClient.patch.mockReset();
    mockInvalidate.mockReset();
  });

  it('creates an engagement with the documented POST body', async () => {
    mockApiClient.post.mockResolvedValueOnce({ data: engagementPayload });

    await createEngagementContract(practiceId, {
      intake_id: 'intake-123',
      contract_body: 'Contract text',
      engagement_notes: 'Notes',
      proposal_data: proposalData,
    });

    expect(mockApiClient.post).toHaveBeenCalledWith(
      `/api/engagement-contracts/${practiceId}`,
      {
        intake_id: 'intake-123',
        contract_body: 'Contract text',
        engagement_notes: 'Notes',
        proposal_data: proposalData,
      },
      { signal: undefined },
    );
  });

  it('lists engagements from the documented data envelope', async () => {
    mockApiClient.get.mockResolvedValueOnce({
      data: {
        data: [engagementPayload],
        pagination: { page: 1, limit: 20, total: 1 },
      },
    });

    const result = await listEngagements(practiceId, { page: 1, limit: 20 });

    expect(mockApiClient.get).toHaveBeenCalledWith(
      `/api/engagement-contracts/${practiceId}?page=1&limit=20`,
      { signal: undefined },
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toBe(contractId);
    expect(result.total).toBe(1);
  });

  it('fast-fails list responses that use non-documented aliases', async () => {
    mockApiClient.get.mockResolvedValueOnce({
      data: {
        contracts: [engagementPayload],
        page: 1,
        limit: 20,
        total: 1,
      },
    });

    await expect(listEngagements(practiceId, { page: 1, limit: 20 }))
      .rejects.toThrow('Engagement contract list is missing data');
  });

  it('logs HTTP error response bodies when engagement list fetch fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const responseBody = {
        success: false,
        error: 'Malformed engagement contract response',
        details: {
          issues: [{ id: contractId, missing: ['proposal_data.client_summary'] }],
        },
      };
      mockApiClient.get.mockRejectedValueOnce({
        response: {
          status: 500,
          data: responseBody,
        },
      });

      await expect(listEngagements(practiceId, { page: 1, limit: 20 }))
        .rejects.toThrow('Malformed engagement contract response');

      expect(consoleError).toHaveBeenCalledWith(
        '[engagementsApi] Engagement request failed',
        {
          status: 500,
          data: responseBody,
        },
      );
      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining('[engagementsApi] Engagement request failed details '),
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it('drops and logs list records when proposal data is omitted', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      mockApiClient.get.mockResolvedValueOnce({
        data: {
          data: [{
            ...engagementPayload,
            proposal_data: null,
            client_name: 'Top Level Client',
            title: 'Top level matter summary',
            description: 'Top level description',
            conversation_id: 'top-level-conversation',
            practice_area: 'Family',
          }],
          pagination: { page: 1, limit: 20, total: 1 },
        },
      });

      const result = await listEngagements(practiceId, { page: 1, limit: 20 });

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
      expect(consoleError).toHaveBeenCalledWith(
        '[engagementsApi] Invalid engagement contract payload',
        expect.objectContaining({
          id: contractId,
          error: `Engagement ${contractId} is missing proposal_data`,
          proposalDataKeys: [],
          clientSummaryKeys: [],
          feesKeys: [],
        }),
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it('drops and logs list records that lack client summary fields', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      mockApiClient.get.mockResolvedValueOnce({
        data: {
          data: [{
            ...engagementPayload,
            proposal_data: {
              draft_meta: proposalData.draft_meta,
              source_snapshot: {
                intake_uuid: 'intake-123',
                opposing_party: 'Jane Doe',
              },
            },
          }],
          pagination: { page: 1, limit: 20, total: 1 },
        },
      });

      const result = await listEngagements(practiceId, { page: 1, limit: 20 });

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
      expect(consoleError).toHaveBeenCalledWith(
        '[engagementsApi] Invalid engagement contract payload',
        expect.objectContaining({
          id: contractId,
          error: `Engagement ${contractId} is missing client_summary`,
          proposalDataKeys: expect.arrayContaining(['draft_meta', 'source_snapshot']),
          clientSummaryKeys: [],
          feesKeys: [],
        }),
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it('drops and logs list records that lack fees', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      mockApiClient.get.mockResolvedValueOnce({
        data: {
          data: [{
            ...engagementPayload,
            proposal_data: {
              ...proposalData,
              fees: undefined,
            },
          }],
          pagination: { page: 1, limit: 20, total: 1 },
        },
      });

      const result = await listEngagements(practiceId, { page: 1, limit: 20 });

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
      expect(consoleError).toHaveBeenCalledWith(
        '[engagementsApi] Invalid engagement contract payload',
        expect.objectContaining({
          id: contractId,
          error: `Engagement ${contractId} is missing fees`,
          proposalDataKeys: expect.arrayContaining(['client_summary', 'fees']),
          feesKeys: [],
        }),
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it('keeps valid list records while dropping malformed records', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      mockApiClient.get.mockResolvedValueOnce({
        data: {
          data: [
            {
              ...engagementPayload,
              id: 'malformed-contract',
              proposal_data: {
                draft_meta: proposalData.draft_meta,
                source_snapshot: proposalData.source_snapshot,
              },
            },
            engagementPayload,
          ],
          pagination: { page: 1, limit: 20, total: 2 },
        },
      });

      const result = await listEngagements(practiceId, { page: 1, limit: 20 });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.id).toBe(contractId);
      expect(result.total).toBe(1);
      expect(consoleError).toHaveBeenCalledWith(
        '[engagementsApi] Invalid engagement contract payload',
        expect.objectContaining({
          id: 'malformed-contract',
          error: 'Engagement malformed-contract is missing client_summary',
        }),
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it('fast-fails list responses wrapped in an undocumented success envelope', async () => {
    mockApiClient.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          contracts: [engagementPayload],
          pagination: { page: 1, limit: 20, total: 1 },
        },
      },
    });

    await expect(listEngagements(practiceId, { page: 1, limit: 20 }))
      .rejects.toThrow('Engagement contract list is missing data');
  });

  it('fast-fails engagement details wrapped in an undocumented success envelope', async () => {
    mockApiClient.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: engagementPayload,
      },
    });

    await expect(getEngagement(practiceId, contractId))
      .rejects.toThrow('Engagement is missing id');
  });

  it('updates a draft with the documented PATCH body', async () => {
    mockApiClient.patch.mockResolvedValueOnce({ data: engagementPayload });

    await patchEngagementContract(practiceId, contractId, {
      contract_body: 'Updated contract',
      engagement_notes: 'Updated notes',
      proposal_data: proposalData,
    });

    expect(mockApiClient.patch).toHaveBeenCalledWith(
      `/api/engagement-contracts/${practiceId}/${contractId}`,
      {
        contract_body: 'Updated contract',
        engagement_notes: 'Updated notes',
        proposal_data: proposalData,
      },
      { signal: undefined },
    );
  });

  it('sends via the status endpoint', async () => {
    mockApiClient.patch
      .mockResolvedValueOnce({ data: engagementPayload })
      .mockResolvedValueOnce({ data: { ...engagementPayload, status: 'sent' } });

    await sendEngagementToClient(practiceId, contractId, 'Please review');

    expect(mockApiClient.patch).toHaveBeenNthCalledWith(
      1,
      `/api/engagement-contracts/${practiceId}/${contractId}`,
      { engagement_notes: 'Please review' },
      { signal: undefined },
    );
    expect(mockApiClient.patch).toHaveBeenNthCalledWith(
      2,
      `/api/engagement-contracts/${practiceId}/${contractId}/status`,
      { status: 'sent' },
      { signal: undefined },
    );
  });

  it('accepts via the status endpoint and preserves returned matter_id', async () => {
    mockApiClient.patch.mockResolvedValueOnce({
      data: { ...engagementPayload, status: 'accepted', matter_id: 'matter-123' },
    });

    const accepted = await acceptEngagement(practiceId, contractId);

    expect(mockApiClient.patch).toHaveBeenCalledWith(
      `/api/engagement-contracts/${practiceId}/${contractId}/status`,
      { status: 'accepted' },
      { signal: undefined },
    );
    expect(accepted.matter_id).toBe('matter-123');
  });
});
