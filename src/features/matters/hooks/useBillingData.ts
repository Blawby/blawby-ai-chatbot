import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import {
  getUnbilledExpenses,
  getUnbilledSummary,
  getUnbilledTimeEntries,
  listInvoices
} from '@/features/matters/services/invoicesApi';
import { asMajor } from '@/shared/utils/money';
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

  const computeFallbackSummary = useCallback((timeData: UnbilledTimeEntry[], expenseData: UnbilledExpense[]): UnbilledSummary => {
    const hours = timeData.reduce((sum, entry) => sum + (entry.duration_hours ?? 0), 0);
    const timeAmount = timeData.reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0);
    const expenseAmount = expenseData.reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0);
    const timeAmountMajor = asMajor(timeAmount);
    const expenseAmountMajor = asMajor(expenseAmount);
    const totalMajor = asMajor(timeAmount + expenseAmount);

    return {
      unbilledTime: {
        hours,
        amount: timeAmountMajor,
        entries: timeData.length
      },
      unbilledExpenses: {
        count: expenseData.length,
        amount: expenseAmountMajor
      },
      totalUnbilled: totalMajor,
      matterBillingType: matter?.billingType ?? 'hourly',
      rates: {
        attorney: matter?.attorneyHourlyRate ?? null,
        admin: matter?.adminHourlyRate ?? null
      }
    };
  }, [matter]);

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
      const [invoicesData, timeData, expenseData] = await Promise.all([
        listInvoices(practiceId, matterId, { signal }),
        getUnbilledTimeEntries(practiceId, matterId, { signal }),
        getUnbilledExpenses(practiceId, matterId, { signal })
      ]);
      setInvoices(invoicesData);
      setUnbilledTimeEntries(timeData);
      setUnbilledExpenses(expenseData);

      try {
        const summaryData = await getUnbilledSummary(practiceId, matterId, { signal });
        setUnbilledSummaryRemote(summaryData);
      } catch (summaryError) {
        if (!signal?.aborted) {
          console.warn('[useBillingData] Unbilled summary unavailable, using fallback', summaryError);
          setUnbilledSummaryRemote(computeFallbackSummary(timeData, expenseData));
        }
      }
    } catch (err) {
      if (signal?.aborted) return;
      setError(err instanceof Error ? err.message : 'Failed to load billing data');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [enabled, practiceId, matterId, computeFallbackSummary]);

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
