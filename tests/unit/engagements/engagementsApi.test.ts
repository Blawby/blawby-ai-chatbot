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
}));

vi.mock('@/shared/lib/queryCache', () => ({
  queryCache: {
    invalidate: mockInvalidate,
  },
}));

import {
  acceptEngagement,
  createEngagementContract,
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
  },
  representation: {
    scope_summary: 'Limited scope representation.',
  },
  fees: {
    billing_type: 'fixed',
    fixed_fee_amount: 1500,
  },
  risk_review: {
    conflict_status: 'unknown',
    jurisdiction_status: 'unknown',
  },
  source_snapshot: {
    intake_uuid: 'intake-123',
    conversation_id: 'conversation-123',
    matter_id: null,
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
