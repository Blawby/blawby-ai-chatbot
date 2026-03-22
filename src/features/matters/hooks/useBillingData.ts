import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import {
  getMatterUnbilledData,
  listInvoices
} from '@/features/matters/services/invoicesApi';
import type { MatterDetail } from '@/features/matters/data/matterTypes';
import type { Invoice, UnbilledExpense, UnbilledSummary, UnbilledTimeEntry } from '@/features/matters/types/billing.types';

type UseBillingDataProps = {
  practiceId: string | null;
  matterId: string | null;
  matter?: MatterDetail | null;
  enabled?: boolean;
};

export const useBillingData = ({
  practiceId,
  matterId,
  matter,
  enabled = true
}: UseBillingDataProps) => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [unbilledTimeEntries, setUnbilledTimeEntries] = useState<UnbilledTimeEntry[]>([]);
  const [unbilledExpenses, setUnbilledExpenses] = useState<UnbilledExpense[]>([]);
  const [unbilledSummaryRemote, setUnbilledSummaryRemote] = useState<UnbilledSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async (signal?: AbortSignal) => {
    if (!enabled || !practiceId || !matterId) {
      setInvoices([]);
      setUnbilledTimeEntries([]);
      setUnbilledExpenses([]);
      setUnbilledSummaryRemote(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const [invoicesData, unbilledData] = await Promise.all([
        listInvoices(practiceId, matterId, { signal }),
        getMatterUnbilledData(practiceId, matterId, {
          signal,
          summaryDefaults: {
            matterBillingType: matter?.billingType ?? 'hourly',
            rates: {
              attorney: matter?.attorneyHourlyRate ?? null,
              admin: matter?.adminHourlyRate ?? null
            }
          }
        })
      ]);
      setInvoices(invoicesData);
      setUnbilledTimeEntries(unbilledData.timeEntries);
      setUnbilledExpenses(unbilledData.expenses);
      setUnbilledSummaryRemote(unbilledData.summary);
    } catch (err) {
      if (signal?.aborted) return;
      setError(err instanceof Error ? err.message : 'Failed to load billing data');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [enabled, matter?.adminHourlyRate, matter?.attorneyHourlyRate, matter?.billingType, practiceId, matterId]);

  const abortControllerRef = useRef<AbortController | null>(null);
  
  const refetchAll = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    await fetchAll(controller.signal);
  }, [fetchAll]);

  useEffect(() => {
    void refetchAll();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [refetchAll]);

  return {
    invoices,
    unbilledTimeEntries,
    unbilledExpenses,
    unbilledSummary: unbilledSummaryRemote,
    loading,
    error,
    refetchAll
  };
};
