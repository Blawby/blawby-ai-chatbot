import { FunctionComponent, type ComponentChildren } from 'preact';
import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Briefcase, Plus, Search } from 'lucide-preact';

import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/input';
import { Tabs, type TabItem } from '@/shared/ui/tabs/Tabs';
import { DataTable, type DataTableColumn, type DataTableRow } from '@/shared/ui/table/DataTable';
import { WorkspacePlaceholderState } from '@/shared/ui/layout/WorkspacePlaceholderState';
import { InfiniteScroll } from '@/shared/ui/layout/InfiniteScroll';
import { usePaginatedList } from '@/shared/hooks/usePaginatedList';
import { cn } from '@/shared/utils/cn';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';

import { listEngagements } from '../api/engagementsApi';
import type {
  EngagementListItem,
  EngagementStatus,
  ProposalFees,
} from '../types/engagement';
import EngagementDetailPage from './EngagementDetailPage';
import CreateEngagementPage from './CreateEngagementPage';

const PAGE_SIZE = 20;

// ── Filter / status helpers ──────────────────────────────────────────────────

type StatusFilter = 'all' | EngagementStatus;

const STATUS_FILTERS: ReadonlyArray<{ id: StatusFilter; label: string }> = [
  { id: 'all',      label: 'All' },
  { id: 'draft',    label: 'Draft' },
  { id: 'sent',     label: 'Sent' },
  { id: 'accepted', label: 'Accepted' },
  { id: 'declined', label: 'Declined' },
];

const normalizeStatusFilter = (value: string | null | undefined): StatusFilter => {
  if (value === 'draft' || value === 'sent' || value === 'accepted' || value === 'declined') {
    return value;
  }
  return 'all';
};

const resolveQueryValue = (value: string | string[] | null | undefined): string | null => {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
};

type StatusVariant = { label: string; className: string };

const engagementStatusBadge = (status: EngagementStatus | string | undefined): StatusVariant => {
  switch (status) {
    case 'accepted':
      return { label: 'Accepted', className: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300' };
    case 'declined':
      return { label: 'Declined', className: 'bg-rose-500/10 text-rose-700 ring-rose-500/20 dark:text-rose-300' };
    case 'draft':
      return { label: 'Draft', className: 'bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-300' };
    case 'sent':
      return { label: 'Sent', className: 'bg-surface-overlay/60 text-input-placeholder ring-line-subtle' };
    default:
      return { label: '—', className: 'bg-surface-overlay/60 text-input-placeholder ring-line-subtle' };
  }
};

const StatusPill: FunctionComponent<{ status: EngagementStatus | string | undefined }> = ({ status }) => {
  const variant = engagementStatusBadge(status);
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', variant.className)}>
      {variant.label}
    </span>
  );
};

// ── Display helpers ──────────────────────────────────────────────────────────

const getMatterLabel = (item: EngagementListItem): string => {
  const proposalSummary = item.proposal_data?.client_summary?.matter_summary;
  if (proposalSummary && proposalSummary.trim()) return proposalSummary;
  if (item.title && item.title.trim()) return item.title;
  return '—';
};

const getBillingLabel = (fees: ProposalFees | null | undefined): string => {
  if (!fees) return '—';
  const type = (fees.billing_type ?? '').toLowerCase();
  if (type === 'flat' || type === 'fixed' || type === 'flat_fee') return 'Flat fee';
  if (type === 'hourly') return 'Hourly';
  if (type === 'contingency') return 'Contingency';
  if (type === 'retainer') return 'Retainer';
  if (type) return fees.billing_type as string;
  return '—';
};

const getRetainerLabel = (fees: ProposalFees | null | undefined): string => {
  if (!fees) return '$0';
  const amount = fees.retainer_amount;
  if (typeof amount === 'number' && amount > 0) return formatCurrency(amount);
  const fixed = fees.fixed_fee_amount;
  if (typeof fixed === 'number' && fixed > 0) return formatCurrency(fixed);
  return '$0';
};

const matchesSearch = (item: EngagementListItem, query: string): boolean => {
  if (!query) return true;
  const q = query.toLowerCase();
  const name = (item.client_name ?? '').toLowerCase();
  const email = (item.client_email ?? '').toLowerCase();
  const matter = getMatterLabel(item).toLowerCase();
  return name.includes(q) || email.includes(q) || matter.includes(q);
};

// ── Mobile card ──────────────────────────────────────────────────────────────

