import { z } from 'zod';

import { apiClient, unwrapApiResponse } from '@/shared/lib/apiClient';

const clientCheckinInsightSchema = z.object({
  client_id: z.uuid(),
  signal: z.enum(['calm', 'anxious', 'frustrated', 'silent']),
  last_contact_at: z.iso.datetime({ offset: true }),
  last_contact_source: z.enum(['memo-event', 'memo', 'client-update']),
  recency_days: z.number().int().min(0),
  open_matter_count: z.number().int().min(0),
  highest_urgency: z.enum(['routine', 'time_sensitive', 'emergency']).nullable(),
  reasons: z.array(z.string()),
});

const matterRiskInsightSchema = z.object({
  matter_id: z.uuid(),
  signal: z.enum(['urgent', 'warn', 'healthy', 'quiet']),
  last_activity_at: z.iso.datetime({ offset: true }),
  last_activity_source: z.enum(['activity-log', 'matter-update']),
  recency_days: z.number().int().min(0),
  tags: z.array(z.string()),
  reasons: z.array(z.string()),
});

const clientCheckinsResponseSchema = z.object({
  topic: z.literal('client-checkins'),
  generated_at: z.iso.datetime({ offset: true }),
  data: z.array(clientCheckinInsightSchema),
});

const matterRiskResponseSchema = z.object({
  topic: z.literal('matter-risk'),
  generated_at: z.iso.datetime({ offset: true }),
  data: z.array(matterRiskInsightSchema),
});

const parseResponse = <T>(schema: z.ZodType<T>, payload: unknown, label: string): T => {
  const result = schema.safeParse(payload);
  if (!result.success) throw new Error(`${label} response was malformed.`);
  return result.data;
};

const basePath = (practiceId: string): string => {
  if (!practiceId) throw new Error('Practice ID is required.');
  return `/api/practice/${encodeURIComponent(practiceId)}/insights`;
};

export type ClientCheckinInsight = z.infer<typeof clientCheckinInsightSchema>;
export type MatterRiskInsight = z.infer<typeof matterRiskInsightSchema>;

export const practiceInsightsApi = {
  async getClientCheckins(practiceId: string, signal?: AbortSignal): Promise<ClientCheckinInsight[]> {
    const { data } = await apiClient.get<unknown>(`${basePath(practiceId)}?topic=client-checkins`, { signal });
    return parseResponse(
      clientCheckinsResponseSchema,
      unwrapApiResponse<unknown>(data),
      'Client check-in insights',
    ).data;
  },

  async getMatterRisks(practiceId: string, signal?: AbortSignal): Promise<MatterRiskInsight[]> {
    const { data } = await apiClient.get<unknown>(`${basePath(practiceId)}?topic=matter-risk`, { signal });
    return parseResponse(
      matterRiskResponseSchema,
      unwrapApiResponse<unknown>(data),
      'Matter risk insights',
    ).data;
  },
};
