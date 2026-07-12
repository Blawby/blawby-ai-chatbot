import { act, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auditList: vi.fn(),
  auditExport: vi.fn(),
  requestExport: vi.fn(),
  getExport: vi.fn(),
  showError: vi.fn(),
  showSuccess: vi.fn(),
  triggerDownload: vi.fn(),
}));

vi.mock('@/shared/hooks/usePracticeManagement', () => ({
  usePracticeManagement: () => ({
    currentPractice: {
      id: 'practice-local',
      betterAuthOrgId: '11111111-1111-4111-8111-111111111111',
    },
  }),
}));
vi.mock('@/shared/i18n/hooks', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@/shared/contexts/ToastContext', () => ({
  useToastContext: () => ({ showError: mocks.showError, showSuccess: mocks.showSuccess }),
}));
vi.mock('@/features/settings/services/auditLogApi', () => ({
  auditLogApi: { list: mocks.auditList, exportCsv: mocks.auditExport },
}));
vi.mock('@/features/settings/services/practiceExportsApi', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/features/settings/services/practiceExportsApi')>();
  return {
    ...original,
    practiceExportsApi: { request: mocks.requestExport, get: mocks.getExport },
  };
});
vi.mock('@/shared/utils/fileDownload', () => ({ triggerDownload: mocks.triggerDownload }));

import { AuditLogPage } from '@/features/settings/pages/AuditLogPage';
import { ExportDataPage } from '@/features/settings/pages/ExportDataPage';

const practiceId = '11111111-1111-4111-8111-111111111111';
const exportId = '22222222-2222-4222-8222-222222222222';
const requestKey = '33333333-3333-4333-8333-333333333333';
const userId = '44444444-4444-4444-8444-444444444444';

const auditPage = {
  data: [
    {
      id: '55555555-5555-4555-8555-555555555555',
      occurred_at: '2026-07-12T12:00:00.000Z',
      actor: { id: userId, type: 'user', name: 'Practice Owner', email: 'owner@example.test' },
      action_type: 'invoice.paid',
      target: { type: 'invoice', id: 'invoice-1' },
      summary: 'Invoice paid',
      source: {
        system: 'domain_event',
        producer: 'invoice.webhook',
        record_id: '55555555-5555-4555-8555-555555555555',
      },
    },
  ],
  page_info: {
    has_next_page: false,
    has_previous_page: false,
    next_cursor: null,
    previous_cursor: null,
  },
};

const queuedJob = {
  id: exportId,
  organization_id: practiceId,
  requested_by: userId,
  idempotency_key: requestKey,
  type: 'full_practice_archive' as const,
  status: 'queued' as const,
  content_type: null,
  byte_size: null,
  manifest: null,
  error: null,
  created_at: '2026-07-12T12:00:00.000Z',
  started_at: null,
  completed_at: null,
  failed_at: null,
  download: null,
};

const completedJob = {
  ...queuedJob,
  status: 'completed' as const,
  content_type: 'application/json',
  byte_size: 1024,
  manifest: { schema_version: 1 },
  completed_at: '2026-07-12T12:01:00.000Z',
  download: {
    url: 'https://storage.example.test/signed',
    expires_at: '2026-07-12T12:06:00.000Z',
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auditList.mockResolvedValue(auditPage);
  mocks.requestExport.mockResolvedValue(queuedJob);
  mocks.getExport.mockResolvedValue(completedJob);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('settings audit and export surfaces', () => {
  it('renders authoritative events and applies server-side search', async () => {
    render(<AuditLogPage />);
    expect(await screen.findByText('Invoice paid')).toBeInTheDocument();
    fireEvent.input(screen.getByLabelText('Search events'), { target: { value: 'invoice' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => {
      expect(mocks.auditList).toHaveBeenLastCalledWith(
        practiceId,
        { limit: 50, search: 'invoice' },
        expect.any(AbortSignal),
      );
    });
  });

  it('polls a durable export to completion and refreshes the signed URL before download', async () => {
    vi.useFakeTimers();
    render(<ExportDataPage />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Request export' })[0]);
    await act(async () => Promise.resolve());
    expect(mocks.requestExport).toHaveBeenCalledWith(
      practiceId,
      'full_practice_archive',
      expect.any(String),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(await screen.findByRole('button', { name: 'Download' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    await act(async () => Promise.resolve());
    expect(mocks.getExport).toHaveBeenLastCalledWith(practiceId, exportId);
    expect(mocks.triggerDownload).toHaveBeenCalledWith(
      'https://storage.example.test/signed',
      expect.stringContaining('full_practice_archive'),
      true,
    );
  });

  it('shows a polling failure and retries without converting it into success', async () => {
    vi.useFakeTimers();
    mocks.getExport.mockRejectedValueOnce(new Error('backend unavailable')).mockResolvedValueOnce(completedJob);
    render(<ExportDataPage />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Request export' })[0]);
    await act(async () => Promise.resolve());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Status could not be refreshed.');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(await screen.findByRole('button', { name: 'Download' })).toBeInTheDocument();
  });
});
