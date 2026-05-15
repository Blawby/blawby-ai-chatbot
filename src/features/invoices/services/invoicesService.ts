import { apiClient } from '@/shared/lib/apiClient';
import { urls } from '@/config/urls';
import { queryCache } from '@/shared/lib/queryCache';
import { policyTtl } from '@/shared/lib/cachePolicy';
import {
  createInvoice as createMatterInvoice,
  listInvoices as listMatterInvoices,
  sendInvoice as sendMatterInvoice,
  syncInvoice as syncMatterInvoice,
  voidInvoice as voidMatterInvoice,
  deleteInvoice as deleteMatterInvoice,
  updateInvoice as updateMatterInvoice,
  normalizeInvoice,
  extractInvoicesArray,
  type BackendInvoice,
} from '@/features/matters/services/invoicesApi';
import type { CreateInvoicePayload } from '@/features/matters/types/billing.types';
import {
  createRefundRequest as createRefundRequestApi,
  listClientInvoices as listClientInvoiceRecords,
  listClientRefundRequests,
  type RefundRequestPayload,
} from '@/features/invoices/services/invoicesClient';
import {
  asString,
  extractInvoiceRecord,
  normalizeInvoiceDetail,
  normalizeInvoiceSummary,
} from '@/features/invoices/services/normalizers';
import { applyInvoiceFilterRule } from '@/features/invoices/config/invoiceCollection';
import type {
  InvoiceDetail,
  InvoiceFilterRule,
  InvoiceListFilters,
  InvoiceListResult,
  InvoiceSummary,
} from '@/features/invoices/types';

type FetchOptions = { signal?: AbortSignal; statusFilter?: string[] };

const FALLBACK_PAGE_SIZE = 10;

type ApiErrorWithStatus = {
  status?: number;
  statusCode?: number;
  response?: {
    status?: number;
  };
};

const getErrorStatus = (error: unknown): number | undefined => {
  if (!error || typeof error !== 'object') return undefined;
  const candidate = error as ApiErrorWithStatus;
  return candidate.status ?? candidate.response?.status ?? candidate.statusCode;
};

const filterInvoiceSummaries = (
  items: InvoiceSummary[],
  filters: InvoiceListFilters,
  statusFilter: string[] = [],
  audience: 'client' | 'practice' = 'practice'
): InvoiceSummary[] => {
  const rules = (filters.rules ?? []).filter((rule): rule is InvoiceFilterRule => Boolean(rule?.field && rule.operator));
  const normalizedStatusFilter = statusFilter.map((value) => value.trim().toLowerCase()).filter(Boolean);
  const allowedStatuses = normalizedStatusFilter.length > 0 ? new Set(normalizedStatusFilter) : null;

  return items.filter((item) => {
    if (allowedStatuses && !allowedStatuses.has(item.status.toLowerCase())) return false;
    return rules.every((rule) => applyInvoiceFilterRule(item, rule, audience));
  });
};

const paginate = (items: InvoiceSummary[], page: number, pageSize: number): InvoiceListResult => {
  const normalizedPageSize = pageSize > 0 ? pageSize : FALLBACK_PAGE_SIZE;
  const normalizedPage = page > 0 ? page : 1;
  const start = (normalizedPage - 1) * normalizedPageSize;
  const end = start + normalizedPageSize;

  return {
    items: items.slice(start, end),
    total: items.length,
    page: normalizedPage,
    pageSize: normalizedPageSize,
  };
};


/**
 * Cache key for the full normalized practice-invoice list. The list endpoint
 * does not paginate server-side in this app — the backend returns every
 * invoice for the practice, and we filter/paginate client-side. Coalescing
 * the underlying fetch means useInvoiceListAggregates and usePaginatedList
 * share one /api/invoices/:practiceId request instead of issuing two.
 */
const practiceInvoiceSummariesCacheKey = (practiceId: string) =>
  `invoice:practice:summaries:${practiceId}`;

