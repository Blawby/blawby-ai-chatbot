import { FunctionComponent, type ComponentChildren } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Inbox } from 'lucide-preact';

import { Seg } from '@/design-system/patterns';
import { SignalPill, type SignalPillSignal, Pill } from '@/design-system/primitives';
import { EntityList } from '@/shared/ui/list/EntityList';
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
      return { label: 'Spam', className: 'text-dim-2' };
    case 'pending_review':
    default:
      return { label: 'Pending Review', className: 'text-warning' };
  }
};

// ── Row signal helpers ─────────────────────────────────────────────────────
//
// IntakeListItem.case_strength may be either a 0-100 percentage or a 0-5
// rating — normalize to a 0-5 scale for display.
const normalizeCaseStrength = (raw: number | null | undefined): number | null => {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  if (raw <= 0) return 0;
  if (raw <= 5) return Math.round(raw * 10) / 10;
  return Math.round((raw / 20) * 10) / 10;
};

const urgencySignal = (urgency: string | null | undefined): SignalPillSignal | null => {
  if (urgency === 'emergency') return 'urgent';
  if (urgency === 'time_sensitive') return 'warn';
  if (urgency === 'routine') return 'healthy';
  return null;
};

const urgencyShortLabel = (urgency: string | null | undefined): string | null => {
  if (urgency === 'emergency') return 'Urgent';
  if (urgency === 'time_sensitive') return 'Soon';
  if (urgency === 'routine') return 'Routine';
  return null;
};

// IntakeListItem.metadata.customFields._enriched_data is a JSON-string blob
// produced by the AI enrichment pipeline. Pull the practice-area string out
// without re-parsing the entire shape (the detail page does that fully).
const readPracticeAreaFromMetadata = (metadata: IntakeListItem['metadata']): string | null => {
  const cf = (metadata?.customFields ?? metadata?.custom_fields) as Record<string, unknown> | undefined;
  if (!cf || typeof cf !== 'object') return null;
  const raw = cf._enriched_data;
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed?.practice_area === 'string') {
      return parsed.practice_area
        .split(/[_\s]+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    }
  } catch { /* ignore */ }
  return null;
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

  // EntityList requires `T extends { id: string }`; IntakeListItem only has `uuid`,
  // so wrap each row with an `id` alias for selection identity.
  const entityRows = items.map((item) => ({ id: item.uuid, item }));

  const showEmpty = !isLoading && !error && items.length === 0 && !hasMore;
  const emptyMessage = triageFilter === 'pending_review'
    ? "You've caught up on all pending reviews! New consultation inquiries will appear here."
    : triageFilter === 'accepted'
      ? 'No accepted responses yet.'
      : triageFilter === 'declined'
        ? 'No declined responses.'
        : 'No leads have come in yet. New consultation inquiries will appear here.';

  return (
    <div className="flex h-full flex-col min-h-0 bg-paper">
      <div className="border-b border-line-subtle bg-paper px-4 py-3 md:px-6">
        <Seg<TriageFilter>
          value={triageFilter}
          options={TRIAGE_FILTERS.map((filter) => ({ value: filter.id, label: filter.label }))}
          onChange={handleFilterChange}
          ariaLabel="Filter intake responses by status"
          className="w-full sm:w-auto sm:min-w-[24rem]"
        />
      </div>

      {/* List body */}
      <div className="flex-1 min-h-0 flex flex-col">
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
            {/* Desktop list */}
            <div className="hidden md:flex md:flex-1 md:min-h-0 md:flex-col md:px-6 md:py-4">
              <EntityList
                items={entityRows}
                onSelect={({ item }) => handleSelectIntake(item)}
                isLoading={isLoading && items.length === 0}
                isLoadingMore={isLoadingMore}
                onLoadMore={hasMore ? loadMore : undefined}
                className="panel overflow-hidden"
                renderItem={({ item }) => {
                  const triage = triageStatusVariant(item.triage_status);
                  const subject = resolveIntakeTitle(
                    item.metadata,
                    item.metadata?.name?.trim() || 'Anonymous Lead'
                  );
                  const contact = item.metadata?.email?.trim() || item.metadata?.name?.trim() || '—';
                  const strength = normalizeCaseStrength(item.case_strength);
                  const uSignal = urgencySignal(item.urgency);
                  const uLabel = urgencyShortLabel(item.urgency);
                  const practiceArea = readPracticeAreaFromMetadata(item.metadata);
                  return (
                    <div className="flex w-full items-center gap-4 px-4 py-3 hover:bg-paper-2/10">
                      <div className="flex min-w-[160px] flex-1 flex-col gap-1 min-w-0">
                        <span className="truncate text-sm font-medium text-ink">{subject}</span>
                        {(strength != null || uSignal || practiceArea) ? (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {strength != null ? (
                              <Pill tone={strength >= 4 ? 'live' : strength >= 3 ? 'gold' : 'urgent'} dot>
                                <span className="font-mono text-[10px]">case · </span>
                                <span className="font-medium">{strength.toFixed(1)}/5</span>
                              </Pill>
                            ) : null}
                            {uSignal && uLabel ? (
                              <SignalPill signal={uSignal} label={uLabel} />
                            ) : null}
                            {practiceArea ? (
                              <Pill tone="dim">{practiceArea}</Pill>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                      <span className="hidden min-w-[160px] truncate text-sm text-dim-2 sm:block">
                        {contact}
                      </span>
                      <span className={cn('min-w-[120px] text-sm font-medium', triage.className)}>
                        {triage.label}
                      </span>
                      <span className="hidden min-w-[100px] text-right text-sm tabular-nums text-dim-2 sm:block">
                        {formatRelativeTime(item.created_at)}
                      </span>
                    </div>
                  );
                }}
              />
            </div>

            {/* Mobile cards */}
            <div className="flex-1 min-h-0 overflow-y-auto md:hidden">
              {isLoading && items.length === 0 ? (
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
  const strength = normalizeCaseStrength(item.case_strength);
  const uSignal = urgencySignal(item.urgency);
  const uLabel = urgencyShortLabel(item.urgency);
  const practiceArea = readPracticeAreaFromMetadata(item.metadata);
  const hasSignals = strength != null || uSignal !== null || practiceArea !== null;

  const rows: ReadonlyArray<{ label: string; value: ComponentChildren }> = [
    { label: 'Subject', value: <span className="font-medium text-ink break-words">{subject}</span> },
    { label: 'Email', value: <span className="text-dim-2 break-all">{email}</span> },
    { label: 'Status', value: <span className={cn('font-medium', triage.className)}>{triage.label}</span> },
  ];

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-r-md border border-card-border bg-card px-4 py-3 text-left transition-colors hover:bg-paper-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
    >
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
        {rows.map(({ label, value }) => (
          <div key={label} className="contents">
            <dt className="text-xs font-medium uppercase tracking-wide text-dim-2">{label}</dt>
            <dd className="text-right">{value}</dd>
          </div>
        ))}
      </dl>
      {hasSignals ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {strength != null ? (
            <Pill tone={strength >= 4 ? 'live' : strength >= 3 ? 'gold' : 'urgent'} dot>
              <span className="font-mono text-[10px]">case · </span>
              <span className="font-medium">{strength.toFixed(1)}/5</span>
            </Pill>
          ) : null}
          {uSignal && uLabel ? (
            <SignalPill signal={uSignal} label={uLabel} />
          ) : null}
          {practiceArea ? (
            <Pill tone="dim">{practiceArea}</Pill>
          ) : null}
        </div>
      ) : null}
    </button>
  );
};

export default IntakesPage;
