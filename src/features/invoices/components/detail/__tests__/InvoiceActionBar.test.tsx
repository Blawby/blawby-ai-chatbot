// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@/__tests__/test-utils';
import { InvoiceActionBar } from '@/features/invoices/components/detail/InvoiceActionBar';
import type { InvoiceDetail } from '@/features/invoices/types';
import { asMajor } from '@/shared/utils/money';

const buildDetail = (overrides: Partial<InvoiceDetail> = {}): InvoiceDetail => ({
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
  issueDate: '2026-03-02',
  dueDate: '2026-03-10',
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
  ...overrides,
});

const baseProps = {
  isMutating: false,
  onEditDraft: vi.fn(),
  onSendInvoice: vi.fn(),
  onSync: vi.fn(),
  onVoid: vi.fn(),
  onOpenHosted: vi.fn(),
  onRequestRefund: vi.fn(),
  onViewCustomer: vi.fn(),
};

describe('InvoiceActionBar', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows "Edit draft" primary action for draft invoices', () => {
    render(<InvoiceActionBar detail={buildDetail({ status: 'draft' })} {...baseProps} />);
    const button = screen.getByRole('button', { name: 'Edit draft' });
    fireEvent.click(button);
    expect(baseProps.onEditDraft).toHaveBeenCalled();
  });

  it('shows "Sync with Stripe" primary action for sent invoices', () => {
    render(<InvoiceActionBar detail={buildDetail({ status: 'sent' })} {...baseProps} />);
    expect(screen.getByRole('button', { name: 'Sync with Stripe' })).toBeTruthy();
  });

  it('shows "Open hosted invoice" primary action for paid invoices with hosted URL', () => {
    render(
      <InvoiceActionBar
        detail={buildDetail({ status: 'paid', amountPaid: 1000, stripeHostedInvoiceUrl: 'https://stripe.test/x' })}
        {...baseProps}
      />
    );
    expect(screen.getByRole('button', { name: 'Open hosted invoice' })).toBeTruthy();
  });

  it('shows Refund button when invoice is paid', () => {
    render(
      <InvoiceActionBar
        detail={buildDetail({ status: 'paid', amountPaid: 1000 })}
        {...baseProps}
      />
    );
    const refundButton = screen.getByRole('button', { name: 'Refund' });
    fireEvent.click(refundButton);
    expect(baseProps.onRequestRefund).toHaveBeenCalled();
  });

  it('hides Refund button when no amount has been paid', () => {
    render(<InvoiceActionBar detail={buildDetail({ status: 'draft', amountPaid: 0 })} {...baseProps} />);
    expect(screen.queryByRole('button', { name: 'Refund' })).toBeNull();
  });

  it('never renders a "Charge customer" action', () => {
    render(
      <InvoiceActionBar
        detail={buildDetail({ status: 'paid', amountPaid: 1000, stripeHostedInvoiceUrl: 'https://stripe.test/x' })}
        {...baseProps}
      />
    );
    expect(screen.queryByText(/charge customer/i)).toBeNull();
  });
});
