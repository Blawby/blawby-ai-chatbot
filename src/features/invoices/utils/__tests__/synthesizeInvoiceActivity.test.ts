import { describe, it, expect } from 'vitest';
import { synthesizeInvoiceActivity } from '@/features/invoices/utils/synthesizeInvoiceActivity';
import type { InvoiceDetail } from '@/features/invoices/types';
import { asMajor } from '@/shared/utils/money';

const baseDetail: InvoiceDetail = {
  id: 'inv-1',
  invoiceNumber: 'INV-1001',
  stripeInvoiceNumber: null,
  status: 'draft',
  subtotal: 1000,
  taxAmount: 0,
  discountAmount: 0,
  clientName: 'Client',
  clientEmail: 'client@example.com',
  clientStatus: 'active',
  clientId: 'client-1',
  matterTitle: 'Matter',
  matterId: 'matter-1',
  matterStatus: 'open',
  matterBillingType: 'hourly',
  total: 1000,
  amountDue: 1000,
  amountPaid: 0,
  invoiceType: 'flat_fee',
  fundDestination: null,
  paymentFromRetainer: false,
  issueDate: '2026-03-02T00:00:00.000Z',
  dueDate: '2026-03-10T00:00:00.000Z',
  paidAt: null,
  connectedAccountId: 'acct-1',
  connectedAccountEmail: null,
  connectedAccountStripeAccountId: null,
  stripeInvoiceId: null,
  stripeChargeId: null,
  stripeTransferId: null,
  stripePaymentIntentId: null,
  stripeHostedInvoiceUrl: null,
  createdAt: '2026-03-01T00:00:00.000Z',
  updatedAt: '2026-03-01T00:00:00.000Z',
  sourceInvoice: {
    id: 'inv-1',
    organization_id: 'org-1',
    client_id: 'client-1',
    matter_id: 'matter-1',
    connected_account_id: 'acct-1',
    invoice_number: 'INV-1001',
    stripe_invoice_id: null,
    stripe_hosted_invoice_url: null,
    invoice_type: 'flat_fee',
    status: 'draft',
    subtotal: asMajor(1000),
    tax_amount: asMajor(0),
    discount_amount: asMajor(0),
    total: asMajor(1000),
    amount_paid: asMajor(0),
    amount_due: asMajor(1000),
    issue_date: '2026-03-02',
    due_date: '2026-03-10',
    paid_at: null,
    notes: null,
    memo: null,
    created_at: '2026-03-01T00:00:00.000Z',
    updated_at: '2026-03-01T00:00:00.000Z',
    line_items: [],
    client: null,
  },
  notes: null,
  memo: null,
  lineItems: [],
  payments: [],
  refunds: [],
  refundRequests: [],
  refundRequestSupported: true,
  refundRequestError: null,
};

describe('synthesizeInvoiceActivity', () => {
  it('emits a created entry for any invoice', () => {
    const items = synthesizeInvoiceActivity(baseDetail);
    expect(items).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'created', id: 'created-inv-1' })])
    );
  });

  it('emits an issued entry when issueDate differs from createdAt', () => {
    const items = synthesizeInvoiceActivity(baseDetail);
    expect(items.some((item) => item.id === 'issued-inv-1')).toBe(true);
  });

  it('emits a sent entry for sent/open/overdue/paid statuses', () => {
    for (const status of ['sent', 'open', 'overdue', 'paid'] as const) {
      const items = synthesizeInvoiceActivity({ ...baseDetail, status });
      expect(items.some((item) => item.id === 'sent-inv-1')).toBe(true);
    }
  });

  it('emits a paid entry per payment event', () => {
    const items = synthesizeInvoiceActivity({
      ...baseDetail,
      status: 'paid',
      payments: [
        { id: 'pay-1', amount: 500, currency: 'USD', status: 'succeeded', paidAt: '2026-03-03T00:00:00.000Z', note: null },
        { id: 'pay-2', amount: 500, currency: 'USD', status: 'succeeded', paidAt: '2026-03-04T00:00:00.000Z', note: null },
      ],
    });
    const paidItems = items.filter((item) => item.type === 'paid');
    expect(paidItems).toHaveLength(2);
  });

  it('emits an entry for each refund', () => {
    const items = synthesizeInvoiceActivity({
      ...baseDetail,
      status: 'paid',
      refunds: [
        { id: 'r-1', amount: 100, currency: 'USD', status: 'succeeded', createdAt: '2026-03-05T00:00:00.000Z', reason: 'Misbilled' },
      ],
    });
    expect(items.some((item) => item.id === 'refund-r-1')).toBe(true);
  });

  it('emits refund-request entries that vary by status', () => {
    const items = synthesizeInvoiceActivity({
      ...baseDetail,
      status: 'paid',
      refundRequests: [
        { id: 'rr-1', invoiceId: 'inv-1', amount: 100, status: 'requested', reason: 'test', createdAt: '2026-03-06', updatedAt: '2026-03-06' },
        { id: 'rr-2', invoiceId: 'inv-1', amount: 200, status: 'approved', reason: null, createdAt: '2026-03-07', updatedAt: '2026-03-07' },
        { id: 'rr-3', invoiceId: 'inv-1', amount: 300, status: 'executed', reason: null, createdAt: '2026-03-08', updatedAt: '2026-03-08' },
      ],
    });
    const refundIds = items
      .filter((item) => item.id.startsWith('refund-request-'))
      .map((item) => item.id);
    expect(refundIds).toEqual(
      expect.arrayContaining([
        'refund-request-rr-1-requested',
        'refund-request-rr-2-approved',
        'refund-request-rr-3-executed',
      ])
    );
  });

  it('emits a voided entry when invoice status is void or cancelled', () => {
    const items = synthesizeInvoiceActivity({ ...baseDetail, status: 'void' });
    expect(items.some((item) => item.id === 'voided-inv-1')).toBe(true);
  });

  it('orders items chronologically by dateTime', () => {
    const items = synthesizeInvoiceActivity({
      ...baseDetail,
      status: 'paid',
      payments: [
        { id: 'pay-1', amount: 1000, currency: 'USD', status: 'succeeded', paidAt: '2026-03-05T00:00:00.000Z', note: null },
      ],
    });
    const timestamps = items
      .map((item) => (item.dateTime ? new Date(item.dateTime).getTime() : 0))
      .filter((value) => value > 0);
    const sorted = [...timestamps].sort((a, b) => a - b);
    expect(timestamps).toEqual(sorted);
  });
});
