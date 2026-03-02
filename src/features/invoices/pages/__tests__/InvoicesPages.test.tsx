// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@/__tests__/test-utils';
import { PracticeInvoicesPage } from '@/features/invoices/pages/PracticeInvoicesPage';
import { PracticeInvoiceDetailPage } from '@/features/invoices/pages/PracticeInvoiceDetailPage';
import { ClientInvoicesPage } from '@/features/invoices/pages/ClientInvoicesPage';
import { ClientInvoiceDetailPage } from '@/features/invoices/pages/ClientInvoiceDetailPage';
import WorkspaceNav from '@/features/chat/views/WorkspaceNav';
import type { InvoiceDetail, InvoiceListResult } from '@/features/invoices/types';
import { asMajor } from '@/shared/utils/money';

const mockNavigate = vi.fn((path: string) => {
  routePath = path;
});

vi.mock('@/shared/i18n/hooks', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
  I18nextProvider: ({ children }: { children: unknown }) => children,
}));

vi.mock('@/shared/contexts/SessionContext', () => ({
  useSessionContext: () => ({
    session: {
      user: {
        name: 'Test User',
        email: 'test@example.com',
        image: null,
      },
    },
  }),
}));

vi.mock('@/shared/utils/navigation', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
  }),
}));

const mockListPracticeInvoiceSummaries = vi.fn();
const mockListClientInvoiceSummaries = vi.fn();
const mockGetPracticeInvoiceDetail = vi.fn();
const mockSendPracticeInvoice = vi.fn();
const mockSyncPracticeInvoice = vi.fn();
const mockVoidPracticeInvoice = vi.fn();
const mockDeletePracticeInvoice = vi.fn();
const mockUpdatePracticeInvoice = vi.fn();
const mockGetClientInvoiceDetail = vi.fn();
const mockRequestClientInvoiceRefund = vi.fn();

vi.mock('@/features/invoices/services/invoicesService', () => ({
  listInvoices: (...args: unknown[]) => mockListPracticeInvoiceSummaries(...args),
  getInvoice: (...args: unknown[]) => mockGetPracticeInvoiceDetail(...args),
  sendInvoice: (...args: unknown[]) => mockSendPracticeInvoice(...args),
  syncInvoice: (...args: unknown[]) => mockSyncPracticeInvoice(...args),
  voidInvoice: (...args: unknown[]) => mockVoidPracticeInvoice(...args),
  deleteInvoice: (...args: unknown[]) => mockDeletePracticeInvoice(...args),
  updateInvoice: (...args: unknown[]) => mockUpdatePracticeInvoice(...args),
  getClientInvoice: (...args: unknown[]) => mockGetClientInvoiceDetail(...args),
  createRefundRequest: (...args: unknown[]) => mockRequestClientInvoiceRefund(...args),
  listClientInvoices: (...args: unknown[]) => mockListClientInvoiceSummaries(...args),
}));

let routePath = '/';

const setRoutePath = (nextPath: string) => {
  routePath = nextPath;
};

const makeDetail = (status: string, stripeHostedInvoiceUrl: string | null): InvoiceDetail => ({
  id: 'inv-1',
  invoiceNumber: 'INV-1001',
  status,
  clientName: 'Client One',
  matterTitle: 'Matter One',
  total: 1200,
  amountDue: status === 'paid' ? 0 : 1200,
  amountPaid: status === 'paid' ? 1200 : 0,
  issueDate: '2026-03-01',
  dueDate: '2026-03-10',
  paidAt: status === 'paid' ? '2026-03-02' : null,
  stripeHostedInvoiceUrl,
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
    stripe_invoice_number: 'INV-1001',
    stripe_hosted_invoice_url: stripeHostedInvoiceUrl,
    invoice_type: 'flat_fee',
    status: status as never,
    subtotal: asMajor(1200),
    tax_amount: asMajor(0),
    discount_amount: asMajor(0),
    total: asMajor(1200),
    amount_paid: asMajor(status === 'paid' ? 1200 : 0),
    amount_due: asMajor(status === 'paid' ? 0 : 1200),
    issue_date: '2026-03-01',
    due_date: '2026-03-10',
    paid_at: status === 'paid' ? '2026-03-02' : null,
    notes: null,
    memo: null,
    created_at: '2026-03-01T00:00:00.000Z',
    updated_at: '2026-03-01T00:00:00.000Z',
    line_items: [
      {
        id: 'li-1',
        type: 'service',
        description: 'Filing fee',
        quantity: 1,
        unit_price: asMajor(1200),
        line_total: asMajor(1200),
      },
    ],
    client: null,
  },
  notes: null,
  memo: null,
  lineItems: [
    {
      id: 'li-1',
      type: 'service',
      description: 'Filing fee',
      quantity: 1,
      unit_price: asMajor(1200),
      line_total: asMajor(1200),
    },
  ],
  downloadUrl: null,
  receiptUrl: null,
  payments: [],
  refunds: [],
  refundRequests: [],
  refundRequestSupported: true,
  refundRequestError: null,
});

