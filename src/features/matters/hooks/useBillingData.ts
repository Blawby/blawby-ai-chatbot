import { useMemo } from 'preact/hooks';
import {
  getMatterUnbilledData,
  listInvoices
} from '@/features/matters/services/invoicesApi';
import type { MatterDetail } from '@/features/matters/data/matterTypes';
import type { Invoice, UnbilledExpense, UnbilledSummary, UnbilledTimeEntry } from '@/features/matters/types/billing.types';
import { asMajor } from '@/shared/utils/money';
import { useQuery } from '@/shared/hooks/useQuery';
import { queryCache } from '@/shared/lib/queryCache';
import { policyTtl } from '@/shared/lib/cachePolicy';

type UseBillingDataProps = {
  practiceId: string | null;
  matterId: string | null;
  matterBillingType?: MatterDetail['billingType'] | null;
  attorneyHourlyRate?: MatterDetail['attorneyHourlyRate'] | null;
  adminHourlyRate?: MatterDetail['adminHourlyRate'] | null;
  enabled?: boolean;
};

type BillingPayload = {
  invoices: Invoice[];
  unbilledTimeEntries: UnbilledTimeEntry[];
  unbilledExpenses: UnbilledExpense[];
  unbilledSummary: UnbilledSummary | null;
};

export const useBillingData = ({
  practiceId,
  matterId,
  matterBillingType,
  attorneyHourlyRate,
  adminHourlyRate,
  enabled = true
}: UseBillingDataProps) => {
  const cacheKey = `billing:matter:${practiceId ?? ''}:${matterId ?? ''}`;

  const fallbackUnbilledSummary = useMemo<UnbilledSummary>(() => ({
    unbilledTime: { hours: 0, amount: asMajor(0), entries: 0 },
    unbilledExpenses: { count: 0, amount: asMajor(0) },
    totalUnbilled: asMajor(0),
    matterBillingType: matterBillingType ?? 'hourly',
    rates: {
      attorney: attorneyHourlyRate ?? null,
      admin: adminHourlyRate ?? null
    }
  }), [adminHourlyRate, attorneyHourlyRate, matterBillingType]);

  const { data, isLoading, error, refetch } = useQuery<BillingPayload>({
    key: cacheKey,
    enabled: enabled && Boolean(practiceId && matterId),
    ttl: policyTtl(cacheKey),
    fetcher: async (signal) => {
      const [invoicesResult, unbilledResult] = await Promise.allSettled([
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        listInvoices(practiceId!, matterId!, { signal }),
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        getMatterUnbilledData(practiceId!, matterId!, {
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

      let invoices: Invoice[] = [];
      let invoicesError: unknown = null;
      if (invoicesResult.status === 'fulfilled') {
        invoices = invoicesResult.value;
      } else {
        invoicesError = invoicesResult.reason;
      }

      let unbilledTimeEntries: UnbilledTimeEntry[] = [];
      let unbilledExpenses: UnbilledExpense[] = [];
      let unbilledSummary: UnbilledSummary | null = null;
      if (unbilledResult.status === 'fulfilled') {
        unbilledTimeEntries = unbilledResult.value.timeEntries;
        unbilledExpenses = unbilledResult.value.expenses;
        unbilledSummary = unbilledResult.value.summary;
      } else if (!signal?.aborted) {
        console.warn('[useBillingData] Failed to load unbilled billing data', unbilledResult.reason);
        // Preserve the previous summary on partial failure (matches the
        // pre-migration semantic where setUnbilledSummaryRemote((current)
        // => current ?? fallback) kept the prior cached value visible).
        const previous = queryCache.get<BillingPayload>(cacheKey);
        unbilledSummary = previous?.unbilledSummary ?? fallbackUnbilledSummary;
      }

      // If invoices failed and we don't have a partial recovery to surface,
      // throw so the caller's `error` reflects the failure.
      if (invoicesError && !signal?.aborted) {
        throw invoicesError instanceof Error
          ? invoicesError
          : new Error('Failed to load billing data');
      }

      return { invoices, unbilledTimeEntries, unbilledExpenses, unbilledSummary };
    },
  });

  return {
    invoices: data?.invoices ?? [],
    unbilledTimeEntries: data?.unbilledTimeEntries ?? [],
    unbilledExpenses: data?.unbilledExpenses ?? [],
    unbilledSummary: data?.unbilledSummary ?? null,
    isLoading,
    error,
    refetchAll: refetch,
  };
};
