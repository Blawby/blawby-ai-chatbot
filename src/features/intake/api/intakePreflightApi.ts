import { z } from 'zod';

import { apiClient, unwrapApiResponse } from '@/shared/lib/apiClient';

const intakePreflightCheckSchema = z.object({
  key: z.enum(['conflict', 'jurisdiction', 'practice-fit', 'capacity', 'documents', 'identity-verification']),
  status: z.enum(['pass', 'review', 'block', 'not_available']),
  summary: z.string(),
  evidence: z.array(z.string()),
});

const intakePreflightSchema = z.object({
  intake_id: z.uuid(),
  overall_status: z.enum(['ready', 'review', 'blocked']),
  generated_at: z.iso.datetime({ offset: true }),
  checks: z.array(intakePreflightCheckSchema).length(6),
});

export type IntakePreflight = z.infer<typeof intakePreflightSchema>;
export type IntakePreflightCheck = z.infer<typeof intakePreflightCheckSchema>;

export const intakePreflightApi = {
  async get(practiceId: string, intakeId: string, signal?: AbortSignal): Promise<IntakePreflight> {
    if (!practiceId || !intakeId) throw new Error('Practice and intake IDs are required.');
    const { data } = await apiClient.get<unknown>(
      `/api/practice-client-intakes/${encodeURIComponent(practiceId)}/${encodeURIComponent(intakeId)}/preflight`,
      { signal },
    );
    const result = intakePreflightSchema.safeParse(unwrapApiResponse<unknown>(data));
    if (!result.success) throw new Error('Intake preflight response was malformed.');
    return result.data;
  },
};
