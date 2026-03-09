import type { ComponentChildren } from 'preact';
import { useCallback } from 'preact/hooks';
import { useNavigation } from '@/shared/utils/navigation';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { listClientInvoices } from '@/features/invoices/services/invoicesService';
import type { InvoiceSummary } from '@/features/invoices/types';
import { InvoiceStatusBadge } from '@/features/invoices/components/InvoiceStatusBadge';
import { Panel } from '@/shared/ui/layout/Panel';
import { EntityList } from '@/shared/ui/list/EntityList';
import { usePaginatedList } from '@/shared/hooks/usePaginatedList';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { formatLongDate } from '@/shared/utils/dateFormatter';
import { cn } from '@/shared/utils/cn';

const PAGE_SIZE = 10;

export function ClientInvoicesPage({
  practiceId,
  practiceSlug,
  statusFilter = [],
  renderMode = 'full',
  listHeaderLeftControl,
}: {
  practiceId: string | null;
  practiceSlug: string | null;
  statusFilter?: string[];
  renderMode?: 'full' | 'listOnly' | 'detailOnly';
  listHeaderLeftControl?: ComponentChildren;
}) {
  const { navigate } = useNavigation();
  const { showError } = useToastContext();
  const isListOnly = renderMode === 'listOnly';

  const {
    items: invoices,
    isLoading,
    isLoadingMore,
    error,
    hasMore,
    loadMoreRef,
  } = usePaginatedList<InvoiceSummary>({
    fetchPage: async (page, signal) => {
      if (!practiceId || renderMode === 'detailOnly') {
        return { items: [], hasMore: false };
      }
      const result = await listClientInvoices(
        practiceId,
        { status: '', dateFrom: '', dateTo: '', search: '', page, pageSize: PAGE_SIZE },
        { signal, statusFilter }
      );
      const expectedCount = page * PAGE_SIZE;
      return { items: result.items, hasMore: result.total > expectedCount };
    },
    deps: [practiceId, renderMode, JSON.stringify(statusFilter)]
  });

  const handleRowClick = useCallback((invoice: InvoiceSummary) => {
    if (!practiceSlug) {
      showError('Invoices', 'Practice slug is missing from route context.');
      return;
    }
    navigate(`/client/${encodeURIComponent(practiceSlug)}/invoices/${encodeURIComponent(invoice.id)}`);
  }, [navigate, practiceSlug, showError]);

  if (renderMode === 'detailOnly') {
    return null;
  }

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col gap-2', isListOnly ? '' : 'p-4 sm:p-6')}>
      {listHeaderLeftControl ? (
        <div className="px-1 py-1">{listHeaderLeftControl}</div>
      ) : null}
      {renderMode === 'full' ? <p className="mt-1 text-sm text-input-placeholder">Your invoices and payment history.</p> : null}

      <Panel className="list-panel-card-gradient min-h-0 flex-1 overflow-hidden">
        <EntityList
          items={invoices}
          onSelect={handleRowClick}
          selectedId={undefined}
          isLoading={isLoading}
          isLoadingMore={isLoadingMore}
          error={error}
          emptyState={<div className="p-4 text-sm text-input-placeholder">{statusFilter.length > 0 ? 'No invoices match these filters.' : 'No invoices yet.'}</div>}
          loadMoreRef={hasMore ? loadMoreRef : undefined}
          renderItem={(invoice) => (
            <div
              className={cn('w-full px-4 py-3 text-left hover:bg-white/[0.03]')}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-input-text">{invoice.invoiceNumber}</p>
                  <p className="truncate text-xs text-input-placeholder">{invoice.clientName ?? 'Unknown person'}</p>
                  <p className="mt-1 text-xs text-input-placeholder">
                    Due {invoice.dueDate ? formatLongDate(invoice.dueDate) : 'N/A'}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <InvoiceStatusBadge status={invoice.status} />
                  <p className="text-sm font-semibold text-input-text">{formatCurrency(invoice.total)}</p>
                </div>
              </div>
            </div>
          )}
        />
      </Panel>
    </div>
  );
}