const fetchPracticeInvoiceSummaries = async (
  practiceId: string,
  options: FetchOptions = {}
): Promise<InvoiceSummary[]> => {
  const cacheKey = practiceInvoiceSummariesCacheKey(practiceId);
  return queryCache.coalesceGet<InvoiceSummary[]>(
    cacheKey,
    async (signal) => {
      const merged: FetchOptions = {
        ...options,
        signal: signal ?? options.signal,
      };
      const invoices = await listMatterInvoices(practiceId, undefined, merged);
      return invoices
        .map(normalizeInvoiceSummary)
        .sort((a, b) => {
          const timea = new Date(a.updatedAt).getTime();
          const timeb = new Date(b.updatedAt).getTime();
          return (Number.isNaN(timeb) ? 0 : timeb) - (Number.isNaN(timea) ? 0 : timea);
        });
    },
    { ttl: policyTtl(cacheKey), swr: true, signal: options.signal }
  );
};

export const listInvoices = async (
  practiceId: string,
  filters: InvoiceListFilters,
  options: FetchOptions = {}
): Promise<InvoiceListResult> => {
  const summaries = await fetchPracticeInvoiceSummaries(practiceId, options);
  return paginate(
    filterInvoiceSummaries(summaries, filters, options.statusFilter, 'practice'),
    filters.page ?? 1,
    filters.pageSize ?? FALLBACK_PAGE_SIZE
  );
};

/**
 * Returns the full normalized invoice list for a practice. The result is
 * served from the same cache that backs listInvoices, so aggregate computation
 * and paginated rendering share a single backend fetch per practice per TTL
 * window.
 */
export const listAllPracticeInvoiceSummaries = async (
  practiceId: string,
  options: FetchOptions = {}
): Promise<InvoiceSummary[]> => {
  return fetchPracticeInvoiceSummaries(practiceId, options);
};

export const getInvoice = async (
  practiceId: string,
  invoiceId: string,
  options: FetchOptions = {}
): Promise<InvoiceDetail | null> => {
  if (!practiceId || !invoiceId) {
    return null;
  }
  try {
    const response = await apiClient.get(urls.invoice(practiceId, invoiceId), {
      signal: options.signal,
    });
    const data = response.data;
    // The detail endpoint returns a single invoice object (not wrapped in an array)
    const rawInvoice = extractInvoiceRecord(data);
    if (!rawInvoice) {
      throw new Error('Invalid invoice detail response: expected an invoice payload.');
    }
    const invoice = normalizeInvoice(rawInvoice as BackendInvoice);
    return normalizeInvoiceDetail(invoice, rawInvoice);
  } catch (error: unknown) {
    // Only return null for 404, propagate AbortError, rethrow others
    const errorRecord = error && typeof error === 'object' ? error as Record<string, unknown> : null;
    const responseRecord = errorRecord?.response && typeof errorRecord.response === 'object'
      ? errorRecord.response as Record<string, unknown>
      : null;
    const status = (responseRecord?.status ?? errorRecord?.status ?? errorRecord?.statusCode) as number | undefined;
    if (status === 404) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[getInvoice] 404 Not Found', { practiceId, invoiceId, error });
      }
      return null;
    }
    if (errorRecord?.name === 'AbortError') throw error;
    throw error;
  }
};

export const listClientInvoices = async (
  practiceId: string,
  filters: InvoiceListFilters,
  options: FetchOptions = {}
): Promise<InvoiceListResult> => {
  const invoices = await listClientInvoiceRecords(practiceId, options);
  const summaries = invoices
    .map(normalizeInvoiceSummary)
    .sort((a, b) => {
      const timea = new Date(a.updatedAt).getTime();
      const timeb = new Date(b.updatedAt).getTime();
      return (Number.isNaN(timeb) ? 0 : timeb) - (Number.isNaN(timea) ? 0 : timea);
    });
  return paginate(
    filterInvoiceSummaries(summaries, filters, options.statusFilter, 'client'),
    filters.page ?? 1,
    filters.pageSize ?? FALLBACK_PAGE_SIZE
  );
};

