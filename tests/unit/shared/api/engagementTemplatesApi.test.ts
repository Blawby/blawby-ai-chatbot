import { afterEach, describe, expect, it, vi } from 'vitest';

import { engagementTemplatesApi } from '@/shared/api/engagementTemplatesApi';

const practiceId = '10000000-0000-4000-8000-000000000001';
const templateId = '10000000-0000-4000-8000-000000000002';
const intakeId = '10000000-0000-4000-8000-000000000003';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('engagementTemplatesApi.generateDraft', () => {
  it('sends only authoritative record identifiers to the backend contract', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      contract_body: 'Final engagement letter.',
      intake_id: intakeId,
      template_id: templateId,
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(engagementTemplatesApi.generateDraft(practiceId, templateId, intakeId)).resolves.toEqual({
      contractBody: 'Final engagement letter.',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/engagement-templates/${practiceId}/${templateId}/draft`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ intake_id: intakeId }),
      }),
    );
  });

  it('fast-fails a response whose record provenance does not match the request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      contract_body: 'Final engagement letter.',
      intake_id: '10000000-0000-4000-8000-000000000099',
      template_id: templateId,
    }), { status: 200 })));

    await expect(engagementTemplatesApi.generateDraft(practiceId, templateId, intakeId))
      .rejects.toThrow('Malformed engagement draft response.');
  });

  it('surfaces backend generation failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      message: 'Engagement AI generation is not configured',
    }), { status: 503 })));

    await expect(engagementTemplatesApi.generateDraft(practiceId, templateId, intakeId))
      .rejects.toThrow('Engagement AI generation is not configured');
  });
});
