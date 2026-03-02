import { apiClient } from '@/shared/lib/apiClient';
import { urls } from '@/config/urls';
import {
  listInvoices as listMatterInvoices,
  getInvoice as getMatterInvoice,
  sendInvoice as sendMatterInvoice,
  syncInvoice as syncMatterInvoice,
  voidInvoice as voidMatterInvoice,
  deleteInvoice as deleteMatterInvoice,
  updateInvoice as updateMatterInvoice,
} from '@/features/matters/services/invoicesApi';
import type { CreateInvoicePayload } from '@/features/matters/types/billing.types';
import {
  createRefundRequest as createRefundRequestApi,
  getClientInvoice as getClientInvoiceRecord,
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
import type {
  InvoiceDetail,
  InvoiceListFilters,
  InvoiceListResult,
  InvoiceSummary,
} from '@/features/invoices/types';

type FetchOptions = { signal?: AbortSignal };

const FALLBACK_PAGE_SIZE = 10;

const matchesDateRange = (candidateDate: string | null, dateFrom: string, dateTo: string): boolean => {
  if (!dateFrom && !dateTo) return true;
  if (!candidateDate) return false;
  const time = new Date(candidateDate).getTime();
  if (!Number.isFinite(time)) return false;
  if (dateFrom) {
    const fromTime = new Date(`${dateFrom}T00:00:00.000Z`).getTime();
    if (Number.isFinite(fromTime) && time < fromTime) return false;
  }
  if (dateTo) {
    const toTime = new Date(`${dateTo}T23:59:59.999Z`).getTime();
    if (Number.isFinite(toTime) && time > toTime) return false;
  }
  return true;
};

const filterInvoiceSummaries = (items: InvoiceSummary[], filters: InvoiceListFilters): InvoiceSummary[] => {
  const search = filters.search.trim().toLowerCase();
  const status = filters.status.trim().toLowerCase();

  return items.filter((item) => {
    if (status && item.status.toLowerCase() !== status) return false;
    if (!matchesDateRange(item.issueDate ?? item.createdAt, filters.dateFrom, filters.dateTo)) return false;
    if (!search) return true;

    return (
      item.invoiceNumber.toLowerCase().includes(search) ||
      (item.clientName?.toLowerCase().includes(search) ?? false) ||
      (item.matterTitle?.toLowerCase().includes(search) ?? false)
    );
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

const fetchRawPracticeInvoice = async (
  practiceId: string,
  invoiceId: string,
  options: FetchOptions = {}
): Promise<Record<string, unknown> | null> => {
  if (!practiceId || !invoiceId) return null;
  const response = await apiClient.get(urls.invoices(practiceId), {
    params: { invoice_id: invoiceId },
    signal: options.signal,
  });
  return extractInvoiceRecord(response.data);
};

const fetchRawClientInvoice = async (
  practiceId: string,
  invoiceId: string,
  options: FetchOptions = {}
): Promise<Record<string, unknown> | null> => {
  if (!practiceId || !invoiceId) return null;
  const response = await apiClient.get(urls.clientInvoice(practiceId, invoiceId), {
    signal: options.signal,
  });
  return extractInvoiceRecord(response.data);
};

export const listInvoices = async (
  practiceId: string,
  filters: InvoiceListFilters,
  options: FetchOptions = {}
): Promise<InvoiceListResult> => {
  const invoices = await listMatterInvoices(practiceId, undefined, options);
  const summaries = invoices
    .map(normalizeInvoiceSummary)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return paginate(filterInvoiceSummaries(summaries, filters), filters.page, filters.pageSize);
};

export const getInvoice = async (
  practiceId: string,
  invoiceId: string,
  options: FetchOptions = {}
): Promise<InvoiceDetail | null> => {
  const invoice = await getMatterInvoice(practiceId, invoiceId, options);
  if (!invoice) return null;
  const rawInvoice = await fetchRawPracticeInvoice(practiceId, invoiceId, options);
  return normalizeInvoiceDetail(invoice, rawInvoice);
};

export const listClientInvoices = async (
  practiceId: string,
  filters: InvoiceListFilters,
  options: FetchOptions = {}
): Promise<InvoiceListResult> => {
  const invoices = await listClientInvoiceRecords(practiceId, options);
  const summaries = invoices
    .map(normalizeInvoiceSummary)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return paginate(filterInvoiceSummaries(summaries, filters), filters.page, filters.pageSize);
};

export const getClientInvoice = async (
  practiceId: string,
  invoiceId: string,
  options: FetchOptions = {}
): Promise<InvoiceDetail | null> => {
  const invoice = await getClientInvoiceRecord(practiceId, invoiceId, options);
  if (!invoice) return null;

  const rawInvoice = await fetchRawClientInvoice(practiceId, invoiceId, options);

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
    const status = error && typeof error === 'object'
      ? (error as { status?: number }).status
      : undefined;

    if (status === 405 || status === 501) {
      refundRequestSupported = false;
    } else if (status === 404) {
      refundRequestError = 'Refund request endpoint route mismatch (404).';
    } else {
      throw error;
    }
  }

  return normalizeInvoiceDetail(invoice, rawInvoice, { refundRequests, refundRequestSupported, refundRequestError });
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