const EngagementMobileCard: FunctionComponent<{
  item: EngagementListItem;
  onClick: () => void;
}> = ({ item, onClick }) => {
  const name = item.client_name || 'Unknown Client';
  const matter = getMatterLabel(item);
  const retainer = getRetainerLabel(item.proposal_data?.fees);

  const rows: ReadonlyArray<{ label: string; value: ComponentChildren }> = [
    { label: 'Matter',   value: <span className="text-input-placeholder break-words">{matter}</span> },
    { label: 'Retainer', value: <span className="font-medium text-input-text tabular-nums">{retainer}</span> },
  ];

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-xl border border-card-border bg-surface-card px-4 py-3 text-left transition-colors hover:bg-surface-card-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
    >
      <div className="flex items-start justify-between gap-3 pb-3">
        <span className="font-semibold text-input-text break-words">{name}</span>
        <StatusPill status={item.status} />
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
        {rows.map(({ label, value }) => (
          <div key={label} className="contents">
            <dt className="text-xs font-medium uppercase tracking-wide text-input-placeholder">{label}</dt>
            <dd className="text-right">{value}</dd>
          </div>
        ))}
      </dl>
    </button>
  );
};

// ── Main page ────────────────────────────────────────────────────────────────

type EngagementsPageProps = {
  practiceId: string | null;
  basePath?: string;
  conversationsBasePath?: string | null;
  practiceName: string;
  practiceLogo: string | null;
  activeStatusFilter?: string | null;
};

