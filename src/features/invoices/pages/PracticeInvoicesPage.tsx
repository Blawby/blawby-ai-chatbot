import { useCallback } from 'preact/hooks';
import { useNavigation } from '@/shared/utils/navigation';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { listInvoices } from '@/features/invoices/services/invoicesService';
import type { InvoiceSummary } from '@/features/invoices/types';
import { InvoiceStatusBadge } from '@/features/invoices/components/InvoiceStatusBadge';
import { InvoicesTable } from '@/features/invoices/components/InvoicesTable';
import { InvoiceFilters, type InvoiceFilterValue } from '@/features/invoices/components/InvoiceFilters';
import { Panel } from '@/shared/ui/layout/Panel';
import { WorkspacePlaceholderState } from '@/shared/ui/layout/WorkspacePlaceholderState';
import { EntityList } from '@/shared/ui/list/EntityList';
import { Button } from '@/shared/ui/Button';
import { CollectionToolbar } from '@/shared/ui/collection';
import { usePaginatedList } from '@/shared/hooks/usePaginatedList';
import { useCollectionView } from '@/shared/hooks/useCollectionView';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { formatLongDate } from '@/shared/utils/dateFormatter';
import { cn } from '@/shared/utils/cn';

const PAGE_SIZE = 10;
const STABLE_EMPTY_ARRAY: string[] = [];

const InvoicesEmptyState = ({
  hasFilters,
  onCreateInvoice,
}: {
  hasFilters: boolean;
  onCreateInvoice?: () => void;
}) => (
  <WorkspacePlaceholderState
    title={hasFilters ? 'No invoices match these filters' : 'No invoices yet'}
    description={hasFilters
      ? 'Try adjusting your filters to see more invoices.'
      : 'Create your first invoice here, or link one to a matter later.'}
    primaryAction={hasFilters ? undefined : (onCreateInvoice ? { label: 'New Invoice', onClick: onCreateInvoice } : undefined)}
    className="p-8"
  />
);

export function PracticeInvoicesPage({
  practiceId,
  practiceSlug,
  statusFilter = STABLE_EMPTY_ARRAY,
  renderMode = 'full',
  onCreateInvoice,
}: {
  practiceId: string | null;
  practiceSlug: string | null;
  statusFilter?: string[];
  renderMode?: 'full' | 'listOnly' | 'detailOnly';
  onCreateInvoice?: () => void;
}) {
  const { navigate } = useNavigation();
  const { showError } = useToastContext();
  const collection = useCollectionView<InvoiceFilterValue>({
    initialSearch: '',
    initialFilters: {
      status: '',
      dateFrom: '',
      dateTo: '',
    },
    initialViewMode: 'table',
  });
  const showLocalStatusFilter = statusFilter.length === 0;
  const effectiveSearch = collection.search.trim();
  const effectiveFilters: InvoiceFilterValue = collection.filters;

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
      const result = await listInvoices(
        practiceId,
        {
          status: showLocalStatusFilter ? effectiveFilters.status : '',
          dateFrom: effectiveFilters.dateFrom,
          dateTo: effectiveFilters.dateTo,
          search: effectiveSearch,
          page,
          pageSize: PAGE_SIZE,
        },
        { signal, statusFilter }
      );
      const expectedCount = page * PAGE_SIZE;
      return { items: result.items, hasMore: result.total > expectedCount };
    },
    deps: [
      practiceId,
      renderMode,
      JSON.stringify(statusFilter),
      showLocalStatusFilter,
      effectiveFilters.status,
      effectiveFilters.dateFrom,
      effectiveFilters.dateTo,
      effectiveSearch,
    ],
  });

  const handleRowClick = useCallback((invoice: InvoiceSummary) => {
    if (!practiceSlug) {
      showError('Invoices', 'Practice slug is missing from route context.');
      return;
    }
    navigate(`/practice/${encodeURIComponent(practiceSlug)}/invoices/${encodeURIComponent(invoice.id)}`);
  }, [navigate, practiceSlug, showError]);

  if (renderMode === 'detailOnly') {
    return null;
  }

  if (renderMode === 'listOnly' && !isLoading && !error && invoices.length === 0) {
    return null;
  }

  const hasFilters = statusFilter.length > 0
    || (showLocalStatusFilter && effectiveFilters.status.trim().length > 0)
    || effectiveFilters.dateFrom.trim().length > 0
    || effectiveFilters.dateTo.trim().length > 0
    || effectiveSearch.length > 0;

  if (renderMode === 'full') {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6">
        <InvoicesTable
          invoices={invoices}
          loading={isLoading}
          loadingMore={isLoadingMore}
          error={error}
          emptyMessage={hasFilters ? 'No invoices match these filters.' : undefined}
          onRowClick={handleRowClick}
          toolbar={(
            <CollectionToolbar
              title="Invoices"
              description="Track invoice status, due dates, and outstanding balances."
              searchValue={collection.search}
              onSearchChange={collection.setSearch}
              searchPlaceholder="Search invoice number, client, or matter"
              resultSummary={`${invoices.length} invoice${invoices.length === 1 ? '' : 's'} loaded${statusFilter.length > 0 ? ` • filtered by ${statusFilter.join(', ')}` : ''}`}
              filters={(
                <InvoiceFilters
                  value={effectiveFilters}
                  onChange={collection.setFilters}
                  onReset={() => {
                    collection.resetFilters();
                    collection.setSearch('');
                  }}
                  showStatus={showLocalStatusFilter}
                />
              )}
              actions={onCreateInvoice ? (
                <Button onClick={onCreateInvoice}>
                  New Invoice
                </Button>
              ) : undefined}
            />
          )}
        />
        {hasMore ? <div ref={loadMoreRef} className="h-6" /> : null}
      </div>
    );
  }

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col gap-2')}>
      <Panel className="list-panel-card-gradient min-h-0 flex-1 overflow-hidden">
        <EntityList
          items={invoices}
          onSelect={handleRowClick}
          selectedId={undefined}
          isLoading={isLoading}
          isLoadingMore={isLoadingMore}
          error={error}
          emptyState={<InvoicesEmptyState hasFilters={hasFilters} onCreateInvoice={onCreateInvoice} />}
          loadMoreRef={hasMore ? loadMoreRef : undefined}
          renderItem={(invoice) => (
            <div className={cn('w-full px-4 py-3 text-left hover:bg-white/[0.03]')}>
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
