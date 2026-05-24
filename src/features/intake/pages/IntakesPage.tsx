import { FunctionComponent, type ComponentChildren } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Inbox, Search } from 'lucide-preact';

import { Input } from '@/shared/ui/input';
import { Tabs, type TabItem } from '@/shared/ui/tabs/Tabs';
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

const matchesSearch = (item: IntakeListItem, query: string): boolean => {
  if (!query) return true;
  const q = query.toLowerCase();
  const name = (item.metadata?.name || '').toLowerCase();
  const email = (item.metadata?.email || '').toLowerCase();
  const subject = resolveIntakeTitle(item.metadata, '').toLowerCase();
  return name.includes(q) || email.includes(q) || subject.includes(q);
};

type IntakesPageProps = {
  practiceId: string | null;
  basePath?: string;
  conversationsBasePath?: string | null;
  engagementsBasePath?: string | null;
  practiceName: string;
  practiceLogo: string | null;
  activeTriageFilter?: string | null;
};

export const IntakesPage: FunctionComponent<IntakesPageProps> = ({
  practiceId,
  basePath = '/practice/intakes',
  conversationsBasePath,
  engagementsBasePath,
  practiceName,
  practiceLogo,
  activeTriageFilter = 'all',
}) => {
  const location = useLocation();

  const pathSuffix = location.path.startsWith(basePath) ? location.path.slice(basePath.length) : '';
  const pathSegments = pathSuffix.replace(/^\/+/, '').split('/').filter(Boolean);
  const isResponsesRoute = pathSegments[0] === 'responses';
  const safeDecode = (value: string | undefined | null): string | null => {
    if (typeof value !== 'string') return null;
    try { return decodeURIComponent(value); } catch { return value; }
  };
  const selectedIntakeId = isResponsesRoute && pathSegments[1] ? safeDecode(pathSegments[1]) : null;

  // Redirect any non-responses sub-route to /responses (greenfield: legacy
  // /intakes/:slug paths now belong to /settings/intake-forms).
  useEffect(() => {
    if (isResponsesRoute) return;
    location.route(`${basePath}/responses`, true);
    // pathSegments[0] captures the segment we redirect from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basePath, isResponsesRoute, pathSegments[0]]);

  const desktopFilter: TriageFilter = normalizeFilter(activeTriageFilter ?? 'all');
  const [mobileFilter, setMobileFilter] = useState<TriageFilter>(desktopFilter);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Keep mobile tab in sync when desktop sidebar updates the activeTriageFilter prop.
  useEffect(() => {
    setMobileFilter(desktopFilter);
  }, [desktopFilter]);

  // Debounce search input → committed query.
  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(searchInput.trim()), 200);
    return () => clearTimeout(timer);
  }, [searchInput]);

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
    const triageFilter = mobileFilter !== 'all' ? mobileFilter : undefined;
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
      const cacheKey = `intake:list:${practiceId}:${mobileFilter}:p${targetPage}`;
      const result = await queryCache.coalesceGet(
        cacheKey,
        () => listIntakes(
          practiceId,
          { page: targetPage, limit: PAGE_SIZE, triage_status: triageFilter },
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
  }, [practiceId, mobileFilter]);

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
  }, [practiceId, mobileFilter, isResponsesRoute, fetchPage]);

  const loadMore = useCallback(() => {
    if (!hasMore || isLoading || isLoadingMore) return;
    const controller = new AbortController();
    setIsLoadingMore(true);
    void fetchPage(page + 1, controller.signal).finally(() => setIsLoadingMore(false));
  }, [hasMore, isLoading, isLoadingMore, fetchPage, page]);

  const filteredItems = useMemo(
    () => items.filter((item) => matchesSearch(item, searchQuery)),
    [items, searchQuery],
  );

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
    const controller = new AbortController();
    setIsLoading(true);
    void fetchPage(1, controller.signal).finally(() => setIsLoading(false));
    handleBack();
  }, [practiceId, isResponsesRoute, fetchPage, handleBack]);

  const handleMobileFilterChange = useCallback((id: string) => {
    setMobileFilter(normalizeFilter(id));
  }, []);

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

  const rows: DataTableRow[] = filteredItems.map((item) => {
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

  const showEmpty = !isLoading && !error && filteredItems.length === 0 && !hasMore;
  const emptyMessage = searchQuery
    ? `No responses match “${searchQuery}”.`
    : mobileFilter === 'pending_review'
      ? "You've caught up on all pending reviews! New consultation inquiries will appear here."
      : mobileFilter === 'accepted'
        ? 'No accepted responses yet.'
        : mobileFilter === 'declined'
          ? 'No declined responses.'
          : 'No leads have come in yet. New consultation inquiries will appear here.';

  const tabItems: TabItem[] = TRIAGE_FILTERS.map((f) => ({ id: f.id, label: f.label }));

  return (
    <div className="flex h-full flex-col min-h-0 bg-surface-workspace">
      {/* Header (desktop only — mobile hides because the workspace shell already
          renders its own mobile header with the section title). */}
      <header className="hidden md:flex items-center justify-between gap-4 border-b border-line-subtle px-6 py-5">
        <h1 className="text-xl font-semibold text-input-text">All Responses</h1>
        <div className="w-72">
          <Input
            type="search"
            placeholder="Search by name or email"
            value={searchInput}
            onChange={setSearchInput}
            icon={Search}
            iconClassName="h-4 w-4"
          />
        </div>
      </header>

      {/* Mobile filter tabs */}
      <div className="md:hidden border-b border-line-subtle bg-surface-workspace">
        <Tabs
          items={tabItems}
          activeId={mobileFilter}
          onChange={handleMobileFilterChange}
          className="px-2"
        />
      </div>

      {/* Mobile search */}
      <div className="md:hidden px-4 py-3 border-b border-line-subtle">
        <Input
          type="search"
          placeholder="Search responses…"
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
                  {filteredItems.map((item) => (
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
