import type { EngagementFeeType, EngagementLetterTemplate } from '@/features/settings/pages/EngagementTemplatesPage';

// Shape returned by the backend (snake_case → camelCase).
// Matches the engagement_templates table defined in blawby-backend issue #313.
export interface EngagementTemplateRecord extends EngagementLetterTemplate {
  practiceId: string;
  publishedAt: string | null;
  version: number;
  lastReviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CreateTemplatePayload = Omit<
  EngagementLetterTemplate,
  'id'
>;

export type UpdateTemplatePayload = Partial<Omit<
  EngagementLetterTemplate,
  'id'
>>;

export type DraftTemplatePayload = {
  prompt: string;
  practiceArea?: string;
  feeType?: EngagementFeeType;
};

const base = (practiceId: string) =>
  `/api/engagement-templates/${encodeURIComponent(practiceId)}`;

const parseEngagementDraft = (
  value: unknown,
  expected: { intakeId: string; templateId: string },
): { contractBody: string } => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Malformed engagement draft response.');
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.contract_body !== 'string'
    || !record.contract_body.trim()
    || record.intake_id !== expected.intakeId
    || record.template_id !== expected.templateId
  ) {
    throw new Error('Malformed engagement draft response.');
  }
  return { contractBody: record.contract_body };
};

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T | undefined> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    credentials: 'include',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let message = `Request failed: ${res.status}`;
    try {
      const json = JSON.parse(text);
      message = json.message ?? json.error ?? message;
    } catch { message = text || message; }
    throw new Error(message);
  }
  if (res.status === 204) {
    return undefined;
  }
  const text = await res.text();
  if (!text.trim()) {
    return undefined;
  }
  return JSON.parse(text) as T;
}

export const engagementTemplatesApi = {
  async list(practiceId: string): Promise<EngagementTemplateRecord[]> {
    const response = await apiFetch<EngagementTemplateRecord[]>(base(practiceId));
    if (!response) {
      throw new Error('Empty response while loading engagement templates.');
    }
    return response;
  },

  async create(practiceId: string, payload: CreateTemplatePayload): Promise<EngagementTemplateRecord> {
    const { id: _id, ...body } = payload as CreateTemplatePayload & { id?: string };
    const response = await apiFetch<EngagementTemplateRecord>(base(practiceId), {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (!response) {
      throw new Error('Empty response while creating engagement template.');
    }
    return response;
  },

  async update(practiceId: string, templateId: string, payload: UpdateTemplatePayload): Promise<EngagementTemplateRecord> {
    const response = await apiFetch<EngagementTemplateRecord>(`${base(practiceId)}/${encodeURIComponent(templateId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    if (!response) {
      throw new Error('Empty response while updating engagement template.');
    }
    return response;
  },

  delete(practiceId: string, templateId: string): Promise<void> {
    return apiFetch(`${base(practiceId)}/${encodeURIComponent(templateId)}`, {
      method: 'DELETE',
    });
  },

  async generateDraft(practiceId: string, templateId: string, intakeId: string): Promise<{ contractBody: string }> {
    const response = await apiFetch<unknown>(
      `${base(practiceId)}/${encodeURIComponent(templateId)}/draft`,
      {
        method: 'POST',
        body: JSON.stringify({ intake_id: intakeId }),
      },
    );
    return parseEngagementDraft(response, { intakeId, templateId });
  },

  // Worker route — generates a new template from a natural-language prompt.
  async draftFromPrompt(practiceId: string, payload: DraftTemplatePayload): Promise<{ template: Partial<EngagementLetterTemplate> }> {
    const response = await apiFetch<{ template: Partial<EngagementLetterTemplate> }>('/api/ai/draft-engagement-template', {
      method: 'POST',
      body: JSON.stringify({ ...payload, practiceId }),
    });
    if (!response) {
      throw new Error('Empty response while drafting engagement template.');
    }
    return response;
  },
};
