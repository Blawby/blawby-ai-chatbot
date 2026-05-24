import { FunctionComponent, type ComponentChildren } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Inbox } from 'lucide-preact';

import { SegmentedToggle } from '@/shared/ui/input/SegmentedToggle';
import { DataTable, type DataTableColumn, type DataTableRow } from '@/shared/ui/table/DataTable';
import { WorkspacePlaceholderState } from '@/shared/ui/layout/WorkspacePlaceholderState';
import { InfiniteScroll } from '@/shared/ui/layout/InfiniteScroll';
import type { IconComponent } from '@/shared/ui/Icon';
import { cn } from '@/shared/utils/cn';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
import { listIntakes, type IntakeListItem } from '../api/intakesApi';
import { resolveIntakeTitle } from '@/features/intake/utils/intakeTitle';
import { queryCache } from '@/shared/lib/queryCache';
import { policyTtl } from '@/shared/lib/cachePolicy';
import IntakeDetailPage from './IntakeDetailPage';
import IntakeTemplatesPage from './IntakeTemplatesPage';

const InboxIcon: IconComponent = (props) => (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  <Inbox {...(props as any)} />
);

const PAGE_SIZE = 20;

type TriageFilter = 'all' | 'pending_review' | 'accepted' | 'declined';

const TRIAGE_FILTERS: ReadonlyArray<{ id: TriageFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'pending_review', label: 'Pending' },
  { id: 'accepted', label: 'Accepted' },
  { id: 'declined', label: 'Declined' },
];

const normalizeFilter = (value: string | null | undefined): TriageFilter => {
  if (value === 'pending_review' || value === 'accepted' || value === 'declined') return value;
  return 'all';
};

const triageStatusVariant = (status: string | null | undefined): {
  label: string;
  className: string;
} => {
  switch (status) {
    case 'accepted':
      return { label: 'Accepted', className: 'text-success' };
    case 'declined':
    case 'rejected':
      return { label: status === 'rejected' ? 'Rejected' : 'Declined', className: 'text-error' };
    case 'spam':
      return { label: 'Spam', className: 'text-input-placeholder' };
    case 'pending_review':
    default:
      return { label: 'Pending Review', className: 'text-warning' };
  }
};

type IntakesPageProps = {
  practiceId: string | null;
  basePath?: string;
  conversationsBasePath?: string | null;
  engagementsBasePath?: string | null;
  practiceName: string;
  practiceLogo: string | null;
};

