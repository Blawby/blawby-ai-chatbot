import type { Invoice } from '@/features/matters/types/billing.types';

export type InvoiceStatus =
  | 'draft'
  | 'pending'
  | 'sent'
  | 'open'
  | 'overdue'
  | 'paid'
  | 'void'
  | 'cancelled'
  | (string & {});

export interface InvoiceSummary {
  id: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  clientName: string | null;
  matterTitle: string | null;
  total: number;
  amountDue: number;
  amountPaid: number;
  issueDate: string | null;
  dueDate: string | null;
  paidAt: string | null;
  stripeHostedInvoiceUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InvoicePaymentEvent {
  id: string;
  amount: number;
  currency: string | null;
  status: string;
  paidAt: string | null;
  note: string | null;
}

export interface InvoiceRefundEvent {
  id: string;
  amount: number;
  currency: string | null;
  status: string;
  createdAt: string | null;
  reason: string | null;
}

export interface InvoiceRefundRequestEvent {
  id: string;
  invoiceId: string | null;
  amount: number | null;
  status: string;
  reason: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface InvoiceDetail extends InvoiceSummary {
  sourceInvoice: Invoice;
  notes: string | null;
  memo: string | null;
  lineItems: NonNullable<Invoice['line_items']>;
  downloadUrl: string | null;
  receiptUrl: string | null;
  payments: InvoicePaymentEvent[];
  refunds: InvoiceRefundEvent[];
  refundRequests: InvoiceRefundRequestEvent[];
  refundRequestSupported: boolean;
  refundRequestError: string | null;
}

export interface InvoiceListFilters {
  status: string;
  search: string;
  dateFrom: string;
  dateTo: string;
  page: number;
  pageSize: number;
}

export interface InvoiceListResult {
  items: InvoiceSummary[];
  total: number;
  page: number;
  pageSize: number;
}
