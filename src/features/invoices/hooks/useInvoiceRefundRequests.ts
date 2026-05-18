import { useCallback, useEffect, useState } from 'preact/hooks';
import { listPracticeRefundRequests } from '@/features/invoices/services/invoicesService';
import { asString, asNullableDate } from '@/features/invoices/services/normalizers';
import type { InvoiceRefundRequestEvent } from '@/features/invoices/types';

const asNumberOrNull = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const normalizeRefundRequest = (raw: Record<string, unknown>): InvoiceRefundRequestEvent => ({
  id: asString(raw.id) ?? crypto.randomUUID(),
  invoiceId: asString(raw.invoice_id ?? raw.invoiceId),
  amount: asNumberOrNull(raw.amount),
  status: asString(raw.status) ?? 'pending',
  reason: asString(raw.reason),
  createdAt: asNullableDate(raw.created_at ?? raw.createdAt),
  updatedAt: asNullableDate(raw.updated_at ?? raw.updatedAt),
});

export interface UseInvoiceRefundRequestsResult {
  refundRequests: InvoiceRefundRequestEvent[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export const useInvoiceRefundRequests = (
  practiceId: string | null,
  invoiceId: string | null
): UseInvoiceRefundRequestsResult => {
  const [refundRequests, setRefundRequests] = useState<InvoiceRefundRequestEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(
    async (signal?: AbortSignal) => {
      if (!practiceId) {
        setRefundRequests([]);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const all = await listPracticeRefundRequests(practiceId, { signal });
        const filtered = invoiceId
          ? all.filter((request) => {
              const requestInvoiceId = asString(request.invoice_id ?? request.invoiceId);
              return requestInvoiceId === invoiceId;
            })
          : all;
        setRefundRequests(filtered.map(normalizeRefundRequest));
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Failed to load refund requests');
      } finally {
        setLoading(false);
      }
    },
    [practiceId, invoiceId]
  );

  useEffect(() => {
    const controller = new AbortController();
    void fetchAll(controller.signal);
    return () => controller.abort();
  }, [fetchAll]);

  const refetch = useCallback(async () => {
    await fetchAll();
  }, [fetchAll]);

  return { refundRequests, loading, error, refetch };
};
