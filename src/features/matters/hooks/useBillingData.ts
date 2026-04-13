import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import {
 getMatterUnbilledData,
 listInvoices
} from '@/features/matters/services/invoicesApi';
import type { MatterDetail } from '@/features/matters/data/matterTypes';
import type { Invoice, UnbilledExpense, UnbilledSummary, UnbilledTimeEntry } from '@/features/matters/types/billing.types';
import { asMajor } from '@/shared/utils/money';

type UseBillingDataProps = {
 practiceId: string | null;
 matterId: string | null;
 matterBillingType?: MatterDetail['billingType'] | null;
 attorneyHourlyRate?: MatterDetail['attorneyHourlyRate'] | null;
 adminHourlyRate?: MatterDetail['adminHourlyRate'] | null;
 enabled?: boolean;
};

export const useBillingData = ({
 practiceId,
 matterId,
 matterBillingType,
 attorneyHourlyRate,
 adminHourlyRate,
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
  const fallbackUnbilledSummary: UnbilledSummary = {
   unbilledTime: {
    hours: 0,
    amount: asMajor(0),
    entries: 0
   },
   unbilledExpenses: {
    count: 0,
    amount: asMajor(0)
   },
   totalUnbilled: asMajor(0),
   matterBillingType: matterBillingType ?? 'hourly',
   rates: {
    attorney: attorneyHourlyRate ?? null,
    admin: adminHourlyRate ?? null
   }
  };

  try {
   const [invoicesResult, unbilledResult] = await Promise.allSettled([
    listInvoices(practiceId, matterId, { signal }),
    getMatterUnbilledData(practiceId, matterId, {
     signal,
     summaryDefaults: {
      matterBillingType: matterBillingType ?? 'hourly',
      rates: {
       attorney: attorneyHourlyRate ?? null,
       admin: adminHourlyRate ?? null
      }
     }
    })
   ]);
   let invoicesError: unknown = null;
   if (invoicesResult.status === 'fulfilled') {
    setInvoices(invoicesResult.value);
   } else {
    invoicesError = invoicesResult.reason;
   }

   if (unbilledResult.status === 'fulfilled') {
    setUnbilledTimeEntries(unbilledResult.value.timeEntries);
    setUnbilledExpenses(unbilledResult.value.expenses);
    setUnbilledSummaryRemote(unbilledResult.value.summary);
   } else if (!signal?.aborted) {
    console.warn('[useBillingData] Failed to load unbilled billing data', unbilledResult.reason);
    setUnbilledTimeEntries([]);
    setUnbilledExpenses([]);
    setUnbilledSummaryRemote((current) => current ?? fallbackUnbilledSummary);
   }

   if (invoicesError && !signal?.aborted) {
    throw invoicesError;
   }
  } catch (err) {
   if (signal?.aborted) return;
   setError(err instanceof Error ? err.message : 'Failed to load billing data');
  } finally {
   if (!signal?.aborted) setLoading(false);
  }
 }, [adminHourlyRate, attorneyHourlyRate, enabled, matterBillingType, practiceId, matterId]);

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
