import { useQuery } from '@/shared/hooks/useQuery';
import { policyTtl } from '@/shared/lib/cachePolicy';
import { getInvoice, getClientInvoice } from '@/features/invoices/services/invoicesService';
import type { InvoiceDetail } from '@/features/invoices/types';

/**
 * Practice-side single invoice detail. Backed by useQuery for in-flight
 * coalescing + canonical async state. Mutations call `refetch` to pick up
 * server-side state changes after a sync/void/payment update.
 */
export function useInvoiceDetail(practiceId: string | null, invoiceId: string | null) {
  const cacheKey = `invoice:practice:${practiceId ?? ''}:${invoiceId ?? ''}`;
  return useQuery<InvoiceDetail | null>({
    key: cacheKey,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    fetcher: (signal) => getInvoice(practiceId!, invoiceId!, { signal }),
    ttl: policyTtl(cacheKey),
    enabled: Boolean(practiceId && invoiceId),
    // Invoice payment status drives the Pay button — never serve stale.
    swr: false,
  });
}

/**
 * Client-side single invoice detail (limited fields per viewer scope).
 */
export function useClientInvoiceDetail(practiceId: string | null, invoiceId: string | null) {
  const cacheKey = `invoice:client:${practiceId ?? ''}:${invoiceId ?? ''}`;
  return useQuery<InvoiceDetail | null>({
    key: cacheKey,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    fetcher: (signal) => getClientInvoice(practiceId!, invoiceId!, { signal }),
    ttl: policyTtl(cacheKey),
    enabled: Boolean(practiceId && invoiceId),
    // Invoice payment status drives the Pay button — never serve stale.
    swr: false,
  });
}
