import { useCallback, useMemo, useState } from 'preact/hooks';
import { useNavigation } from '@/shared/utils/navigation';
import { useToastContext } from '@/shared/contexts/ToastContext';
import {
  listInvoices,
  sendInvoice,
  syncInvoice,
  voidInvoice,
} from '@/features/invoices/services/invoicesService';
import type { InvoiceFilterRule, InvoiceSummary } from '@/features/invoices/types';
import { InvoiceStatusBadge } from '@/features/invoices/components/InvoiceStatusBadge';
import { InvoicesTable } from '@/features/invoices/components/InvoicesTable';
import {
  type InvoiceColumnKey,
} from '@/features/invoices/config/invoiceCollection';
import { InvoiceListKpiRow } from '@/features/invoices/components/list/InvoiceListKpiRow';
import {
  INVOICE_TAB_STATUS_MAP,
  InvoiceStatusTabs,
  type InvoiceTabId,
} from '@/features/invoices/components/list/InvoiceStatusTabs';
import {
  InvoiceFilterChips,
  type InvoiceListFilterState,
} from '@/features/invoices/components/list/InvoiceFilterChips';
import { useInvoiceListAggregates } from '@/features/invoices/hooks/useInvoiceListAggregates';
import { VoidInvoiceConfirmDialog } from '@/features/invoices/components/dialogs/VoidInvoiceConfirmDialog';
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
const EMPTY_FILTERS: InvoiceListFilterState = { statuses: [] };

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

// `between` is inclusive on both ends; sentinel bounds turn half-open chip
// ranges into closed ones so `applyInvoiceFilterRule` matches the same items
// the old client-side filter did (e.g. totalMin without totalMax keeps items
// >= totalMin).
const DATE_RULE_MIN = '0000-01-01';
const DATE_RULE_MAX = '9999-12-31';
const TOTAL_RULE_MAX = String(Number.MAX_SAFE_INTEGER);

