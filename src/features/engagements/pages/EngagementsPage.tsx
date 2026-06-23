import { FunctionComponent, type ComponentChildren } from 'preact';
import { useCallback, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Briefcase, Plus } from 'lucide-preact';

import { Button } from '@/shared/ui/Button';
import { Seg } from '@/design-system/patterns';
import { WorkspacePlaceholderState } from '@/shared/ui/layout/WorkspacePlaceholderState';
import { InfiniteScroll } from '@/shared/ui/layout/InfiniteScroll';
import { LoadingSpinner } from '@/shared/ui/layout/LoadingSpinner';
import { usePaginatedList } from '@/shared/hooks/usePaginatedList';
import { queryCache } from '@/shared/lib/queryCache';
import { policyTtl } from '@/shared/lib/cachePolicy';
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
      return { label: 'Sent', className: 'bg-card/60 text-dim-2 ring-line-subtle' };
    default:
      return { label: '—', className: 'bg-card/60 text-dim-2 ring-line-subtle' };
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
  throw new Error(`Engagement ${item.id} is missing proposal_data.client_summary.matter_summary`);
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

// ── Mobile card ──────────────────────────────────────────────────────────────

const EngagementMobileCard: FunctionComponent<{
  item: EngagementListItem;
  onClick: () => void;
}> = ({ item, onClick }) => {
  const name = item.client_name;
  if (!name) {
    throw new Error(`Engagement ${item.id} is missing client_name`);
  }
  const matter = getMatterLabel(item);
  const retainer = getRetainerLabel(item.proposal_data?.fees);

  const rows: ReadonlyArray<{ label: string; value: ComponentChildren }> = [
    { label: 'Matter',   value: <span className="text-dim-2 break-words">{matter}</span> },
    { label: 'Retainer', value: <span className="font-medium text-ink tabular-nums">{retainer}</span> },
  ];

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-r-md border border-card-border bg-card px-4 py-3 text-left transition-colors hover:bg-paper-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
    >
      <div className="flex items-start justify-between gap-3 pb-3">
        <span className="font-semibold text-ink break-words">{name}</span>
        <StatusPill status={item.status} />
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
        {rows.map(({ label, value }) => (
          <div key={label} className="contents">
            <dt className="text-xs font-medium uppercase tracking-wide text-dim-2">{label}</dt>
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
};

export const EngagementsPage: FunctionComponent<EngagementsPageProps> = ({
  practiceId,
  basePath = '/practice/engagements',
  conversationsBasePath,
  practiceName,
  practiceLogo,
}) => {
  const location = useLocation();

  const pathSuffix = location.path.startsWith(basePath) ? location.path.slice(basePath.length) : '';
  const pathSegments = pathSuffix.replace(/^\/+/, '').split('/').filter(Boolean);
  const selectedEngagementId = pathSegments[0] ? decodeURIComponent(pathSegments[0]) : null;
  const detailMode: 'view' | 'edit' = pathSegments[1] === 'edit' ? 'edit' : 'view';
  const queryIntakeId = resolveQueryValue(location.query?.intakeId);

  const [activeTab, setActiveTab] = useState<StatusFilter>('all');

  const [refreshCounter, setRefreshCounter] = useState(0);

  const {
    items: engagements,
    isLoading,
    isLoadingMore,
    error,
    hasMore,
    loadMore,
  } = usePaginatedList<EngagementListItem>({
    fetchPage: async (page, _signal) => {
      if (!practiceId) return { items: [], hasMore: false };
      // Cache each page so navigating away and back within the engagement TTL
      // reuses the result instead of re-hitting the backend. Keyed by practice
      // + status filter + page; invalidated on create/action handlers below.
      //
      // Let the cached request finish even if this list unmounts quickly; the
      // result warms the cache for the next visit and avoids a repeat page load.
      const cacheKey = `engagement:list:${practiceId}:${activeTab}:p${page}`;
      const result = await queryCache.coalesceGet(
        cacheKey,
        () => listEngagements(
          practiceId,
          { page, limit: PAGE_SIZE, status: activeTab === 'all' ? undefined : [activeTab] },
        ),
        { ttl: policyTtl(cacheKey), swr: false },
      );
      return { items: result.items, hasMore: result.total > page * PAGE_SIZE };
    },
    deps: [practiceId, activeTab, refreshCounter],
  });

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
    // New engagement isn't in the cached list — drop it so the bumped
    // refreshCounter refetch (deps) pulls fresh data instead of stale cache.
    if (practiceId) queryCache.invalidate(`engagement:list:${practiceId}:`, true);
    setRefreshCounter((c) => c + 1);
    location.route(`${basePath}/${encodeURIComponent(engagementId)}`);
  }, [basePath, location, practiceId]);

  const handleActionComplete = useCallback(() => {
    // An engagement action (send/accept/decline) changes list status — drop
    // the cached pages so the refetch reflects it.
    if (practiceId) queryCache.invalidate(`engagement:list:${practiceId}:`, true);
    setRefreshCounter((c) => c + 1);
    handleBack();
  }, [handleBack, practiceId]);

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

  const showEmpty = !isLoading && !error && engagements.length === 0;
  const emptyTitle = activeTab === 'all'
    ? 'No engagements found'
    : `No ${activeTab} engagements found`;
  const emptyMessage = activeTab === 'all'
    ? 'Create an engagement to draft, send, and track a client engagement letter.'
    : `Create an engagement or switch filters to see ${activeTab} engagement letters.`;

  return (
    <div className="flex h-full flex-col min-h-0 bg-paper">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-subtle px-4 py-3 md:px-6">
        <Seg<StatusFilter>
          value={activeTab}
          options={STATUS_FILTERS.map((filter) => ({ value: filter.id, label: filter.label }))}
          onChange={setActiveTab}
          ariaLabel="Filter engagements by status"
          className="w-full sm:w-auto sm:min-w-[30rem]"
        />
        <Button
          variant="primary"
          onClick={handleOpenCreate}
          disabled={!practiceId}
          icon={Plus}
        >
          New Engagement
        </Button>
      </div>

      {/* List body */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {error ? (
          <div className="p-6 text-sm text-error">{error}</div>
        ) : showEmpty ? (
          <WorkspacePlaceholderState
            icon={Briefcase}
            title={emptyTitle}
            description={emptyMessage}
            primaryAction={{ label: 'Create Engagement', onClick: handleOpenCreate, icon: Plus, disabled: !practiceId }}
            className="p-8"
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block px-6 py-4">
              <div className="panel overflow-hidden">
                {isLoading && engagements.length === 0 ? (
                  <div className="flex justify-center px-4 py-6">
                    <LoadingSpinner size="sm" ariaLabel="Loading engagements" announce={false} />
                  </div>
                ) : (
                  <>
                    {engagements.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelectEngagement(item)}
                        className="flex w-full items-center gap-4 border-b border-line-subtle px-4 py-3 text-left transition-colors hover:bg-paper-2/40"
                      >
                        <span className="min-w-[160px] flex-1 truncate text-sm font-medium text-ink">
                          {item.client_name}
                        </span>
                        <span className="min-w-[160px] flex-1 truncate text-sm text-dim-2">
                          {getMatterLabel(item)}
                        </span>
                        <span className="hidden min-w-[100px] text-sm text-dim-2 md:block">
                          {getBillingLabel(item.proposal_data?.fees)}
                        </span>
                        <span className="min-w-[80px] text-sm">
                          <StatusPill status={item.status} />
                        </span>
                        <span className="hidden min-w-[100px] text-right text-sm tabular-nums text-dim-2 lg:block">
                          {item.sent_at ? formatRelativeTime(item.sent_at) : '-'}
                        </span>
                        <span className="min-w-[100px] text-right text-sm font-medium tabular-nums text-ink">
                          {getRetainerLabel(item.proposal_data?.fees)}
                        </span>
                      </button>
                    ))}
                    {isLoadingMore ? (
                      <div className="flex justify-center px-4 py-3">
                        <LoadingSpinner size="sm" ariaLabel="Loading more engagements" announce={false} />
                      </div>
                    ) : null}
                    {hasMore && !isLoadingMore ? (
                      <div className="border-t border-line-subtle px-4 py-3 text-center">
                        <Button variant="secondary" onClick={loadMore}>Load More</Button>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden">
              {isLoading && engagements.length === 0 ? (
                <div className="flex flex-col gap-3 px-4 py-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={`skeleton-${i}`} className="h-32 rounded-r-md bg-card animate-pulse" />
                  ))}
                </div>
              ) : (
                <InfiniteScroll
                  className="gap-3 px-4 py-3"
                  hasMore={hasMore}
                  loading={isLoadingMore}
                  onLoadMore={loadMore}
                >
                  {engagements.map((item) => (
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