describe('Invoices pages', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    setRoutePath('/');
  });

  it('renders practice invoices list and navigates on row click', async () => {
    const listResult: InvoiceListResult = {
      items: [
        {
          id: 'inv-1',
          invoiceNumber: 'INV-1001',
          status: 'draft',
          clientName: 'Client One',
          matterTitle: 'Matter One',
          total: 100,
          amountDue: 100,
          amountPaid: 0,
          issueDate: '2026-03-01',
          dueDate: '2026-03-10',
          paidAt: null,
          stripeHostedInvoiceUrl: null,
          createdAt: '2026-03-01T00:00:00.000Z',
          updatedAt: '2026-03-01T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 10,
    };
    mockListPracticeInvoiceSummaries.mockResolvedValue(listResult);

    render(<PracticeInvoicesPage practiceId="practice-1" practiceSlug="demo-practice" />);

    await waitFor(() => {
      expect(screen.getByText('INV-1001')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('INV-1001'));
    expect(mockNavigate).toHaveBeenCalledWith('/practice/demo-practice/invoices/inv-1');
  });

  it('handles practice detail sync action', async () => {
    mockGetPracticeInvoiceDetail.mockResolvedValue(makeDetail('sent', 'https://stripe.test/inv_1'));

    render(
      <PracticeInvoiceDetailPage
        practiceId="practice-1"
        practiceSlug="demo-practice"
        invoiceId="inv-1"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('INV-1001')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Sync' }));
    await waitFor(() => {
      expect(mockSyncPracticeInvoice).toHaveBeenCalledWith('practice-1', 'inv-1');
    });

  });

  it('handles practice detail void action', async () => {
    mockGetPracticeInvoiceDetail.mockResolvedValue(makeDetail('sent', 'https://stripe.test/inv_1'));

    render(
      <PracticeInvoiceDetailPage
        practiceId="practice-1"
        practiceSlug="demo-practice"
        invoiceId="inv-1"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('INV-1001')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Void' }));
    await waitFor(() => {
      expect(mockVoidPracticeInvoice).toHaveBeenCalledWith('practice-1', 'inv-1');
    });
  });

  it('handles practice draft send action', async () => {
    mockGetPracticeInvoiceDetail.mockResolvedValue(makeDetail('draft', null));

    render(
      <PracticeInvoiceDetailPage
        practiceId="practice-1"
        practiceSlug="demo-practice"
        invoiceId="inv-1"
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => {
      expect(mockSendPracticeInvoice).toHaveBeenCalledWith('practice-1', 'inv-1');
    });
  });

  it('shows Pay CTA when hosted invoice URL exists for client detail', async () => {
    mockGetClientInvoiceDetail.mockResolvedValue(makeDetail('open', 'https://stripe.test/inv_1'));
    render(
      <ClientInvoiceDetailPage
        practiceId="practice-1"
        practiceSlug="demo-practice"
        invoiceId="inv-1"
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Pay' })).toBeTruthy();
    });
  });

  it('does not render Pay CTA when hosted invoice URL is null', async () => {
    mockGetClientInvoiceDetail.mockResolvedValue(makeDetail('open', null));
    render(
      <ClientInvoiceDetailPage
        practiceId="practice-1"
        practiceSlug="demo-practice"
        invoiceId="inv-1"
      />
    );

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Pay' })).toBeNull();
    });
  });

  it('practice list row click transitions to detail route and loads detail by invoice id', async () => {
    const listResult: InvoiceListResult = {
      items: [
        {
          id: 'inv-1',
          invoiceNumber: 'INV-1001',
          status: 'draft',
          clientName: 'Client One',
          matterTitle: 'Matter One',
          total: 100,
          amountDue: 100,
          amountPaid: 0,
          issueDate: '2026-03-01',
          dueDate: '2026-03-10',
          paidAt: null,
          stripeHostedInvoiceUrl: null,
          createdAt: '2026-03-01T00:00:00.000Z',
          updatedAt: '2026-03-01T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 10,
    };
    mockListPracticeInvoiceSummaries.mockResolvedValue(listResult);
    mockGetPracticeInvoiceDetail.mockResolvedValue(makeDetail('draft', null));

    const PracticeRouteHarness = () => {
      const invoiceId = routePath.startsWith('/practice/demo-practice/invoices/')
        ? routePath.replace('/practice/demo-practice/invoices/', '')
        : null;
      return invoiceId
        ? (
          <PracticeInvoiceDetailPage
            practiceId="practice-1"
            practiceSlug="demo-practice"
            invoiceId={invoiceId}
          />
        )
        : <PracticeInvoicesPage practiceId="practice-1" practiceSlug="demo-practice" />;
    };

    setRoutePath('/practice/demo-practice/invoices');
    const rendered = render(<PracticeRouteHarness />);

    await waitFor(() => {
      expect(screen.getByText('INV-1001')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('INV-1001'));
    expect(mockNavigate).toHaveBeenCalledWith('/practice/demo-practice/invoices/inv-1');

    setRoutePath('/practice/demo-practice/invoices/inv-1');
    rendered.rerender(<PracticeRouteHarness />);

    await waitFor(() => {
      expect(mockGetPracticeInvoiceDetail).toHaveBeenCalledWith('practice-1', 'inv-1', expect.any(Object));
    });
  });

  it('client list row click transitions to detail route and only client detail loader is used', async () => {
    const listResult: InvoiceListResult = {
      items: [
        {
          id: 'inv-2',
          invoiceNumber: 'INV-2001',
          status: 'open',
          clientName: 'Client Two',
          matterTitle: 'Matter Two',
          total: 200,
          amountDue: 200,
          amountPaid: 0,
          issueDate: '2026-03-01',
          dueDate: '2026-03-10',
          paidAt: null,
          stripeHostedInvoiceUrl: 'https://stripe.test/inv_2',
          createdAt: '2026-03-01T00:00:00.000Z',
          updatedAt: '2026-03-01T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 10,
    };
    mockListClientInvoiceSummaries.mockResolvedValue(listResult);
    mockGetClientInvoiceDetail.mockResolvedValue(makeDetail('open', 'https://stripe.test/inv_2'));

    const ClientRouteHarness = () => {
      const invoiceId = routePath.startsWith('/client/demo-practice/invoices/')
        ? routePath.replace('/client/demo-practice/invoices/', '')
        : null;
      return invoiceId
        ? (
          <ClientInvoiceDetailPage
            practiceId="practice-1"
            practiceSlug="demo-practice"
            invoiceId={invoiceId}
          />
        )
        : <ClientInvoicesPage practiceId="practice-1" practiceSlug="demo-practice" />;
    };

    setRoutePath('/client/demo-practice/invoices');
    const rendered = render(<ClientRouteHarness />);

    await waitFor(() => {
      expect(screen.getByText('INV-2001')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('INV-2001'));
    expect(mockNavigate).toHaveBeenCalledWith('/client/demo-practice/invoices/inv-2');

    setRoutePath('/client/demo-practice/invoices/inv-2');
    rendered.rerender(<ClientRouteHarness />);

    await waitFor(() => {
      expect(mockGetClientInvoiceDetail).toHaveBeenCalledWith('practice-1', 'inv-2', expect.any(Object));
    });
    expect(mockGetPracticeInvoiceDetail).not.toHaveBeenCalledWith('practice-1', 'inv-2', expect.anything());
  });
});

describe('Invoices nav tab', () => {
  it('renders invoices tab as active', () => {
    render(
      <WorkspaceNav
        variant="bottom"
        activeTab="invoices"
        showClientTabs
        onSelectTab={vi.fn()}
      />
    );

    const invoicesTab = screen.getByRole('button', { name: 'workspace.navigation.invoices' });
    expect(invoicesTab.getAttribute('aria-current')).toBe('page');
  });
});
