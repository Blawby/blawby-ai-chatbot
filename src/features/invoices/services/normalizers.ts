import { getMajorAmountValue } from '@/shared/utils/money';
import type { Invoice } from '@/features/matters/types/billing.types';
import type {
  InvoiceDetail,
  InvoicePaymentEvent,
  InvoiceRefundEvent,
  InvoiceRefundRequestEvent,
  InvoiceStatus,
  InvoiceSummary,
} from '@/features/invoices/types';

export const asNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

export const asString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const asNullableDate = (value: unknown): string | null => {
  if (typeof value === 'string' && value.trim().length > 0) return value;
  return null;
};

const ALLOWED_INVOICE_STATUSES: InvoiceStatus[] = [
  'draft',
  'pending',
  'sent',
  'open',
  'overdue',
  'paid',
  'void',
  'cancelled',
];

export const normalizeInvoiceStatus = (value: unknown): InvoiceStatus => {
  if (typeof value !== 'string' || value.trim().length === 0) return 'draft';
  const normalized = value.trim().toLowerCase() as InvoiceStatus;
  return ALLOWED_INVOICE_STATUSES.includes(normalized) ? normalized : 'draft';
};

export const normalizeInvoiceNumber = (invoice: Invoice): string => {
  return invoice.stripe_invoice_number ?? invoice.invoice_number ?? invoice.id;
};

export const extractArray = <T extends Record<string, unknown>>(payload: unknown, keys: string[]): T[] => {
  if (Array.isArray(payload)) {
    return payload.filter((entry): entry is T => Boolean(entry && typeof entry === 'object'));
  }
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  for (const key of keys) {
    if (Array.isArray(record[key])) {
      return record[key].filter((entry): entry is T => Boolean(entry && typeof entry === 'object'));
    }
  }
  if ('data' in record) return extractArray<T>(record.data, keys);
  return [];
};

export const extractInvoiceRecord = (payload: unknown): Record<string, unknown> | null => {
  if (!payload || typeof payload !== 'object') return null;
  if (Array.isArray(payload)) {
    const item = payload.find((entry) => entry && typeof entry === 'object');
    return (item as Record<string, unknown> | undefined) ?? null;
  }
  const record = payload as Record<string, unknown>;
  if (record.invoice && typeof record.invoice === 'object') {
    return record.invoice as Record<string, unknown>;
  }
  if (Array.isArray(record.invoices) && record.invoices.length > 0 && typeof record.invoices[0] === 'object') {
    return record.invoices[0] as Record<string, unknown>;
  }
  if ('data' in record) return extractInvoiceRecord(record.data);
  return null;
};

const mapPaymentEvents = (rawInvoice: Record<string, unknown> | null): InvoicePaymentEvent[] => {
  const events = extractArray<Record<string, unknown>>(rawInvoice, ['payments', 'payment_history', 'paymentHistory']);
  return events.map((event) => ({
    id: asString(event.id) ?? crypto.randomUUID(),
    amount: asNumber(event.amount),
    currency: asString(event.currency),
    status: asString(event.status) ?? 'unknown',
    paidAt: asNullableDate(event.paid_at ?? event.paidAt ?? event.created_at),
    note: asString(event.note ?? event.description),
  }));
};

const mapRefundEvents = (rawInvoice: Record<string, unknown> | null): InvoiceRefundEvent[] => {
  const events = extractArray<Record<string, unknown>>(rawInvoice, ['refunds', 'refund_history', 'refundHistory']);
  return events.map((event) => ({
    id: asString(event.id) ?? crypto.randomUUID(),
    amount: asNumber(event.amount),
    currency: asString(event.currency),
    status: asString(event.status) ?? 'unknown',
    createdAt: asNullableDate(event.created_at ?? event.createdAt),
    reason: asString(event.reason),
  }));
};

const mapRefundRequestEvents = (
  rawInvoice: Record<string, unknown> | null,
  extraRefundRequests: Array<Record<string, unknown>> = []
): InvoiceRefundRequestEvent[] => {
  const events = [
    ...extractArray<Record<string, unknown>>(rawInvoice, ['refund_requests', 'refundRequests']),
    ...extraRefundRequests,
  ];

  const deduped = new Map<string, InvoiceRefundRequestEvent>();
  for (const event of events) {
    const id = asString(event.id) ?? crypto.randomUUID();
    deduped.set(id, {
      id,
      invoiceId: asString(event.invoice_id ?? event.invoiceId),
      amount: event.amount === undefined || event.amount === null ? null : asNumber(event.amount),
      status: asString(event.status) ?? 'requested',
      reason: asString(event.reason),
      createdAt: asNullableDate(event.created_at ?? event.createdAt),
      updatedAt: asNullableDate(event.updated_at ?? event.updatedAt),
    });
  }

  return Array.from(deduped.values());
};

const resolveDownloadUrl = (rawInvoice: Record<string, unknown> | null): string | null => {
  if (!rawInvoice) return null;
  return asString(rawInvoice.download_url ?? rawInvoice.downloadUrl ?? rawInvoice.pdf_url ?? rawInvoice.pdfUrl);
};

const resolveReceiptUrl = (rawInvoice: Record<string, unknown> | null): string | null => {
  if (!rawInvoice) return null;
  return asString(rawInvoice.receipt_url ?? rawInvoice.receiptUrl);
};

export const normalizeInvoiceSummary = (invoice: Invoice): InvoiceSummary => ({
  id: invoice.id,
  invoiceNumber: normalizeInvoiceNumber(invoice),
  status: normalizeInvoiceStatus(invoice.status),
  clientName: invoice.client?.user?.name ?? invoice.client?.user?.email ?? null,
  matterTitle: invoice.matter?.title ?? null,
  total: getMajorAmountValue(invoice.total),
  amountDue: getMajorAmountValue(invoice.amount_due),
  amountPaid: getMajorAmountValue(invoice.amount_paid),
  issueDate: invoice.issue_date,
  dueDate: invoice.due_date,
  paidAt: invoice.paid_at,
  stripeHostedInvoiceUrl: invoice.stripe_hosted_invoice_url,
  createdAt: invoice.created_at,
  updatedAt: invoice.updated_at,
});

export const normalizeInvoiceDetail = (
  invoice: Invoice,
  rawInvoice: Record<string, unknown> | null,
  options: {
    refundRequests?: Array<Record<string, unknown>>;
    refundRequestSupported?: boolean;
    refundRequestError?: string | null;
  } = {}
): InvoiceDetail => {
  const summary = normalizeInvoiceSummary(invoice);
  return {
    ...summary,
    sourceInvoice: invoice,
    notes: invoice.notes,
    memo: invoice.memo,
    lineItems: invoice.line_items ?? [],
    downloadUrl: resolveDownloadUrl(rawInvoice),
    receiptUrl: resolveReceiptUrl(rawInvoice),
    payments: mapPaymentEvents(rawInvoice),
    refunds: mapRefundEvents(rawInvoice),
    refundRequests: mapRefundRequestEvents(rawInvoice, options.refundRequests ?? []),
    refundRequestSupported: options.refundRequestSupported ?? true,
    refundRequestError: options.refundRequestError ?? null,
  };
};