export const EngagementsPage: FunctionComponent<EngagementsPageProps> = ({
  practiceId,
  basePath = '/practice/engagements',
  conversationsBasePath,
  practiceName,
  practiceLogo,
  activeStatusFilter = null,
}) => {
  const location = useLocation();

  const pathSuffix = location.path.startsWith(basePath) ? location.path.slice(basePath.length) : '';
  const pathSegments = pathSuffix.replace(/^\/+/, '').split('/').filter(Boolean);
  const selectedEngagementId = pathSegments[0] ? decodeURIComponent(pathSegments[0]) : null;
  const detailMode: 'view' | 'edit' = pathSegments[1] === 'edit' ? 'edit' : 'view';
  const queryIntakeId = resolveQueryValue(location.query?.intakeId);

  const sidebarTab = normalizeStatusFilter(activeStatusFilter);
  const [activeTab, setActiveTab] = useState<StatusFilter>(sidebarTab);
  useEffect(() => { setActiveTab(sidebarTab); }, [sidebarTab]);

  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(searchInput.trim()), 200);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const [refreshCounter, setRefreshCounter] = useState(0);

  const {
    items: engagements,
    isLoading,
    isLoadingMore,
    error,
    hasMore,
    loadMore,
  } = usePaginatedList<EngagementListItem>({
    fetchPage: async (page, signal) => {
      if (!practiceId) return { items: [], hasMore: false };
      const result = await listEngagements(
        practiceId,
        { page, limit: PAGE_SIZE, status: activeTab === 'all' ? undefined : [activeTab] },
        { signal },
      );
      return { items: result.items, hasMore: result.total > page * PAGE_SIZE };
    },
    deps: [practiceId, activeTab, refreshCounter],
  });

  const filteredEngagements = useMemo(
    () => engagements.filter((item) => matchesSearch(item, searchQuery)),
    [engagements, searchQuery],
  );

  const handleSelectEngagement = useCallback((engagement: EngagementListItem) => {
    location.route(`${basePath}/${encodeURIComponent(engagement.id)}`);
  }, [basePath, location]);

  const handleBack = useCallback(() => {
    location.route(basePath);
  }, [basePath, location]);

  const handleOpenCreate = useCallback(() => {
    location.route(`${basePath}/new`);
  }, [basePath, location]);

  const handleEngagementCreated = useCallback((engagementId: string) => {
    setRefreshCounter((c) => c + 1);
    location.route(`${basePath}/${encodeURIComponent(engagementId)}`);
  }, [basePath, location]);

  const handleActionComplete = useCallback(() => {
    setRefreshCounter((c) => c + 1);
    handleBack();
  }, [handleBack]);

  // ── Route: detail page ───────────────────────────────────────────────────

  if (selectedEngagementId && selectedEngagementId !== 'new') {
    return (
      <EngagementDetailPage
        practiceId={practiceId}
        engagementId={selectedEngagementId}
        conversationsBasePath={conversationsBasePath}
        practiceName={practiceName}
        practiceLogo={practiceLogo}
        onBack={handleBack}
        onActionComplete={handleActionComplete}
        mode={detailMode}
        basePath={basePath}
      />
    );
  }

  // ── Route: create page ───────────────────────────────────────────────────

  if (selectedEngagementId === 'new') {
    return (
      <CreateEngagementPage
        practiceId={practiceId}
        initialIntakeId={queryIntakeId}
        practiceName={practiceName}
        onCreated={handleEngagementCreated}
        onCancel={handleBack}
      />
    );
  }

  // ── Table column + row construction ────────────────────────────────────────

  const headerCellClass = 'text-xs font-semibold uppercase tracking-wide text-input-placeholder';
  const columns: DataTableColumn[] = [
    { id: 'client',   label: 'Client',   isPrimary: true, headerClassName: headerCellClass },
    { id: 'matter',   label: 'Matter',   headerClassName: headerCellClass },
    { id: 'billing',  label: 'Billing',  hideAt: 'md', headerClassName: headerCellClass },
    { id: 'status',   label: 'Status',   headerClassName: headerCellClass },
    { id: 'sent',     label: 'Sent',     hideAt: 'lg', headerClassName: headerCellClass, align: 'right' },
    { id: 'retainer', label: 'Retainer', headerClassName: headerCellClass, align: 'right' },
  ];

  const rows: DataTableRow[] = filteredEngagements.map((item) => ({
    id: item.id,
    onClick: () => handleSelectEngagement(item),
    cells: {
      client:   <span className="truncate font-medium text-input-text">{item.client_name || 'Unknown Client'}</span>,
      matter:   <span className="truncate text-input-placeholder">{getMatterLabel(item)}</span>,
      billing:  <span className="text-input-placeholder">{getBillingLabel(item.proposal_data?.fees)}</span>,
      status:   <StatusPill status={item.status} />,
      sent:     <span className="text-input-placeholder tabular-nums">{item.sent_at ? formatRelativeTime(item.sent_at) : '—'}</span>,
      retainer: <span className="font-medium text-input-text tabular-nums">{getRetainerLabel(item.proposal_data?.fees)}</span>,
    },
  }));

  const tabItems: TabItem[] = STATUS_FILTERS.map((f) => ({ id: f.id, label: f.label }));

  const showEmpty = !isLoading && !error && filteredEngagements.length === 0 && !hasMore;
  const emptyMessage = searchQuery
    ? `No engagements match "${searchQuery}".`
    : activeTab === 'all'
      ? 'When you accept an intake and begin drafting an engagement letter, it will appear here.'
      : `No ${activeTab} engagements yet.`;

  return (
    <div className="flex h-full flex-col min-h-0 bg-surface-workspace">
      {/* Desktop header */}
      <header className="hidden md:flex items-center justify-between gap-4 border-b border-line-subtle px-6 py-5">
        <h1 className="text-xl font-semibold text-input-text">Engagements</h1>
        <div className="flex items-center gap-3">
          <div className="w-72">
            <Input
              type="search"
              placeholder="Search engagements…"
              value={searchInput}
              onChange={setSearchInput}
              icon={Search}
              iconClassName="h-4 w-4"
            />
          </div>
          <Button
            variant="primary"
            onClick={handleOpenCreate}
            disabled={!practiceId}
            icon={Plus}
          >
            New Engagement
          </Button>
        </div>
      </header>

      {/* Tab row */}
      <div className="border-b border-line-subtle bg-surface-workspace">
        <Tabs
          items={tabItems}
          activeId={activeTab}
          onChange={(id) => setActiveTab(normalizeStatusFilter(id))}
          className="px-2 md:px-4"
        />
      </div>

      {/* Mobile search */}
      <div className="md:hidden px-4 py-3 border-b border-line-subtle">
        <Input
          type="search"
          placeholder="Search engagements…"
          value={searchInput}
          onChange={setSearchInput}
          icon={Search}
          iconClassName="h-4 w-4"
        />
      </div>

      {/* List body */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {error ? (
          <div className="p-6 text-sm text-error">{error}</div>
        ) : showEmpty ? (
          <WorkspacePlaceholderState
            icon={Briefcase}
            title={searchQuery ? 'No results' : 'No engagements yet'}
            description={emptyMessage}
            primaryAction={searchQuery ? undefined : { label: 'New Engagement', onClick: handleOpenCreate, icon: Plus, disabled: !practiceId }}
            className="p-8"
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block px-6 py-4">
              <DataTable
                columns={columns}
                rows={rows}
                loading={isLoading && rows.length === 0}
                density="compact"
                stickyHeader
                rowClassName="transition-colors duration-150 hover:!bg-surface-card-hover"
                hasMore={hasMore}
                isLoadingMore={isLoadingMore}
                onLoadMore={loadMore}
              />
            </div>

            {/* Mobile cards */}
            <div className="md:hidden">
              {isLoading && filteredEngagements.length === 0 ? (
                <div className="flex flex-col gap-3 px-4 py-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={`skeleton-${i}`} className="h-32 rounded-xl bg-surface-card animate-pulse" />
                  ))}
                </div>
              ) : (
                <InfiniteScroll
                  className="gap-3 px-4 py-3"
                  hasMore={hasMore}
                  loading={isLoadingMore}
                  onLoadMore={loadMore}
                >
                  {filteredEngagements.map((item) => (
                    <EngagementMobileCard
                      key={item.id}
                      item={item}
                      onClick={() => handleSelectEngagement(item)}
                    />
                  ))}
                </InfiniteScroll>
              )}
            </div>
          </>
        )}

        {/* Mobile create FAB */}
        <div className="md:hidden fixed bottom-6 right-6">
          <Button
            variant="primary"
            onClick={handleOpenCreate}
            disabled={!practiceId}
            icon={Plus}
            className="shadow-lg"
          >
            New
          </Button>
        </div>
      </div>
    </div>
  );
};

export default EngagementsPage;
