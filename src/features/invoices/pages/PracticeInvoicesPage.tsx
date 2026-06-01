import { useCallback, useMemo, useState } from 'preact/hooks';
import { Inbox } from 'lucide-preact';
import { useNavigation } from '@/shared/utils/navigation';
import { useToastContext } from '@/shared/contexts/ToastContext';
import {
  listInvoices,
  sendInvoice,
  syncInvoice,
  voidInvoice,
} from '@/features/invoices/services/invoicesService';
import type { InvoiceFilterRule, InvoiceSummary } from '@/features/invoices/types';
import { InvoicesTable } from '@/features/invoices/components/InvoicesTable';
import { PracticeInvoiceRow } from '@/features/invoices/components/PracticeInvoiceRow';
import { type InvoiceColumnKey } from '@/features/invoices/config/invoiceCollection';
import {
  InvoiceFilterChips,
  type InvoiceListFilterState,
} from '@/features/invoices/components/list/InvoiceFilterChips';
import { useInvoiceListAggregates } from '@/features/invoices/hooks/useInvoiceListAggregates';
import { VoidInvoiceConfirmDialog } from '@/features/invoices/components/dialogs/VoidInvoiceConfirmDialog';
import { WorkspacePlaceholderState } from '@/shared/ui/layout/WorkspacePlaceholderState';
import { EntityList } from '@/shared/ui/list/EntityList';
import { Button } from '@/shared/ui/Button';
import { SplitDetail } from '@/design-system/layout';
import {
  Seg,
  AIAskBar,
  AIAnswerCard,
} from '@/design-system/patterns';
import { usePaginatedList } from '@/shared/hooks/usePaginatedList';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { cn } from '@/shared/utils/cn';

const PAGE_SIZE = 10;
const EMPTY_FILTERS: InvoiceListFilterState = {};
// Stable identity for the default `statusFilter` prop so it keeps the same
// reference across renders (used in fetch deps). Restored after an earlier
// refactor removed the definition but left the usage below.
const STABLE_EMPTY_ARRAY: string[] = [];

// Inline status filter (Seg) — surfaces the same status buckets the canonical
// Invoices.html mockup shows ("All / Staged / Sent / Paid / Overdue"). Counts
// come from `useInvoiceListAggregates`. NOTE(backend): the `staged` bucket
// will land with RA5's detail-side work; until then we map it to drafts so the
// pill renders but the count is correct.
type StatusTabId = 'all' | 'staged' | 'sent' | 'paid' | 'overdue';
const STATUS_TAB_FILTER: Record<StatusTabId, string[]> = {
  all: [],
  staged: ['draft'],
  sent: ['sent', 'open', 'pending'],
  paid: ['paid'],
  overdue: ['overdue'],
};

// Cards-vs-Table view toggle — Cards (EntityList + PracticeInvoiceRow) is the
// default chat-first surface; power users can flip to Table (existing
// InvoicesTable + ColumnEditor) for bulk inspection. Kept as in-page state.
type ViewMode = 'cards' | 'table';
const VIEW_MODE_OPTIONS: ReadonlyArray<{ value: ViewMode; label: string }> = [
  { value: 'cards', label: 'Cards' },
  { value: 'table', label: 'Table' },
];

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

