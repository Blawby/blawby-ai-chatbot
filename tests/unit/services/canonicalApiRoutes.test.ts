import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fromMinorUnits } from '@/shared/utils/money';

const { mockApiClient } = vi.hoisted(() => ({
  mockApiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/shared/lib/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/apiClient')>();
  return { ...actual, apiClient: mockApiClient };
});

import { triggerIntakeInvite } from '@/features/intake/api/intakesApi';
import { sendInvoice, voidInvoice } from '@/features/matters/services/invoicesApi';
import {
  updateMatter,
  updateMatterExpense,
  updateMatterMilestone,
  updateMatterNote,
  updateMatterTimeEntry,
} from '@/features/matters/services/mattersApi';
import { updatePreferencesCategory } from '@/shared/lib/preferencesApi';

describe('canonical API consumers', () => {
  beforeEach(() => {
    Object.values(mockApiClient).forEach((mock) => mock.mockReset());
    mockApiClient.patch.mockResolvedValue({ data: {} });
    mockApiClient.post.mockResolvedValue({ data: {} });
  });

  it('uses PATCH for partial updates', async () => {
    await updateMatter('practice-1', 'matter-1', { title: 'Updated' });
    await updateMatterNote('practice-1', 'matter-1', 'note-1', 'Updated note');
    await updateMatterTimeEntry('practice-1', 'matter-1', 'entry-1', {
      start_time: '2026-07-14T10:00:00Z',
      end_time: '2026-07-14T11:00:00Z',
    });
    await updateMatterExpense('practice-1', 'matter-1', 'expense-1', {
      description: 'Filing fee',
      amount: fromMinorUnits(5_000),
      date: '2026-07-14',
    });
    await updateMatterMilestone('practice-1', 'matter-1', 'milestone-1', {
      description: 'Discovery complete',
      amount: fromMinorUnits(50_000),
      due_date: '2026-08-01',
    });
    await updatePreferencesCategory('general', { timezone: 'America/Chicago' });

    expect(mockApiClient.patch).toHaveBeenCalledTimes(6);
    expect(mockApiClient.put).not.toHaveBeenCalled();
  });

  it('uses the invoice status resource for send and void', async () => {
    await sendInvoice('practice-1', 'invoice-1');
    await voidInvoice('practice-1', 'invoice-1');

    expect(mockApiClient.patch).toHaveBeenNthCalledWith(
      1,
      '/api/invoices/practice-1/invoice-1/status',
      { status: 'sent' },
      expect.any(Object)
    );
    expect(mockApiClient.patch).toHaveBeenNthCalledWith(
      2,
      '/api/invoices/practice-1/invoice-1/status',
      { status: 'cancelled' },
      expect.any(Object)
    );
  });

  it('creates intake invitation sub-resources', async () => {
    await triggerIntakeInvite('intake-1');

    expect(mockApiClient.post).toHaveBeenCalledWith(
      '/api/practice-client-intakes/intake-1/invitations',
      {},
      expect.any(Object)
    );
  });
});
