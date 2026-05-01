import { useCallback, useState } from 'preact/hooks';
import { useNavigation } from '@/shared/utils/navigation';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { listInvoices } from '@/features/invoices/services/invoicesService';
import type { InvoiceSummary } from '@/features/invoices/types';
import { InvoiceStatusBadge } from '@/features/invoices/components/InvoiceStatusBadge';
import { InvoicesTable } from '@/features/invoices/components/InvoicesTable';
import { InvoiceColumnsMenu } from '@/features/invoices/components/InvoiceColumnsMenu';
import {
  OPTIONAL_INVOICE_COLUMNS,
  type InvoiceColumnKey,
} from '@/features/invoices/config/invoiceCollection';
import { Panel } from '@/shared/ui/layout/Panel';
import { WorkspacePlaceholderState } from '@/shared/ui/layout/WorkspacePlaceholderState';
import { EntityList } from '@/shared/ui/list/EntityList';
import { Button } from '@/shared/ui/Button';
import { usePaginatedList } from '@/shared/hooks/usePaginatedList';
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
  const [visibleOptionalColumns, setVisibleOptionalColumns] = useState<InvoiceColumnKey[]>([]);

  const {
    items: invoices,
    isLoading,
    isLoadingMore,
    error,
    hasMore,
    loadMore,
    loadMoreRef,
  } = usePaginatedList<InvoiceSummary>({
    fetchPage: async (page, signal) => {
      if (!practiceId || renderMode === 'detailOnly') {
        return { items: [], hasMore: false };
      }
      const result = await listInvoices(
        practiceId,
        {
          rules: [],
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
    ],
  });

  const handleRowClick = useCallback((invoice: InvoiceSummary) => {
    if (!practiceSlug) {
      showError('Invoices', 'Practice slug is missing from route context.');
      return;
    }
    const basePath = `/practice/${encodeURIComponent(practiceSlug)}/invoices/${encodeURIComponent(invoice.id)}`;
    navigate(invoice.status === 'draft' ? `${basePath}/edit` : basePath);
  }, [navigate, practiceSlug, showError]);

  const handleViewCustomer = useCallback((clientId: string) => {
    if (!practiceSlug) {
      showError('Contacts', 'Practice slug is missing from route context.');
      return;
    }
    navigate(`/practice/${encodeURIComponent(practiceSlug)}/contacts/${encodeURIComponent(clientId)}`);
  }, [navigate, practiceSlug, showError]);

  if (renderMode === 'detailOnly') {
    return null;
  }

  if (renderMode === 'listOnly' && !isLoading && !error && invoices.length === 0) {
    return null;
  }

  const hasFilters = statusFilter.length > 0;

  if (renderMode === 'full') {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-input-text">Invoices</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <InvoiceColumnsMenu
                visibleColumns={visibleOptionalColumns}
                columns={OPTIONAL_INVOICE_COLUMNS}
                onChange={setVisibleOptionalColumns}
              />
              {onCreateInvoice ? (
                <Button onClick={onCreateInvoice}>
                  New Invoice
                </Button>
              ) : null}
            </div>
          </div>
        </div>
        <InvoicesTable
          invoices={invoices}
          loading={isLoading}
          loadingMore={isLoadingMore}
          error={error}
          emptyMessage={hasFilters ? 'No invoices match these filters.' : undefined}
          onRowClick={handleRowClick}
          onViewCustomer={handleViewCustomer}
          visibleOptionalColumns={visibleOptionalColumns}
          footer={(
            <div className="flex w-full items-center justify-between gap-4">
              <span>{invoices.length} item{invoices.length === 1 ? '' : 's'}</span>
              {hasMore ? <div ref={loadMoreRef} className="h-6 w-6" /> : null}
            </div>
          )}
        />
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
          onLoadMore={hasMore ? loadMore : undefined}
          renderItem={(invoice) => (
            <div className={cn('w-full px-4 py-3 text-left hover:bg-surface-utility/10')}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-input-text">{invoice.invoiceNumber || '—'}</p>
                  <p className="truncate text-xs text-input-placeholder">{invoice.clientName ?? '—'}</p>
                  <p className="mt-1 text-xs text-input-placeholder">
                    Due {invoice.dueDate ? formatLongDate(invoice.dueDate) : '—'}
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