const DetailEmptyState = () => (
  <WorkspacePlaceholderState
    icon={Inbox}
    title="Select an invoice"
    description="Pick an invoice from the list to view its details, line items, and payment status."
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
  const { showError, showSuccess, showInfo } = useToastContext();
  const [visibleOptionalColumns, setVisibleOptionalColumns] = useState<InvoiceColumnKey[]>([]);
  const [chipFilters, setChipFilters] = useState<InvoiceListFilterState>(EMPTY_FILTERS);
  const [pendingVoidInvoice, setPendingVoidInvoice] = useState<InvoiceSummary | null>(null);
  const [isVoidLoading, setIsVoidLoading] = useState(false);
  const [statusTab, setStatusTab] = useState<StatusTabId>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [askAnswer, setAskAnswer] = useState<{ query: string } | null>(null);

  const aggregates = useInvoiceListAggregates(practiceId);

  // Status tab overrides the parent-supplied `statusFilter` only when the
  // parent didn't provide one. Lets the workspace route still pin to a
  // status group when invoked from the rail (e.g. "Overdue") without
  // breaking the in-page tab.
  const effectiveStatusFilter = useMemo(() => {
    if (statusFilter.length > 0) return statusFilter;
    return STATUS_TAB_FILTER[statusTab];
  }, [statusFilter, statusTab]);

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
      if (!practiceId || renderMode === 'detailOnly') {
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

  // ── AI ask submit ─────────────────────────────────────────────────────
  const handleAskSubmit = useCallback((query: string) => {
    // TODO(backend): wire to /api/practice/:id/invoices/ask once the
    // natural-language invoices-query endpoint exists. Today the
    // AIAnswerCard narrates the current filter state so the chat-first
    // shape is end-to-end without fabricating answers.
    setAskAnswer({ query });
  }, []);

  if (renderMode === 'detailOnly') {
    return null;
  }

  if (renderMode === 'listOnly' && !isLoading && !error && invoices.length === 0) {
    return null;
  }

  const hasFilters = effectiveStatusFilter.length > 0
    || chipFilters.createdFrom !== undefined
    || chipFilters.createdTo !== undefined
    || chipFilters.dueFrom !== undefined
    || chipFilters.dueTo !== undefined
    || chipFilters.totalMin !== undefined
    || chipFilters.totalMax !== undefined;

  const totalCount = aggregates.outstanding.count + aggregates.paid30d.count + aggregates.drafts.count;
  const sentCount = Math.max(0, aggregates.outstanding.count - aggregates.pastDue.count);

  // ── Status tab options with live counts ───────────────────────────────
  const statusTabOptions: ReadonlyArray<{ value: StatusTabId; label: string }> = [
    { value: 'all', label: `All${aggregates.loading ? '' : ` · ${totalCount}`}` },
    { value: 'staged', label: `Staged${aggregates.loading ? '' : ` · ${aggregates.drafts.count}`}` },
    { value: 'sent', label: `Sent${aggregates.loading ? '' : ` · ${sentCount}`}` },
    { value: 'paid', label: `Paid${aggregates.loading ? '' : ` · ${aggregates.paid30d.count}`}` },
    { value: 'overdue', label: `Overdue${aggregates.loading ? '' : ` · ${aggregates.pastDue.count}`}` },
  ];

  // ── Stat cells (canonical Invoices.html) ──────────────────────────────
  const statCells = [
    { label: 'Outstanding', value: formatCurrency(aggregates.outstanding.amount), warn: false },
    { label: 'Paid 30d', value: formatCurrency(aggregates.paid30d.amount), warn: false },
    { label: 'Overdue', value: String(aggregates.pastDue.count), warn: aggregates.pastDue.count > 0 },
  ];

  // ── The list-shell head (used in both full + listOnly) ────────────────
  const listHead = (
    <div className="border-b border-rule px-[22px] pb-[14px] pt-[22px]">
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
        Workspace · {aggregates.loading ? '—' : `${totalCount} invoices`}
      </div>
      <h1 className="mt-1 font-[family-name:var(--serif)] text-[34px] font-normal leading-none tracking-[-0.02em] text-ink">
        Invoices
      </h1>
      <div className="mt-3 flex flex-wrap gap-3.5">
        {statCells.map((cell) => (
          <div key={cell.label} className="flex flex-col gap-0.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.04em] text-dim">
              {cell.label}
            </span>
            <span className={cn(
              'font-[family-name:var(--sans)] text-sm font-medium',
              cell.warn ? 'text-neg' : 'text-ink'
            )}>
              {cell.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );

  // ── List body (used in both full + listOnly) ──────────────────────────
  const listBody = (
    <>
      <div className="border-b border-rule bg-paper-2 px-[22px] py-2.5">
        <Seg<StatusTabId>
          value={statusTab}
          options={statusTabOptions}
          onChange={setStatusTab}
          ariaLabel="Filter invoices by status"
        />
      </div>
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
        renderItem={(invoice, isSelected) => (
          <PracticeInvoiceRow invoice={invoice} isSelected={isSelected} />
        )}
      />
    </>
  );

  // ── Shared AI block (ask bar + answer card) ───────────────────────────
  const aiBlock = (
    <>
      <AIAskBar
        sticky={false}
        placeholder="Find invoices ready to send..."
        suggestions={[
          'Drafts ready to send',
          'Overdue this week',
          'Paid last 30 days',
        ]}
        onSubmit={handleAskSubmit}
      />
      {askAnswer ? (
        <AIAnswerCard
          groundingLabel={`Practice assistant · grounded in invoices · ${invoices.length} rows · just now`}
          lede={
            <>
              <em>{invoices.length}</em> {invoices.length === 1 ? 'invoice' : 'invoices'} match your filters
              {aggregates.outstanding.amount > 0
                ? <> · <em>{formatCurrency(aggregates.outstanding.amount)}</em> outstanding</>
                : null}
            </>
          }
          body={
            <p className="text-sm text-dim-2">
              You asked: <span className="italic text-ink">&ldquo;{askAnswer.query}&rdquo;</span>. Live natural-language invoice search is coming soon &mdash; for now I&apos;ve narrated the filtered set.
            </p>
          }
          actions={[
            {
              id: 'send-all',
              label: 'Send all',
              variant: 'primary',
              // TODO(backend): bulk send endpoint not yet wired.
              onClick: () => showInfo('Send all', 'Bulk send is coming soon.'),
            },
            {
              id: 'mark-paid',
              label: 'Mark paid',
              // TODO(backend): bulk mark-paid endpoint not yet wired.
              onClick: () => showInfo('Mark paid', 'Bulk mark-paid is coming soon.'),
            },
            {
              id: 'export',
              label: 'Export to CSV',
              // TODO(backend): CSV export endpoint not yet wired.
              onClick: () => showInfo('Export', 'Invoice export is coming soon.'),
            },
            {
              id: 'dismiss',
              label: 'Dismiss',
              onClick: () => setAskAnswer(null),
            },
          ]}
          sources={[{ table: 'invoices', count: invoices.length }]}
        />
      ) : null}
    </>
  );

  // ── listOnly: render the list inside the workspace shell's listPanel ──
  if (renderMode === 'listOnly') {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col">
        {listHead}
        {listBody}
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

  // ── Table view (power users): full-width data table with column editor
  if (viewMode === 'table') {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {listHead}
        <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Seg<ViewMode>
              value={viewMode}
              options={VIEW_MODE_OPTIONS}
              onChange={setViewMode}
              ariaLabel="Switch invoice view"
            />
            {onCreateInvoice ? (
              <Button onClick={onCreateInvoice}>New Invoice</Button>
            ) : null}
          </div>
          {aiBlock}
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
        </div>
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

  // ── Cards view (default): SplitDetail — first feature consumer of the
  // SplitDetail primitive (shipped PR #653, previously unused).
  const leftPane = (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      {listHead}
      {listBody}
    </div>
  );

  const rightPane = (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-6 py-4">
        <Seg<ViewMode>
          value={viewMode}
          options={VIEW_MODE_OPTIONS}
          onChange={setViewMode}
          ariaLabel="Switch invoice view"
        />
        {onCreateInvoice ? (
          <Button size="sm" onClick={onCreateInvoice}>New Invoice</Button>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-6">
        {aiBlock}
        {askAnswer ? null : <DetailEmptyState />}
      </div>
    </div>
  );

  return (
    <>
      <SplitDetail
        list={leftPane}
        detail={rightPane}
        ariaLabel="Invoices workspace"
        className="hidden xl:flex"
      />
      {/* Mobile + below-xl: list-only (drill-down to detail on row click) */}
      <div className="flex min-h-0 flex-1 flex-col xl:hidden">
        {leftPane}
      </div>
      <VoidInvoiceConfirmDialog
        isOpen={pendingVoidInvoice !== null}
        invoiceNumber={pendingVoidInvoice?.invoiceNumber}
        loading={isVoidLoading}
        onConfirm={handleVoidConfirm}
        onCancel={() => setPendingVoidInvoice(null)}
      />
    </>
  );
}
