import { z } from 'zod';

import { apiClient, unwrapApiResponse } from '@/shared/lib/apiClient';

const reconciliationSchema = z.object({
  id: z.uuid(),
  organization_id: z.uuid(),
  idempotency_key: z.uuid(),
  statement_ending_at: z.iso.datetime({ offset: true }),
  bank_statement_balance: z.number().int(),
  trust_book_balance: z.number().int(),
  client_ledger_balance: z.number().int(),
  bank_to_book_variance: z.number().int(),
  book_to_client_variance: z.number().int(),
  status: z.enum(['balanced', 'variance']),
  source: z.enum(['manual_statement', 'bank_integration']),
  notes: z.string().nullable(),
  created_by: z.uuid(),
  created_at: z.iso.datetime({ offset: true }),
});

const retainerTargetSchema = z.object({
  client_id: z.uuid(),
  matter_id: z.uuid(),
  current_balance: z.number().int(),
  target_balance: z.number().int().min(0),
  funded_percent: z.number().int().min(0),
  status: z.enum(['funded', 'low']),
});

const trustReadinessSchema = z.object({
  ledger: z.object({
    client_ledger_balance: z.number().int(),
    as_of_at: z.iso.datetime({ offset: true }).nullable(),
  }),
  latest_reconciliation: reconciliationSchema.nullable(),
  retainer_targets: z.array(retainerTargetSchema),
  boundaries: z.object({
    bank_source: z.enum(['not_configured', 'manual_statement', 'bank_integration']),
    operating_account_status: z.literal('not_connected'),
    invoice_receivables_included: z.literal(false),
    operating_revenue_included: z.literal(false),
  }),
});

const parseResponse = <T>(schema: z.ZodType<T>, payload: unknown, label: string): T => {
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new Error(`${label} response was malformed.`);
  }
  return result.data;
};

const basePath = (practiceId: string): string => {
  if (!practiceId) {
    throw new Error('Practice ID is required.');
  }
  return `/api/trust/${encodeURIComponent(practiceId)}`;
};

export type TrustReconciliation = z.infer<typeof reconciliationSchema>;
export type TrustRetainerTarget = z.infer<typeof retainerTargetSchema>;
export type TrustReadiness = z.infer<typeof trustReadinessSchema>;

export interface CreateTrustReconciliationInput {
  idempotency_key: string;
  statement_ending_at: string;
  bank_statement_balance: number;
  trust_book_balance: number;
  notes?: string;
}

export const trustReadinessApi = {
  async getReadiness(practiceId: string, signal?: AbortSignal): Promise<TrustReadiness> {
    const { data } = await apiClient.get<unknown>(`${basePath(practiceId)}/readiness`, { signal });
    return parseResponse(trustReadinessSchema, unwrapApiResponse<unknown>(data), 'Trust readiness');
  },

  async reconcile(
    practiceId: string,
    input: CreateTrustReconciliationInput,
  ): Promise<TrustReconciliation> {
    const { data } = await apiClient.post<unknown>(`${basePath(practiceId)}/reconciliations`, input);
    return parseResponse(reconciliationSchema, unwrapApiResponse<unknown>(data), 'Trust reconciliation');
  },

  async listReconciliations(
    practiceId: string,
    limit = 25,
    signal?: AbortSignal,
  ): Promise<TrustReconciliation[]> {
    const query = new URLSearchParams({ limit: String(limit) });
    const { data } = await apiClient.get<unknown>(
      `${basePath(practiceId)}/reconciliations?${query.toString()}`,
      { signal },
    );
    return parseResponse(z.array(reconciliationSchema), unwrapApiResponse<unknown>(data), 'Trust reconciliation history');
  },
};
