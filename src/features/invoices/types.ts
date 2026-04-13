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
 stripeInvoiceNumber?: string | null;
 status: InvoiceStatus;
 subtotal?: number;
 taxAmount?: number;
 discountAmount?: number;
 clientName: string | null;
 clientEmail: string | null;
 clientStatus?: string | null;
 clientId?: string | null;
 matterTitle: string | null;
 matterId?: string | null;
 matterStatus?: string | null;
 matterBillingType?: string | null;
 matterRetainerBalance?: number | null;
 total: number;
 amountDue: number;
 amountPaid: number;
 invoiceType?: string | null;
 notes?: string | null;
 memo?: string | null;
 fundDestination?: string | null;
 paymentFromRetainer?: boolean | null;
 issueDate: string | null;
 dueDate: string | null;
 paidAt: string | null;
 connectedAccountId?: string | null;
 connectedAccountEmail?: string | null;
 connectedAccountStripeAccountId?: string | null;
 stripeInvoiceId?: string | null;
 stripeChargeId?: string | null;
 stripeTransferId?: string | null;
 stripePaymentIntentId?: string | null;
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
 payments: InvoicePaymentEvent[];
 refunds: InvoiceRefundEvent[];
 refundRequests: InvoiceRefundRequestEvent[];
 refundRequestSupported: boolean;
 refundRequestError: string | null;
}

export type InvoiceFilterFieldKey =
 | 'status'
 | 'createdAt'
 | 'dueDate'
 | 'paidAt'
 | 'invoiceNumber'
 | 'total'
 | 'subtotal'
 | 'taxAmount'
 | 'discountAmount'
 | 'amountPaid'
 | 'amountDue'
 | 'paymentFromRetainer'
 | 'clientName'
 | 'clientEmail'
 | 'clientId'
 | 'clientStatus'
 | 'matterId'
 | 'matterTitle'
 | 'matterStatus'
 | 'matterBillingType'
 | 'invoiceType'
 | 'fundDestination'
 | 'updatedAt'
 | 'stripeInvoiceId'
 | 'stripeInvoiceNumber'
 | 'stripeChargeId'
 | 'stripeTransferId'
 | 'stripePaymentIntentId'
 | 'stripeHostedInvoiceUrl'
 | 'connectedAccountId'
 | 'connectedAccountEmail'
 | 'connectedAccountStripeAccountId';

export type InvoiceFilterOperator =
 | 'contains'
 | 'equals'
 | 'startsWith'
 | 'is'
 | 'before'
 | 'after'
 | 'between'
 | 'greaterThan'
 | 'lessThan'
 | 'isEmpty'
 | 'isNotEmpty';

export interface InvoiceFilterRule {
 id: string;
 field: InvoiceFilterFieldKey;
 operator: InvoiceFilterOperator;
 value?: string;
 valueTo?: string;
}

export interface InvoiceListFilters {
 rules?: InvoiceFilterRule[];
 page?: number;
 pageSize?: number;
}

export interface InvoiceListResult {
 items: InvoiceSummary[];
 total: number;
 page: number;
 pageSize: number;
}
