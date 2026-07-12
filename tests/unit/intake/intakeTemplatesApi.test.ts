import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockApiClient } = vi.hoisted(() => ({
  mockApiClient: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

vi.mock('@/shared/lib/apiClient', () => ({ apiClient: mockApiClient }));

import {
  approveIntakeTemplateSuggestion,
  dismissIntakeTemplateSuggestion,
  getIntakeTemplate,
  listIntakeTemplateSuggestions,
  updateIntakeTemplate,
} from '@/features/intake/api/intakeTemplatesApi';

const practiceId = '11111111-1111-4111-8111-111111111111';
const templateId = '22222222-2222-4222-8222-222222222222';
const suggestionId = '33333333-3333-4333-8333-333333333333';

const backendTemplate = {
  id: templateId,
  organization_id: practiceId,
  slug: 'general-intake',
  name: 'General intake',
  description: null,
  status: 'draft' as const,
  revision: 4,
  published_at: null,
  is_default: false,
  intro_message: null,
  legal_disclaimer: null,
  payment_link_enabled: false,
  consultation_fee: null,
  archived_at: null,
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-12T00:00:00.000Z',
  fields: [],
};

const suggestion = {
  id: suggestionId,
  organization_id: practiceId,
  template_id: templateId,
  request_key: '44444444-4444-4444-8444-444444444444',
  base_revision: 4,
  instruction: 'Clarify the court deadline question',
  proposed_edits: [
    { operation: 'rephrase' as const, field_key: 'court_deadline', changes: { label: 'Next court deadline' } },
  ],
  analytics_evidence: {
    status: 'unavailable' as const,
    window: null,
    numerator: null,
    denominator: null,
    provenance: 'practice_client_intakes',
    reason: 'Revision attribution is unavailable.',
  },
  status: 'staged' as const,
  created_by: '55555555-5555-4555-8555-555555555555',
  decided_by: null,
  applied_revision: null,
  created_at: '2026-07-12T00:00:00.000Z',
  decided_at: null,
};

describe('intakeTemplatesApi revision and suggestion contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes the durable template revision', async () => {
    mockApiClient.get.mockResolvedValueOnce({ data: { template: backendTemplate } });
    await expect(getIntakeTemplate(practiceId, templateId)).resolves.toMatchObject({ revision: 4, publishedAt: null });
  });

  it('sends the expected revision on manual updates', async () => {
    mockApiClient.put.mockResolvedValueOnce({ data: { template: { ...backendTemplate, revision: 5 } } });
    await expect(
      updateIntakeTemplate(practiceId, templateId, { name: 'Updated intake', expected_revision: 4 }),
    ).resolves.toMatchObject({ revision: 5 });
    expect(mockApiClient.put).toHaveBeenCalledWith(
      `/api/practice/${practiceId}/intake-templates/${templateId}`,
      { name: 'Updated intake', expected_revision: 4 },
    );
  });

  it('lists staged suggestions from the tenant-scoped template path', async () => {
    mockApiClient.get.mockResolvedValueOnce({ data: { suggestions: [suggestion] } });
    await expect(listIntakeTemplateSuggestions(practiceId, templateId)).resolves.toEqual([suggestion]);
    expect(mockApiClient.get).toHaveBeenCalledWith(
      `/api/practice/${practiceId}/intake-templates/${templateId}/suggestions`,
    );
  });

  it('applies a suggestion with optimistic concurrency and returns the next revision', async () => {
    mockApiClient.post.mockResolvedValueOnce({
      data: { suggestion: { ...suggestion, status: 'approved', applied_revision: 5 }, template: { ...backendTemplate, revision: 5 } },
    });
    await expect(approveIntakeTemplateSuggestion(practiceId, templateId, suggestionId, 4)).resolves.toMatchObject({
      template: { revision: 5 },
      suggestion: { status: 'approved' },
    });
    expect(mockApiClient.post).toHaveBeenCalledWith(
      `/api/practice/${practiceId}/intake-templates/${templateId}/suggestions/${suggestionId}/approve`,
      { expected_revision: 4 },
    );
  });

  it('dismisses a staged suggestion without mutating the template', async () => {
    mockApiClient.post.mockResolvedValueOnce({ data: { suggestion: { ...suggestion, status: 'dismissed' } } });
    await expect(dismissIntakeTemplateSuggestion(practiceId, templateId, suggestionId)).resolves.toMatchObject({
      status: 'dismissed',
    });
    expect(mockApiClient.post).toHaveBeenCalledWith(
      `/api/practice/${practiceId}/intake-templates/${templateId}/suggestions/${suggestionId}/dismiss`,
      {},
    );
  });
});
