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
  const normalized = value.trim().toLowerCase();
  if (ALLOWED_INVOICE_STATUSES.includes(normalized as InvoiceStatus)) {
    return normalized as InvoiceStatus;
  }
  return 'draft';
};

export const normalizeInvoiceNumber = (invoice: Invoice): string => {
  if (invoice.invoice_number) return invoice.invoice_number;
  if (invoice.stripe_invoice_number) return invoice.stripe_invoice_number;
  if (invoice.id != null) return String(invoice.id);
  return '';
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
  // Handle root-level invoice object (must have id and status fields)
  if (
    typeof record.id === 'string' &&
    typeof record.status === 'string' &&
    typeof record.created_at === 'string' &&
    typeof record.total !== 'undefined'
  ) {
    return record;
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

export const normalizeInvoiceSummary = (invoice: Invoice): InvoiceSummary => ({
  id: invoice.id,
  invoiceNumber: normalizeInvoiceNumber(invoice),
  stripeInvoiceNumber: asString(invoice.stripe_invoice_number),
  status: normalizeInvoiceStatus(invoice.status),
  subtotal: getMajorAmountValue(invoice.subtotal),
  taxAmount: getMajorAmountValue(invoice.tax_amount),
  discountAmount: getMajorAmountValue(invoice.discount_amount),
  clientName: asString(invoice.client?.name),
  clientEmail: asString(invoice.client?.email),
  clientStatus: asString(invoice.client?.status),
  clientId: asString(invoice.client_id),
  matterTitle: invoice.matter?.title ?? null,
  matterId: asString(invoice.matter_id),
  matterStatus: asString(invoice.matter?.status),
  matterBillingType: asString(invoice.matter?.billing_type),
  matterRetainerBalance: invoice.matter?.retainer_balance != null
    ? getMajorAmountValue(invoice.matter.retainer_balance)
    : null,
  total: getMajorAmountValue(invoice.total),
  amountDue: getMajorAmountValue(invoice.amount_due),
  amountPaid: getMajorAmountValue(invoice.amount_paid),
  invoiceType: asString(invoice.invoice_type),
  notes: asString(invoice.notes),
  memo: asString(invoice.memo),
  fundDestination: asString(invoice.fund_destination),
  paymentFromRetainer: typeof invoice.payment_from_retainer === 'boolean' ? invoice.payment_from_retainer : null,
  issueDate: invoice.issue_date,
  dueDate: invoice.due_date,
  paidAt: invoice.paid_at,
  connectedAccountId: asString(invoice.connected_account_id),
  connectedAccountEmail: asString(invoice.connectedAccount?.email),
  connectedAccountStripeAccountId: asString(invoice.connectedAccount?.stripe_account_id),
  stripeInvoiceId: asString(invoice.stripe_invoice_id),
  stripeChargeId: asString(invoice.stripe_charge_id),
  stripeTransferId: asString(invoice.stripe_transfer_id),
  stripePaymentIntentId: asString(invoice.stripe_payment_intent_id),
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
    payments: mapPaymentEvents(rawInvoice),
    refunds: mapRefundEvents(rawInvoice),
    refundRequests: mapRefundRequestEvents(rawInvoice, options.refundRequests ?? []),
    refundRequestSupported: options.refundRequestSupported ?? true,
    refundRequestError: options.refundRequestError ?? null,
  };
};
