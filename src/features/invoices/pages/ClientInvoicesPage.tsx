import { useCallback, useState } from 'preact/hooks';
import { useNavigation } from '@/shared/utils/navigation';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { listClientInvoices } from '@/features/invoices/services/invoicesService';
import type { InvoiceSummary } from '@/features/invoices/types';
import { InvoiceStatusBadge } from '@/features/invoices/components/InvoiceStatusBadge';
import { InvoicesTable } from '@/features/invoices/components/InvoicesTable';
import { ColumnEditor, type ColumnEditorOption } from '@/shared/ui/table';
import { SegmentedToggle } from '@/shared/ui/input/SegmentedToggle';
import {
  CLIENT_SAFE_INVOICE_COLUMNS,
  DEFAULT_INVOICE_COLUMN_DEFS,
  type InvoiceColumnKey,
} from '@/features/invoices/config/invoiceCollection';
import { Panel } from '@/shared/ui/layout/Panel';
import { WorkspacePlaceholderState } from '@/shared/ui/layout/WorkspacePlaceholderState';
import { EntityList } from '@/shared/ui/list/EntityList';
import { usePaginatedList } from '@/shared/hooks/usePaginatedList';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { formatLongDate } from '@/shared/utils/dateFormatter';
import { cn } from '@/shared/utils/cn';

const PAGE_SIZE = 10;
type ClientInvoiceTabId = 'all' | 'unpaid' | 'paid';
const CLIENT_INVOICE_TAB_STATUS_MAP: Record<ClientInvoiceTabId, string[]> = {
  all: [],
  unpaid: ['open', 'overdue'],
  paid: ['paid'],
};
const CLIENT_INVOICE_TAB_OPTIONS: ReadonlyArray<{ value: ClientInvoiceTabId; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'paid', label: 'Paid' },
];

const CLIENT_COLUMN_OPTIONS: ColumnEditorOption[] = [
  ...DEFAULT_INVOICE_COLUMN_DEFS.map((column) => ({ ...column, fixed: true })),
  ...CLIENT_SAFE_INVOICE_COLUMNS,
];

const InvoicesEmptyState = ({ hasFilters }: { hasFilters: boolean }) => (
  <WorkspacePlaceholderState
    title={hasFilters ? 'No invoices match these filters' : 'No invoices yet'}
    description={hasFilters
      ? 'Try adjusting your filters to see more invoices.'
      : 'Invoices shared with you will appear here.'}
    className="p-8"
  />
);

export function ClientInvoicesPage({
  practiceId,
  practiceSlug,
  statusFilter = [],
  renderMode = 'full',
}: {
  practiceId: string | null;
  practiceSlug: string | null;
  statusFilter?: string[];
  renderMode?: 'full' | 'listOnly' | 'detailOnly';
}) {
  const { navigate } = useNavigation();
  const { showError } = useToastContext();
  const [visibleOptionalColumns, setVisibleOptionalColumns] = useState<InvoiceColumnKey[]>([]);
  const [activeTab, setActiveTab] = useState<ClientInvoiceTabId>('all');
  const effectiveStatusFilter = statusFilter.length > 0
    ? statusFilter
    : CLIENT_INVOICE_TAB_STATUS_MAP[activeTab];

  const {
    items: invoices,
    isLoading,
    isLoadingMore,
    error,
    hasMore,
    loadMore,
  } = usePaginatedList<InvoiceSummary>({
    fetchPage: async (page, signal) => {
      if (!practiceId || renderMode === 'detailOnly') {
        return { items: [], hasMore: false };
      }
      const result = await listClientInvoices(
        practiceId,
        {
          rules: [],
          page,
          pageSize: PAGE_SIZE,
        },
        { signal, statusFilter: effectiveStatusFilter }
      );
      const expectedCount = page * PAGE_SIZE;
      return { items: result.items, hasMore: result.total > expectedCount };
    },
    deps: [
      practiceId,
      renderMode,
      JSON.stringify(effectiveStatusFilter),
    ]
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

  if (renderMode === 'listOnly' && !isLoading && !error && invoices.length === 0) {
    return null;
  }

  const hasFilters = effectiveStatusFilter.length > 0;

  if (renderMode === 'full') {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentedToggle<ClientInvoiceTabId>
            value={activeTab}
            options={CLIENT_INVOICE_TAB_OPTIONS}
            onChange={setActiveTab}
            ariaLabel="Filter invoices by status"
            className="w-full sm:w-auto sm:min-w-[18rem]"
          />
          <ColumnEditor
            options={CLIENT_COLUMN_OPTIONS}
            visible={visibleOptionalColumns}
            onChange={(next) => setVisibleOptionalColumns(next as InvoiceColumnKey[])}
          />
        </div>
        <InvoicesTable
          invoices={invoices}
          loading={isLoading}
          loadingMore={isLoadingMore}
          hasMore={hasMore}
          onLoadMore={loadMore}
          error={error}
          emptyMessage={hasFilters ? 'No invoices match these filters.' : undefined}
          onRowClick={handleRowClick}
          visibleOptionalColumns={visibleOptionalColumns}
          footer={(
            <div className="flex w-full items-center justify-between gap-4">
              <span>{invoices.length} item{invoices.length === 1 ? '' : 's'}</span>
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
          minMountSkeletonMs={250}
          emptyState={<InvoicesEmptyState hasFilters={hasFilters} />}
          onLoadMore={hasMore ? loadMore : undefined}
          renderItem={(invoice) => (
            <div
              className={cn('w-full px-4 py-3 text-left hover:bg-surface-utility/10')}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{invoice.invoiceNumber || '—'}</p>
                  <p className="truncate text-xs text-dim-2">{invoice.clientName ?? '—'}</p>
                  <p className="mt-1 text-xs text-dim-2">
                    Due {invoice.dueDate ? formatLongDate(invoice.dueDate) : '—'}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <InvoiceStatusBadge status={invoice.status} />
                  <p className="text-sm font-semibold text-ink">{formatCurrency(invoice.total)}</p>
                </div>
              </div>
            </div>
          )}
        />
      </Panel>
    </div>
  );
}
