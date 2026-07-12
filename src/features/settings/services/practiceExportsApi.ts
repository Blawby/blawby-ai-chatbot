import { z } from 'zod';

import { practiceExportPath, practiceExportsPath } from '@/config/urls';
import { apiClient } from '@/shared/lib/apiClient';

export const practiceExportTypeSchema = z.enum([
  'full_practice_archive',
  'matters_contacts',
  'billing_invoices',
  'trust_ledger',
  'audit_events',
]);

const practiceExportJobSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  requested_by: z.string().uuid(),
  idempotency_key: z.string().uuid(),
  type: practiceExportTypeSchema,
  status: z.enum(['queued', 'running', 'completed', 'failed']),
  content_type: z.string().nullable(),
  byte_size: z.number().int().nonnegative().nullable(),
  manifest: z.record(z.string(), z.unknown()).nullable(),
  error: z.object({ code: z.string(), message: z.string() }).nullable(),
  created_at: z.string().datetime(),
  started_at: z.string().datetime().nullable(),
  completed_at: z.string().datetime().nullable(),
  failed_at: z.string().datetime().nullable(),
  download: z.object({ url: z.string().url(), expires_at: z.string().datetime() }).nullable(),
});

export type PracticeExportType = z.infer<typeof practiceExportTypeSchema>;
export type PracticeExportJob = z.infer<typeof practiceExportJobSchema>;

const parseJob = (payload: unknown): PracticeExportJob => {
  const parsed = z.object({ export: practiceExportJobSchema }).safeParse(payload);
  if (!parsed.success) throw new Error('Practice export response was malformed.');
  return parsed.data.export;
};

export const practiceExportsApi = {
  async request(practiceId: string, type: PracticeExportType, idempotencyKey: string): Promise<PracticeExportJob> {
    const result = await apiClient.post<unknown>(practiceExportsPath(practiceId), {
      type,
      idempotency_key: idempotencyKey,
    });
    return parseJob(result.data);
  },

  async get(practiceId: string, exportId: string, signal?: AbortSignal): Promise<PracticeExportJob> {
    const result = await apiClient.get<unknown>(practiceExportPath(practiceId, exportId), { signal });
    return parseJob(result.data);
  },
};
