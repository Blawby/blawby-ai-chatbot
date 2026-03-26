import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createRefundRequest,
  getClientInvoice,
  listClientInvoices,
  listClientRefundRequests,
} from '@/features/invoices/services/invoicesClient';

const mockGet = vi.fn();
const mockPost = vi.fn();

vi.mock('@/shared/lib/apiClient', () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

describe('invoicesClient service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses client-scoped endpoint for list requests', async () => {
    mockGet.mockResolvedValue({
      data: {
        invoices: [],
      },
    });

    await listClientInvoices('practice-1');

    expect(mockGet).toHaveBeenCalledWith('/api/invoices/practice-1/client', expect.any(Object));
    expect(mockGet).not.toHaveBeenCalledWith('/api/invoices/practice-1', expect.any(Object));
  });

  it('uses client-scoped endpoint for detail requests', async () => {
    mockGet.mockResolvedValue({
      data: {
        invoice: {
          id: 'inv-1',
        },
      },
    });

    await getClientInvoice('practice-1', 'inv-1');

    expect(mockGet).toHaveBeenCalledWith('/api/invoices/practice-1/client/inv-1', expect.any(Object));
    expect(mockGet).not.toHaveBeenCalledWith('/api/invoices/practice-1', expect.any(Object));
  });

  it('uses client refund-request endpoints under /api/invoices/:practiceId/client', async () => {
    mockGet.mockResolvedValue({ data: { refund_requests: [] } });
    mockPost.mockResolvedValue({ data: { id: 'rr-1' } });

    await listClientRefundRequests('practice-1');
    await createRefundRequest('practice-1', 'inv-1', { reason: 'test' });

    expect(mockGet).toHaveBeenCalledWith('/api/invoices/practice-1/client/refund-requests', expect.any(Object));
    expect(mockPost).toHaveBeenCalledWith('/api/invoices/practice-1/client/inv-1/refund-requests', { reason: 'test' }, expect.any(Object));
  });
});
