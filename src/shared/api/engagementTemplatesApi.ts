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
  `/api/practices/${encodeURIComponent(practiceId)}/engagement-templates`;

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
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
    return undefined as T;
  }
  const text = await res.text();
  if (!text.trim()) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}

export const engagementTemplatesApi = {
  list(practiceId: string): Promise<EngagementTemplateRecord[]> {
    return apiFetch(base(practiceId));
  },

  create(practiceId: string, payload: CreateTemplatePayload): Promise<EngagementTemplateRecord> {
    const { id: _id, ...body } = payload as CreateTemplatePayload & { id?: string };
    return apiFetch(base(practiceId), {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  update(practiceId: string, templateId: string, payload: UpdateTemplatePayload): Promise<EngagementTemplateRecord> {
    return apiFetch(`${base(practiceId)}/${encodeURIComponent(templateId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  delete(practiceId: string, templateId: string): Promise<void> {
    return apiFetch(`${base(practiceId)}/${encodeURIComponent(templateId)}`, {
      method: 'DELETE',
    });
  },

  // Worker route — generates a new template from a natural-language prompt.
  draftFromPrompt(practiceId: string, payload: DraftTemplatePayload): Promise<{ template: Partial<EngagementLetterTemplate> }> {
    return apiFetch('/api/ai/draft-engagement-template', {
      method: 'POST',
      body: JSON.stringify({ ...payload, practiceId }),
    });
  },
};
