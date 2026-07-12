import { z } from 'zod';

import { practiceAuditLogExportPath, practiceAuditLogPath, getWorkerApiUrl } from '@/config/urls';
import { apiClient } from '@/shared/lib/apiClient';

const auditLogEntrySchema = z.object({
  id: z.string().uuid(),
  occurred_at: z.string().datetime({ offset: true }),
  actor: z.object({
    id: z.string().uuid().nullable(),
    type: z.enum(['user', 'system', 'webhook', 'cron', 'api', 'organization']),
    name: z.string().nullable(),
    email: z.string().email().nullable(),
  }),
  action_type: z.string().min(1),
  target: z.object({ type: z.string().min(1), id: z.string().min(1) }),
  summary: z.string().min(1),
  source: z.object({
    system: z.enum(['domain_event', 'matter_activity', 'upload_audit']),
    producer: z.string().min(1),
    record_id: z.string().uuid(),
  }),
});

const auditLogResponseSchema = z.object({
  data: z.array(auditLogEntrySchema),
  page_info: z.object({
    has_next_page: z.boolean(),
    has_previous_page: z.boolean(),
    next_cursor: z.string().nullable(),
    previous_cursor: z.null(),
  }),
});

export type AuditLogEntry = z.infer<typeof auditLogEntrySchema>;
export type AuditLogResponse = z.infer<typeof auditLogResponseSchema>;

export interface AuditLogQuery {
  cursor?: string;
  limit?: number;
  search?: string;
  type?: string;
  actor?: string;
  from?: string;
  to?: string;
}

const compactQuery = (query: AuditLogQuery): Record<string, string | number> =>
  Object.fromEntries(
    Object.entries(query).filter((entry): entry is [string, string | number] => entry[1] !== undefined && entry[1] !== ''),
  );

const filenameFromDisposition = (disposition: string | null): string => {
  const match = disposition ? /filename="([^"]+)"/i.exec(disposition) : null;
  return match?.[1] ?? `blawby-audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
};

export const auditLogApi = {
  async list(practiceId: string, query: AuditLogQuery = {}, signal?: AbortSignal): Promise<AuditLogResponse> {
    const result = await apiClient.get<unknown>(practiceAuditLogPath(practiceId), {
      params: compactQuery(query),
      signal,
    });
    const parsed = auditLogResponseSchema.safeParse(result.data);
    if (!parsed.success) throw new Error('Audit log response was malformed.');
    return parsed.data;
  },

  async exportCsv(practiceId: string, query: Omit<AuditLogQuery, 'cursor' | 'limit'> = {}): Promise<{ blob: Blob; filename: string }> {
    const search = new URLSearchParams(compactQuery(query) as Record<string, string>);
    const suffix = search.size > 0 ? `?${search.toString()}` : '';
    const response = await fetch(`${getWorkerApiUrl()}${practiceAuditLogExportPath(practiceId)}${suffix}`, {
      credentials: 'include',
    });
    if (!response.ok) throw new Error(`Audit export failed with status ${response.status}.`);
    return {
      blob: await response.blob(),
      filename: filenameFromDisposition(response.headers.get('Content-Disposition')),
    };
  },
};