export const getClientInvoice = async (
  practiceId: string,
  invoiceId: string,
  options: FetchOptions = {}
): Promise<InvoiceDetail | null> => {
  if (!practiceId || !invoiceId) return null;
  try {
    const response = await apiClient.get(urls.clientInvoice(practiceId, invoiceId), {
      signal: options.signal,
    });
    const data = response.data;
    const invoiceRecord = extractInvoicesArray(data)[0];
    if (!invoiceRecord) {
      throw new Error('Invalid client invoice detail response: expected an invoice payload.');
    }

    const invoice = normalizeInvoice(invoiceRecord);
    const rawInvoice = extractInvoiceRecord(data);
    if (!rawInvoice) {
      throw new Error('Invalid client invoice detail response: expected an invoice payload.');
    }

    let refundRequestSupported = true;
    let refundRequestError: string | null = null;
    let refundRequests: Array<Record<string, unknown>> = [];
    try {
      const allRefundRequests = await listClientRefundRequests(practiceId, options);
      refundRequests = allRefundRequests.filter((request) => {
        const requestInvoiceId = asString(request.invoice_id ?? request.invoiceId);
        return requestInvoiceId === invoiceId;
      });
    } catch (error) {
      const status = getErrorStatus(error);

      if (status === 405 || status === 501) {
        refundRequestSupported = false;
      } else if (status === 404) {
        refundRequestError = 'Refund request endpoint route mismatch (404).';
      } else {
        throw error;
      }
    }

    return normalizeInvoiceDetail(invoice, rawInvoice, { refundRequests, refundRequestSupported, refundRequestError });
  } catch (error) {
    const status = getErrorStatus(error);
    if (status === 404) return null;
    throw error;
  }
};

export const createInvoice = async (
  practiceId: string,
  payload: CreateInvoicePayload,
  options: FetchOptions = {}
) => {
  return createMatterInvoice(practiceId, payload, options);
};

export const sendInvoice = async (practiceId: string, invoiceId: string, options: FetchOptions = {}) => {
  return sendMatterInvoice(practiceId, invoiceId, options);
};

export const syncInvoice = async (practiceId: string, invoiceId: string, options: FetchOptions = {}) => {
  return syncMatterInvoice(practiceId, invoiceId, options);
};

export const voidInvoice = async (practiceId: string, invoiceId: string, options: FetchOptions = {}) => {
  return voidMatterInvoice(practiceId, invoiceId, options);
};

export const deleteInvoice = async (practiceId: string, invoiceId: string, options: FetchOptions = {}) => {
  return deleteMatterInvoice(practiceId, invoiceId, options);
};

export const updateInvoice = async (
  practiceId: string,
  invoiceId: string,
  payload: Partial<CreateInvoicePayload>,
  options: FetchOptions = {}
) => {
  return updateMatterInvoice(practiceId, invoiceId, payload, options);
};

export const createRefundRequest = async (
  practiceId: string,
  invoiceId: string,
  payload: RefundRequestPayload,
  options: FetchOptions = {}
): Promise<void> => {
  await createRefundRequestApi(practiceId, invoiceId, payload, options);
};

const extractRefundRequestsArray = (payload: unknown): Array<Record<string, unknown>> => {
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  for (const key of ['refund_requests', 'refundRequests', 'requests', 'items']) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'));
    }
  }
  if (Array.isArray(payload)) {
    return (payload as unknown[]).filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'));
  }
  if ('data' in record) return extractRefundRequestsArray(record.data);
  return [];
};

export const createPracticeRefundRequest = async (
  practiceId: string,
  invoiceId: string,
  payload: RefundRequestPayload,
  options: FetchOptions = {}
): Promise<Record<string, unknown>> => {
  const response = await apiClient.post(
    urls.invoiceRefundRequests(practiceId, invoiceId),
    payload,
    { signal: options.signal }
  );
  return (response.data ?? {}) as Record<string, unknown>;
};

export const listPracticeRefundRequests = async (
  practiceId: string,
  options: FetchOptions = {}
): Promise<Array<Record<string, unknown>>> => {
  if (!practiceId) return [];
  const response = await apiClient.get(urls.practiceRefundRequests(practiceId), { signal: options.signal });
  return extractRefundRequestsArray(response.data);
};

export type RefundRequestDecision = {
  decision: 'approve' | 'decline';
  note?: string;
};

export const reviewPracticeRefundRequest = async (
  practiceId: string,
  refundRequestId: string,
  decision: RefundRequestDecision,
  options: FetchOptions = {}
): Promise<Record<string, unknown>> => {
  const response = await apiClient.patch(
    urls.practiceRefundRequest(practiceId, refundRequestId),
    decision,
    { signal: options.signal }
  );
  return (response.data ?? {}) as Record<string, unknown>;
};

export const executePracticeRefund = async (
  practiceId: string,
  refundRequestId: string,
  options: FetchOptions = {}
): Promise<Record<string, unknown>> => {
  const response = await apiClient.post(
    urls.practiceRefundRequestExecute(practiceId, refundRequestId),
    {},
    { signal: options.signal }
  );
  return (response.data ?? {}) as Record<string, unknown>;
};
