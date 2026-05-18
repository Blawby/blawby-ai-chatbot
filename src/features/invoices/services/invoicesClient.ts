import { apiClient, isHttpError, isAbortError, pluckCollection, unwrapApiResponse } from '@/shared/lib/apiClient';
import { urls } from '@/config/urls';
import type { Invoice } from '@/features/matters/types/billing.types';

type FetchOptions = { signal?: AbortSignal };

const getErrorMessage = (error: unknown, fallback: string) => {
  if (isHttpError(error)) {
    const data = error.response.data;
    if (typeof data === 'string' && data.trim().length > 0) return data;
    if (data && typeof data === 'object') {
      const record = data as Record<string, unknown>;
      const message = typeof record.message === 'string' ? record.message : null;
      const err = typeof record.error === 'string' ? record.error : null;
      return message ?? err ?? error.message ?? fallback;
    }
    return error.message ?? fallback;
  }
  if (error instanceof Error) return error.message || fallback;
  return fallback;
};

const requestData = async <T>(promise: Promise<{ data: T }>, fallbackMessage: string): Promise<T> => {
  try {
    const response = await promise;
    return response.data;
  } catch (error) {
    if (isAbortError(error)) throw error;
    const normalized = new Error(getErrorMessage(error, fallbackMessage)) as Error & { status?: number };
    if (isHttpError(error)) normalized.status = error.response.status;
    throw normalized;
  }
};

const extractInvoices = (payload: unknown): Invoice[] => {
  const unwrapped = unwrapApiResponse<unknown>(payload);
  const list = pluckCollection<Invoice>(unwrapped, ['invoices']);
  if (list.length > 0) return list;
  // Fallback: backend occasionally returns `{ invoice: {...} }` for single-result paths.
  if (unwrapped && typeof unwrapped === 'object' && !Array.isArray(unwrapped)) {
    const record = unwrapped as Record<string, unknown>;
    if (record.invoice && typeof record.invoice === 'object') return [record.invoice as Invoice];
  }
  return [];
};

export const listClientInvoices = async (practiceId: string, options: FetchOptions = {}): Promise<Invoice[]> => {
  if (!practiceId) return [];
  const payload = await requestData(
    apiClient.get(urls.clientInvoicesList(practiceId), { signal: options.signal }),
    'Failed to load client invoices'
  );

  const invoices = extractInvoices(payload);
  if (invoices.length > 0) return invoices;
  return pluckCollection<Invoice>(unwrapApiResponse<unknown>(payload), ['items']);
};

export const getClientInvoice = async (practiceId: string, invoiceId: string, options: FetchOptions = {}): Promise<Invoice | null> => {
  if (!practiceId || !invoiceId) return null;
  const payload = await requestData(
    apiClient.get(urls.clientInvoice(practiceId, invoiceId), { signal: options.signal }),
    'Failed to load client invoice'
  );
  const invoices = extractInvoices(payload);
  return invoices[0] ?? null;
};

export interface RefundRequestPayload {
  amount?: number;
  reason?: string;
}

export const createRefundRequest = async (
  practiceId: string,
  invoiceId: string,
  payload: RefundRequestPayload,
  options: FetchOptions = {}
): Promise<Record<string, unknown>> => {
  if (!practiceId || !invoiceId) {
    throw new Error('Practice ID and invoice ID are required');
  }
  return requestData(
    apiClient.post(urls.clientInvoiceRefundRequests(practiceId, invoiceId), payload, { signal: options.signal }),
    'Failed to request refund'
  ) as Promise<Record<string, unknown>>;
};

export const listClientRefundRequests = async (
  practiceId: string,
  options: FetchOptions = {}
): Promise<Array<Record<string, unknown>>> => {
  if (!practiceId) return [];
  const payload = await requestData(
    apiClient.get(urls.clientRefundRequests(practiceId), { signal: options.signal }),
    'Failed to load refund requests'
  );

  return pluckCollection<Record<string, unknown>>(
    unwrapApiResponse<unknown>(payload),
    ['refund_requests', 'refundRequests', 'requests', 'items']
  );
};

export const cancelRefundRequest = async (
  practiceId: string,
  refundRequestId: string,
  options: FetchOptions = {}
): Promise<Record<string, unknown>> => {
  if (!practiceId || !refundRequestId) {
    throw new Error('Practice ID and refund request ID are required');
  }

  return requestData(
    apiClient.patch(urls.cancelClientRefundRequest(practiceId, refundRequestId), {}, { signal: options.signal }),
    'Failed to cancel refund request'
  ) as Promise<Record<string, unknown>>;
};
