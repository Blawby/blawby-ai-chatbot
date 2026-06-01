import { useCallback, useMemo, useState } from 'preact/hooks';
import { Inbox } from 'lucide-preact';
import { useNavigation } from '@/shared/utils/navigation';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { listClientInvoices } from '@/features/invoices/services/invoicesService';
import type { InvoiceSummary } from '@/features/invoices/types';
import { ClientInvoiceRow } from '@/features/invoices/components/ClientInvoiceRow';
import { SplitDetail } from '@/design-system/layout';
import { Seg } from '@/design-system/patterns';
import { WorkspacePlaceholderState } from '@/shared/ui/layout/WorkspacePlaceholderState';
import { EntityList } from '@/shared/ui/list/EntityList';
import { usePaginatedList } from '@/shared/hooks/usePaginatedList';
import { formatCurrency } from '@/shared/utils/currencyFormatter';

const PAGE_SIZE = 10;
type ClientInvoiceTabId = 'all' | 'unpaid' | 'paid';
const CLIENT_INVOICE_TAB_STATUS_MAP: Record<ClientInvoiceTabId, string[]> = {
  all: [],
  unpaid: ['open', 'overdue', 'sent', 'pending'],
  paid: ['paid'],
};
const CLIENT_INVOICE_TAB_OPTIONS: ReadonlyArray<{ value: ClientInvoiceTabId; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'paid', label: 'Paid' },
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

const DetailEmptyState = () => (
  <WorkspacePlaceholderState
    icon={Inbox}
    title="Select an invoice"
    description="Pick an invoice from the list to view details and pay."
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
  const [activeTab, setActiveTab] = useState<ClientInvoiceTabId>('all');

  // Parent route may pin a status (e.g. opened from "Pay" CTA); otherwise
  // the in-page Seg drives filtering.
  const effectiveStatusFilter = useMemo(() => {
    if (statusFilter.length > 0) return statusFilter;
    return CLIENT_INVOICE_TAB_STATUS_MAP[activeTab];
  }, [statusFilter, activeTab]);

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

  // ── Aggregate stats from the loaded page (client view is smaller) ─────
  // NOTE(backend): the client invoices endpoint doesn't return aggregates,
  // so we derive from the currently-loaded items. For deeper pages this
  // under-counts; acceptable until a /client/invoices/summary endpoint
  // exists.
  const totalDue = invoices.reduce((sum, inv) => {
    const s = inv.status.toLowerCase();
    return s === 'paid' ? sum : sum + inv.amountDue;
  }, 0);

  // ── List shell head ───────────────────────────────────────────────────
  const listHead = (
    <div className="border-b border-rule px-[22px] pb-[14px] pt-[22px]">
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
        {`Your account · ${invoices.length} ${invoices.length === 1 ? 'invoice' : 'invoices'}`}
      </div>
      <h1 className="mt-1 font-[family-name:var(--serif)] text-[34px] font-normal leading-none tracking-[-0.02em] text-ink">
        Invoices
      </h1>
      {totalDue > 0 ? (
        <div className="mt-3 flex flex-col gap-0.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.04em] text-dim">
            Balance due
          </span>
          <span className="font-[family-name:var(--sans)] text-sm font-medium text-ink">
            {formatCurrency(totalDue)}
          </span>
        </div>
      ) : null}
    </div>
  );

  // ── List body (filters + EntityList of ClientInvoiceRow) ──────────────
  const listBody = (
    <>
      <div className="border-b border-rule bg-paper-2 px-[22px] py-2.5">
        <Seg<ClientInvoiceTabId>
          value={activeTab}
          options={CLIENT_INVOICE_TAB_OPTIONS}
          onChange={setActiveTab}
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
        emptyState={<InvoicesEmptyState hasFilters={hasFilters} />}
        onLoadMore={hasMore ? loadMore : undefined}
        renderItem={(invoice, isSelected) => (
          <ClientInvoiceRow invoice={invoice} isSelected={isSelected} />
        )}
      />
    </>
  );

  // ── listOnly: render the list inside the workspace shell's listPanel ──
  if (renderMode === 'listOnly') {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col">
        {listHead}
        {listBody}
      </div>
    );
  }

  // ── full: SplitDetail with list left + empty-state right ──────────────
  const leftPane = (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      {listHead}
      {listBody}
    </div>
  );

  const rightPane = (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-6">
        <DetailEmptyState />
      </div>
    </div>
  );

  return (
    <>
      <SplitDetail
        list={leftPane}
        detail={rightPane}
        ariaLabel="Invoices"
        className="hidden xl:flex"
      />
      {/* Mobile + below-xl: list-only (drill-down to detail on row click) */}
      <div className="flex min-h-0 flex-1 flex-col xl:hidden">
        {leftPane}
      </div>
    </>
  );
}
