import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createPracticeRefundRequest,
  executePracticeRefund,
  listPracticeRefundRequests,
  reviewPracticeRefundRequest,
} from '@/features/invoices/services/invoicesService';

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPatch = vi.fn();

vi.mock('@/shared/lib/apiClient', () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
  },
}));

describe('practice refund-request service helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('createPracticeRefundRequest posts to practice-scoped invoice endpoint', async () => {
    mockPost.mockResolvedValue({ data: { id: 'rr-1' } });

    await createPracticeRefundRequest('practice-1', 'inv-1', { amount: 100, reason: 'oops' });

    expect(mockPost).toHaveBeenCalledWith(
      '/api/invoices/practice-1/inv-1/refund-requests',
      { amount: 100, reason: 'oops' },
      expect.any(Object)
    );
    expect(mockPost).not.toHaveBeenCalledWith(
      expect.stringContaining('/client/'),
      expect.anything(),
      expect.anything()
    );
  });

  it('listPracticeRefundRequests reads from practice-scoped collection endpoint', async () => {
    mockGet.mockResolvedValue({ data: { refund_requests: [] } });

    const result = await listPracticeRefundRequests('practice-1');

    expect(mockGet).toHaveBeenCalledWith('/api/invoices/practice-1/refund-requests', expect.any(Object));
    expect(result).toEqual([]);
  });

  it('reviewPracticeRefundRequest patches the per-request endpoint with the decision', async () => {
    mockPatch.mockResolvedValue({ data: { id: 'rr-1', status: 'approved' } });

    await reviewPracticeRefundRequest('practice-1', 'rr-1', { decision: 'approve' });

    expect(mockPatch).toHaveBeenCalledWith(
      '/api/invoices/practice-1/refund-requests/rr-1',
      { decision: 'approve' },
      expect.any(Object)
    );
  });

  it('executePracticeRefund posts to the execute sub-resource', async () => {
    mockPost.mockResolvedValue({ data: { id: 'rr-1', status: 'executed' } });

    await executePracticeRefund('practice-1', 'rr-1');

    expect(mockPost).toHaveBeenCalledWith(
      '/api/invoices/practice-1/refund-requests/rr-1/execute',
      {},
      expect.any(Object)
    );
  });
});
