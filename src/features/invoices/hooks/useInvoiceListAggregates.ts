import { useMemo } from 'preact/hooks';
import { listAllPracticeInvoiceSummaries } from '@/features/invoices/services/invoicesService';
import { useQuery } from '@/shared/hooks/useQuery';
import { policyTtl } from '@/shared/lib/cachePolicy';
import type { InvoiceSummary } from '@/features/invoices/types';

export interface InvoiceListAggregates {
  outstanding: { amount: number; count: number };
  pastDue: { amount: number; count: number };
  paid30d: { amount: number; count: number };
  drafts: { count: number };
  tabCounts: {
    all: number;
    draft: number;
    open: number;
    pastDue: number;
    paid: number;
  };
  loading: boolean;
  error: string | null;
}

const OPEN_STATUSES = new Set(['sent', 'open', 'pending']);
const PAST_DUE_STATUSES = new Set(['overdue']);
const PAID_STATUSES = new Set(['paid']);
const UNPAID_STATUSES = new Set(['sent', 'open', 'pending', 'overdue']);

const aggregate = (items: InvoiceSummary[]): Omit<InvoiceListAggregates, 'loading' | 'error'> => {
  let outstandingAmount = 0;
  let outstandingCount = 0;
  let pastDueAmount = 0;
  let pastDueCount = 0;
  let paid30dAmount = 0;
  let paid30dCount = 0;
  let draftCount = 0;
  let openCount = 0;
  let paidCount = 0;

  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

  for (const invoice of items) {
    const status = invoice.status.toLowerCase();
    if (UNPAID_STATUSES.has(status)) {
      outstandingAmount += invoice.amountDue;
      outstandingCount += 1;
    }
    if (PAST_DUE_STATUSES.has(status)) {
      pastDueAmount += invoice.amountDue;
      pastDueCount += 1;
    }
    if (PAID_STATUSES.has(status)) {
      paidCount += 1;
      const paidAt = invoice.paidAt ? Date.parse(invoice.paidAt) : NaN;
      if (Number.isFinite(paidAt) && paidAt >= thirtyDaysAgo) {
        paid30dAmount += invoice.amountPaid;
        paid30dCount += 1;
      }
    }
    if (status === 'draft') draftCount += 1;
    if (OPEN_STATUSES.has(status)) openCount += 1;
  }

  return {
    outstanding: { amount: outstandingAmount, count: outstandingCount },
    pastDue: { amount: pastDueAmount, count: pastDueCount },
    paid30d: { amount: paid30dAmount, count: paid30dCount },
    drafts: { count: draftCount },
    tabCounts: {
      all: items.length,
      draft: draftCount,
      open: openCount,
      pastDue: pastDueCount,
      paid: paidCount,
    },
  };
};

const EMPTY_AGGREGATES: Omit<InvoiceListAggregates, 'loading' | 'error'> = {
  outstanding: { amount: 0, count: 0 },
  pastDue: { amount: 0, count: 0 },
  paid30d: { amount: 0, count: 0 },
  drafts: { count: 0 },
  tabCounts: { all: 0, draft: 0, open: 0, pastDue: 0, paid: 0 },
};

/**
 * Compute KPI/tab counts from the practice's invoice list.
 *
 * Reads the cached `invoice:practice:summaries:${practiceId}` entry that
 * `listInvoices` populates, so the aggregate hook and the paginated list
 * page share one backend fetch instead of issuing two parallel requests
 * for the same data on every list-page mount.
 */
export const useInvoiceListAggregates = (practiceId: string | null): InvoiceListAggregates => {
  const cacheKey = practiceId
    ? `invoice:practice:summaries:${practiceId}`
    : 'invoice:practice:summaries:none';

  const { data, error, isLoading } = useQuery<InvoiceSummary[]>({
    key: cacheKey,
    fetcher: (signal) => listAllPracticeInvoiceSummaries(practiceId ?? '', { signal }),
    ttl: policyTtl(cacheKey),
    enabled: Boolean(practiceId),
  });

  const aggregates = useMemo(
    () => (data ? aggregate(data) : EMPTY_AGGREGATES),
    [data]
  );

  return {
    ...aggregates,
    loading: isLoading,
    error: error ?? null,
  };
};