export const IntakesPage: FunctionComponent<IntakesPageProps> = ({
  practiceId,
  basePath = '/practice/intakes',
  conversationsBasePath,
  engagementsBasePath,
  practiceName,
  practiceLogo,
}) => {
  const location = useLocation();

  const pathSuffix = location.path.startsWith(basePath) ? location.path.slice(basePath.length) : '';
  const pathSegments = pathSuffix.replace(/^\/+/, '').split('/').filter(Boolean);
  const isResponsesRoute = pathSegments[0] === 'responses';
  const isFormsRoute = pathSegments[0] === 'forms';
  const safeDecode = (value: string | undefined | null): string | null => {
    if (typeof value !== 'string') return null;
    try { return decodeURIComponent(value); } catch { return value; }
  };
  const selectedIntakeId = isResponsesRoute && pathSegments[1] ? safeDecode(pathSegments[1]) : null;
  const selectedTemplateSlug = isFormsRoute && pathSegments[1] && pathSegments[1] !== 'new'
    ? safeDecode(pathSegments[1])
    : isFormsRoute && pathSegments[1] === 'new'
      ? 'new'
      : null;
  const templateRouteMode: 'list' | 'editor' = isFormsRoute && pathSegments.length > 1 ? 'editor' : 'list';

  const [triageFilter, setTriageFilter] = useState<TriageFilter>('all');

  const [items, setItems] = useState<IntakeListItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSeqRef = useRef(0);

  const fetchPage = useCallback(async (targetPage: number, signal: AbortSignal): Promise<void> => {
    if (!practiceId) return;
    const localSeq = ++requestSeqRef.current;
    const triageStatus = triageFilter !== 'all' ? triageFilter : undefined;
    try {
      // Route through queryCache so navigating away and back within the intake
      // TTL serves the cached page instead of re-hitting the backend. Keyed by
      // practice + filter + page; invalidated on triage actions below.
      //
      // The mount abort signal is deliberately not forwarded into the cached
      // fetch — letting the request complete warms the cache for the next
      // visit, and coalesceGet's single-flight must not be tied to a promise
      // an unmount/refetch could abort. The outer `signal.aborted` guards below
      // still prevent state updates after this effect is torn down.
      const cacheKey = `intake:list:${practiceId}:${triageFilter}:p${targetPage}`;
      const result = await queryCache.coalesceGet(
        cacheKey,
        () => listIntakes(
          practiceId,
          { page: targetPage, limit: PAGE_SIZE, triage_status: triageStatus },
        ),
        { ttl: policyTtl(cacheKey), swr: false },
      );
      if (signal.aborted || requestSeqRef.current !== localSeq) return;
      setItems((prev) => (targetPage === 1 ? result.intakes : [...prev, ...result.intakes]));
      setPage(targetPage);
      setHasMore(targetPage < result.total_pages);
      setError(null);
    } catch (err) {
      if (signal.aborted || requestSeqRef.current !== localSeq) return;
      setError(err instanceof Error ? err.message : 'Failed to load intakes');
    }
  }, [practiceId, triageFilter]);

  // Reset & fetch when filter or practice changes.
  useEffect(() => {
    if (!practiceId || !isResponsesRoute) {
      setItems([]);
      setIsLoading(false);
      return;
    }
    const controller = new AbortController();
    const seq = ++requestSeqRef.current;
    setIsLoading(true);
    setItems([]);
    setPage(1);
    setHasMore(false);
    fetchPage(1, controller.signal).finally(() => {
      if (seq === requestSeqRef.current && !controller.signal.aborted) setIsLoading(false);
    });
    return () => controller.abort();
  }, [practiceId, triageFilter, isResponsesRoute, fetchPage]);

  const loadMore = useCallback(() => {
    if (!hasMore || isLoading || isLoadingMore) return;
    const controller = new AbortController();
    setIsLoadingMore(true);
    void fetchPage(page + 1, controller.signal).finally(() => setIsLoadingMore(false));
  }, [hasMore, isLoading, isLoadingMore, fetchPage, page]);

  const handleSelectIntake = useCallback((intake: IntakeListItem) => {
    location.route(`${basePath}/responses/${encodeURIComponent(intake.uuid)}`);
  }, [basePath, location]);

  const handleBack = useCallback(() => {
    location.route(`${basePath}/responses`);
  }, [basePath, location]);

  const handleTriageComplete = useCallback(() => {
    if (!practiceId || !isResponsesRoute) return;
    // A triage decision changes list contents/status — drop the cached pages
    // for this practice so the refetch below pulls fresh data.
    queryCache.invalidate(`intake:list:${practiceId}:`, true);
    // Also drop the triaged intake's status entry (intake:status:<uuid>, written
    // by ClientIntakesView) so a same-session client view of this intake doesn't
    // surface the pre-triage status until the TTL lapses. Cross-session staleness
    // (a different user's browser) isn't reachable from here — caches are in-memory
    // per session — so this only covers same-session/multi-role reads.
    if (selectedIntakeId) queryCache.invalidate(`intake:status:${selectedIntakeId}`);
    const controller = new AbortController();
    setIsLoading(true);
    void fetchPage(1, controller.signal).finally(() => setIsLoading(false));
    handleBack();
  }, [practiceId, isResponsesRoute, selectedIntakeId, fetchPage, handleBack]);

  const handleFilterChange = useCallback((id: TriageFilter) => {
    setTriageFilter(normalizeFilter(id));
  }, []);

  if (isFormsRoute) {
    return (
      <IntakeTemplatesPage
        practiceId={practiceId}
        basePath={`${basePath}/forms`}
        responsesPath={`${basePath}/responses`}
        routeMode={templateRouteMode}
        routeTemplateSlug={selectedTemplateSlug}
        onBack={() => location.route(`${basePath}/forms`)}
      />
    );
  }

  if (!isResponsesRoute) return null;

  if (selectedIntakeId) {
    return (
      <IntakeDetailPage
        practiceId={practiceId}
        intakeId={selectedIntakeId}
        conversationsBasePath={conversationsBasePath}
        engagementsBasePath={engagementsBasePath}
        practiceName={practiceName}
        practiceLogo={practiceLogo}
        onBack={handleBack}
        onTriageComplete={handleTriageComplete}
      />
    );
  }

  const headerCellClass = 'text-xs font-semibold uppercase tracking-wide text-input-placeholder';
  const columns: DataTableColumn[] = [
    {
      id: 'subject',
      label: 'Subject',
      isPrimary: true,
      headerClassName: headerCellClass,
    },
    {
      id: 'contact',
      label: 'Contact',
      hideAt: 'sm',
      headerClassName: headerCellClass,
      mobileClassName: 'text-input-placeholder',
    },
    {
      id: 'status',
      label: 'Status',
      headerClassName: headerCellClass,
    },
    {
      id: 'date',
      label: 'Date',
      align: 'right',
      hideAt: 'sm',
      headerClassName: headerCellClass,
    },
  ];

  const rows: DataTableRow[] = items.map((item) => {
    const triage = triageStatusVariant(item.triage_status);
    const subject = resolveIntakeTitle(item.metadata, item.metadata?.name?.trim() || 'Anonymous Lead');
    const contact = item.metadata?.email?.trim() || item.metadata?.name?.trim() || '—';
    return {
      id: item.uuid,
      onClick: () => handleSelectIntake(item),
      cells: {
        subject: <span className="truncate font-medium text-input-text">{subject}</span>,
        contact: <span className="truncate text-input-placeholder">{contact}</span>,
        status: <span className={cn('font-medium', triage.className)}>{triage.label}</span>,
        date: <span className="tabular-nums text-input-placeholder">{formatRelativeTime(item.created_at)}</span>,
      },
    };
  });

  const showEmpty = !isLoading && !error && items.length === 0 && !hasMore;
  const emptyMessage = triageFilter === 'pending_review'
    ? "You've caught up on all pending reviews! New consultation inquiries will appear here."
    : triageFilter === 'accepted'
      ? 'No accepted responses yet.'
      : triageFilter === 'declined'
        ? 'No declined responses.'
        : 'No leads have come in yet. New consultation inquiries will appear here.';

  return (
    <div className="flex h-full flex-col min-h-0 bg-surface-workspace">
      <div className="border-b border-line-subtle bg-surface-workspace px-4 py-3 md:px-6">
        <SegmentedToggle<TriageFilter>
          value={triageFilter}
          options={TRIAGE_FILTERS.map((filter) => ({ value: filter.id, label: filter.label }))}
          onChange={handleFilterChange}
          ariaLabel="Filter intake responses by status"
          className="w-full sm:w-auto sm:min-w-[24rem]"
        />
      </div>

      {/* List body */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {error ? (
          <div className="p-6 text-sm text-error">{error}</div>
        ) : showEmpty ? (
          <WorkspacePlaceholderState
            icon={InboxIcon}
            title="No responses"
            description={emptyMessage}
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
              {isLoading && rows.length === 0 ? (
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
                  {items.map((item) => (
                    <IntakeMobileCard
                      key={item.uuid}
                      item={item}
                      onClick={() => handleSelectIntake(item)}
                    />
                  ))}
                </InfiniteScroll>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

type IntakeMobileCardProps = {
  item: IntakeListItem;
  onClick: () => void;
};

const IntakeMobileCard: FunctionComponent<IntakeMobileCardProps> = ({ item, onClick }) => {
  const triage = triageStatusVariant(item.triage_status);
  const subject = resolveIntakeTitle(item.metadata, item.metadata?.name?.trim() || 'Anonymous Lead');
  const email = item.metadata?.email?.trim() || '—';

  const rows: ReadonlyArray<{ label: string; value: ComponentChildren }> = [
    { label: 'Subject', value: <span className="font-medium text-input-text break-words">{subject}</span> },
    { label: 'Email', value: <span className="text-input-placeholder break-all">{email}</span> },
    { label: 'Status', value: <span className={cn('font-medium', triage.className)}>{triage.label}</span> },
  ];

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-xl border border-card-border bg-surface-card px-4 py-3 text-left transition-colors hover:bg-surface-card-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
    >
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

export default IntakesPage;