const buildChipFilterRules = (filters: InvoiceListFilterState): InvoiceFilterRule[] => {
  const rules: InvoiceFilterRule[] = [];
  if (filters.createdFrom || filters.createdTo) {
    rules.push({
      id: 'chip-createdAt',
      field: 'createdAt',
      operator: 'between',
      value: filters.createdFrom ?? DATE_RULE_MIN,
      valueTo: filters.createdTo ?? DATE_RULE_MAX,
    });
  }
  if (filters.dueFrom || filters.dueTo) {
    rules.push({
      id: 'chip-dueDate',
      field: 'dueDate',
      operator: 'between',
      value: filters.dueFrom ?? DATE_RULE_MIN,
      valueTo: filters.dueTo ?? DATE_RULE_MAX,
    });
  }
  if (filters.totalMin !== undefined || filters.totalMax !== undefined) {
    rules.push({
      id: 'chip-total',
      field: 'total',
      operator: 'between',
      value: filters.totalMin !== undefined ? String(filters.totalMin) : '0',
      valueTo: filters.totalMax !== undefined ? String(filters.totalMax) : TOTAL_RULE_MAX,
    });
  }
  return rules;
};

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
  const { showError, showSuccess } = useToastContext();
  const [visibleOptionalColumns, setVisibleOptionalColumns] = useState<InvoiceColumnKey[]>([]);
  const [activeTab, setActiveTab] = useState<InvoiceTabId>('all');
  const [chipFilters, setChipFilters] = useState<InvoiceListFilterState>(EMPTY_FILTERS);
  const [pendingVoidInvoice, setPendingVoidInvoice] = useState<InvoiceSummary | null>(null);
  const [isVoidLoading, setIsVoidLoading] = useState(false);

  const aggregates = useInvoiceListAggregates(practiceId);

  const effectiveStatusFilter = useMemo((): string[] | null => {
    const tabStatuses = INVOICE_TAB_STATUS_MAP[activeTab];
    const fromTab = tabStatuses.length > 0 ? tabStatuses : null;
    const fromChip = chipFilters.statuses.length > 0 ? chipFilters.statuses : null;
    const incoming = statusFilter.length > 0 ? statusFilter : null;
    const candidates = [incoming, fromTab, fromChip].filter((value): value is string[] => value !== null);
    if (candidates.length === 0) return STABLE_EMPTY_ARRAY;
    const result = candidates.reduce<string[]>((acc, current) => {
      if (acc.length === 0) return current;
      const allowed = new Set(current);
      return acc.filter((value) => allowed.has(value));
    }, []);
    return result.length === 0 ? null : result;
  }, [activeTab, chipFilters.statuses, statusFilter]);

  const chipFilterRules = useMemo(() => buildChipFilterRules(chipFilters), [chipFilters]);

  const {
    items: invoices,
    isLoading,
    isLoadingMore,
    error,
    hasMore,
    loadMore,
    refetch,
  } = usePaginatedList<InvoiceSummary>({
    fetchPage: async (page, signal) => {
      if (!practiceId || renderMode === 'detailOnly' || effectiveStatusFilter === null) {
        return { items: [], hasMore: false };
      }
      const result = await listInvoices(
        practiceId,
        {
          rules: chipFilterRules,
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
      JSON.stringify(chipFilterRules),
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

  const handleSendInvoice = useCallback(async (invoice: InvoiceSummary) => {
    if (!practiceId) return;
    try {
      await sendInvoice(practiceId, invoice.id);
      showSuccess('Invoice sent', `${invoice.invoiceNumber} was sent to the client.`);
      await refetch();
    } catch (err) {
      showError('Send failed', err instanceof Error ? err.message : 'Failed to send invoice');
    }
  }, [practiceId, refetch, showError, showSuccess]);

  const handleSyncInvoice = useCallback(async (invoice: InvoiceSummary) => {
    if (!practiceId) return;
    try {
      await syncInvoice(practiceId, invoice.id);
      showSuccess('Invoice synced', `${invoice.invoiceNumber} was synced with Stripe.`);
      await refetch();
    } catch (err) {
      showError('Sync failed', err instanceof Error ? err.message : 'Failed to sync invoice');
    }
  }, [practiceId, refetch, showError, showSuccess]);

  const handleVoidInvoice = useCallback((invoice: InvoiceSummary) => {
    setPendingVoidInvoice(invoice);
  }, []);

  const handleVoidConfirm = useCallback(async () => {
    if (!practiceId || !pendingVoidInvoice) return;
    setIsVoidLoading(true);
    try {
      await voidInvoice(practiceId, pendingVoidInvoice.id);
      showSuccess('Invoice voided', `${pendingVoidInvoice.invoiceNumber} has been voided.`);
      setPendingVoidInvoice(null);
      await refetch();
    } catch (err) {
      showError('Void failed', err instanceof Error ? err.message : 'Failed to void invoice');
    } finally {
      setIsVoidLoading(false);
    }
  }, [practiceId, pendingVoidInvoice, refetch, showError, showSuccess]);

  if (renderMode === 'detailOnly') {
    return null;
  }

  if (renderMode === 'listOnly' && !isLoading && !error && invoices.length === 0) {
    return null;
  }

  const hasFilters = effectiveStatusFilter === null || effectiveStatusFilter.length > 0
    || chipFilters.createdFrom !== undefined
    || chipFilters.createdTo !== undefined
    || chipFilters.dueFrom !== undefined
    || chipFilters.dueTo !== undefined
    || chipFilters.totalMin !== undefined
    || chipFilters.totalMax !== undefined;

  if (renderMode === 'full') {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6">
        <InvoiceListKpiRow aggregates={aggregates} />
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-input-text">Invoices</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {onCreateInvoice ? (
              <Button onClick={onCreateInvoice}>New Invoice</Button>
            ) : null}
          </div>
        </div>
        <InvoiceStatusTabs activeTab={activeTab} onChange={setActiveTab} aggregates={aggregates} />
        <InvoiceFilterChips
          filters={chipFilters}
          onChange={setChipFilters}
          visibleOptionalColumns={visibleOptionalColumns}
          onVisibleColumnsChange={setVisibleOptionalColumns}
        />
        <InvoicesTable
          invoices={invoices}
          loading={isLoading}
          loadingMore={isLoadingMore}
          hasMore={hasMore}
          onLoadMore={loadMore}
          error={error}
          emptyMessage={hasFilters ? 'No invoices match these filters.' : undefined}
          onRowClick={handleRowClick}
          onViewCustomer={handleViewCustomer}
          onSendInvoice={handleSendInvoice}
          onSyncInvoice={handleSyncInvoice}
          onVoidInvoice={handleVoidInvoice}
          visibleOptionalColumns={visibleOptionalColumns}
          footer={(
            <div className="flex w-full items-center justify-between gap-4">
              <span>{invoices.length} item{invoices.length === 1 ? '' : 's'}</span>
            </div>
          )}
        />
        <VoidInvoiceConfirmDialog
          isOpen={pendingVoidInvoice !== null}
          invoiceNumber={pendingVoidInvoice?.invoiceNumber}
          loading={isVoidLoading}
          onConfirm={handleVoidConfirm}
          onCancel={() => setPendingVoidInvoice(null)}
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
