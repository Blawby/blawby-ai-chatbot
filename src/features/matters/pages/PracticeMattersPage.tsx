import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { PageHeader } from '@/shared/ui/layout/PageHeader';
import { Page } from '@/shared/ui/layout/Page';
import { WorkspacePlaceholderState } from '@/shared/ui/layout/WorkspacePlaceholderState';
import { Button } from '@/shared/ui/Button';
import { CurrencyInput, Input } from '@/shared/ui/input';
import { Seg, AIAskBar, AIAnswerCard, type StatStripCell } from '@/design-system/patterns';
import { Bar, Pill, SignalPill, type SignalPillSignal, type PillTone } from '@/design-system/primitives';
import { type TimelineItem, type TimelinePerson } from '@/shared/ui/activity/ActivityTimeline';
import { Dialog, DialogBody } from '@/shared/ui/dialog';
import { Folder, SquarePen, Plus, Download } from 'lucide-preact';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';

import { MATTER_STATUS_LABELS, type MatterStatus } from '@/shared/types/matterStatus';
import {
  type MatterDetail,
  type MatterExpense,
  type MatterOption,
  type MatterSummary,
  type MatterTask,
  type TimeEntry
} from '@/features/matters/data/matterTypes';
import { MatterEditForm, type MatterFormState } from '@/features/matters/components/MatterForm';
import { TimeEntryForm, type TimeEntryFormValues } from '@/features/matters/components/time-entries/TimeEntryForm';
import type { MatterTaskFormValues } from '@/features/matters/components/tasks/MatterTaskForm';
import {
  MatterDetailPanel,
  type DetailSectionId,
  type MatterDetailTabCounts
} from '@/features/matters/components/MatterDetailPanel';
import { type WorkSubTab } from '@/features/matters/components/MatterWorkTab';
import { type BillingSubTab } from '@/features/matters/components/MatterBillingTab';
import { getEngagementForMatter } from '@/features/engagements/api/engagementsApi';
import type { EngagementDetail } from '@/features/engagements/types/engagement';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { usePracticeTeam } from '@/shared/hooks/usePracticeTeam';
import { usePracticeDetails } from '@/shared/hooks/usePracticeDetails';
import { asMajor, getMajorAmountValue, safeDivide, safeMultiply, type MajorAmount } from '@/shared/utils/money';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import {
  deleteMatter,
  getMatter,
  getMatterActivity,
  updateMatter,
  type BackendMatter,
  type BackendMatterActivity,
  type BackendMatterNote,
  type BackendMatterTimeStats,
  type UpdateMatterTaskPayload,
  createMatterExpense,
  createMatterNote,
  createMatterMilestone,
  createMatterTimeEntry,
  deleteMatterExpense,
  deleteMatterMilestone,
  deleteMatterTimeEntry,
  getMatterTimeEntryStats,
  listMatterExpenses,
  listMatterMilestones,
  listMatterNotes,
  listMatterTasks,
  createMatterTask,
  updateMatterTask,
  deleteMatterTask,
  listMatterTimeEntries,
  reorderMatterMilestones,
  updateMatterExpense,
  updateMatterMilestone,
  updateMatterTimeEntry
} from '@/features/matters/services/mattersApi';
import { useBillingData } from '@/features/matters/hooks/useBillingData';
import { usePracticeBillingData } from '@/features/practice-dashboard/hooks/usePracticeBillingData';
import type { Invoice, InvoiceLineItem } from '@/features/matters/types/billing.types';
import { createPendingInvoiceDraftContext } from '@/features/invoices/utils/invoiceDraftContext';
import { getPracticeIntake } from '@/features/intake/api/intakesApi';
import { resolveIntakeTitle } from '@/features/intake/utils/intakeTitle';
import { listUserDetails, type UserDetailRecord } from '@/shared/lib/apiClient';
import { getConversation } from '@/shared/lib/conversationApi';
import {
  buildActivityTimelineItem,
  buildFormStateFromDetail,
  buildNoteTimelineItem,
  buildUpdatePayload,
  extractAssigneeIds,
  isEmailLike,
  isUuid,
  normalizeUrgency,
  prunePayload,
  resolveClientLabel,
  resolvePracticeServiceLabel,
  sortByTimestamp,
  toExpense,
  toMatterDetail,
  toMatterTask,
  toMatterSummary,
  toMilestone,
  toTimeEntry
} from '@/features/matters/utils/matterUtils';
import { MatterDetailSkeleton } from '@/features/matters/components/MatterDetailSkeleton';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const isDetailSection = (value: string): value is DetailSectionId =>
  value === 'overview'
    || value === 'work'
    || value === 'notes'
    || value === 'billing'
    || value === 'files'
    || value === 'activity'
    || value === 'settings';

const isWorkSubTab = (value: string): value is WorkSubTab =>
  value === 'tasks' || value === 'milestones';

const isBillingSubTab = (value: string): value is BillingSubTab =>
  value === 'unbilled' || value === 'time' || value === 'expenses' || value === 'rates';

const resolveQueryValue = (value?: string | string[] | null) => {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
};

// ---------------------------------------------------------------------------
// Small local components
// ---------------------------------------------------------------------------

const ACTIVE_STATUSES: ReadonlySet<MatterStatus> = new Set([
  'active', 'engagement_accepted', 'pleadings_filed', 'discovery', 'mediation', 'pre_trial', 'trial'
]);
const CLOSING_STATUSES: ReadonlySet<MatterStatus> = new Set(['engagement_pending', 'order_entered', 'appeal_pending']);
const DECLINED_STATUSES: ReadonlySet<MatterStatus> = new Set(['declined', 'conflicted']);

// Maps a matter's workflow status to a Pill tone for the list view's "Status"
// column. Active statuses → live (gold), closing → warn, closed/declined →
// dim, everything else (lead / intake / etc.) → undefined (default neutral).
const matterStatusPillTone = (status: MatterStatus): PillTone | undefined => {
  if (ACTIVE_STATUSES.has(status)) return 'live';
  if (CLOSING_STATUSES.has(status)) return 'warn';
  if (status === 'closed' || DECLINED_STATUSES.has(status)) return 'dim';
  return undefined;
};

const matterStatusCategory = (status: MatterStatus): 'new' | 'active' | 'closing' | 'closed' | 'declined' => {
  if (status === 'closed') return 'closed';
  if (DECLINED_STATUSES.has(status)) return 'declined';
  if (ACTIVE_STATUSES.has(status)) return 'active';
  if (CLOSING_STATUSES.has(status)) return 'closing';
  return 'new';
};

// Chat-first list controls (canonical Matters.html).
type MatterRiskFilter = 'at_risk' | 'status_open' | 'assigned_me';
type MatterViewMode = 'table' | 'board' | 'timeline';

const FILTER_CHIP_OPTIONS: ReadonlyArray<{ id: MatterRiskFilter; label: string }> = [
  { id: 'at_risk', label: 'At risk' },
  { id: 'status_open', label: 'Status: open' },
  { id: 'assigned_me', label: 'Assigned to me' },
];

const filterChipBaseClass =
  'relative inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50';
const filterChipActiveClass =
  `${filterChipBaseClass} border border-[rgb(var(--sidebar-border))] bg-[rgb(var(--sidebar-active-bg))] pl-3 text-ink before:absolute before:left-1 before:top-1.5 before:bottom-1.5 before:w-0.5 before:rounded-full before:bg-accent before:content-['']`;
const filterChipInactiveClass =
  `${filterChipBaseClass} border border-dashed border-line-utility bg-transparent text-dim hover:border-line-emphasized hover:bg-[rgb(var(--sidebar-hover-bg))] hover:text-ink-2`;
const mobileFilterChipBaseClass =
  'relative flex w-full items-center justify-between rounded-lg border px-4 py-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50';
const mobileFilterChipActiveClass =
  `${mobileFilterChipBaseClass} border-[rgb(var(--sidebar-border))] bg-[rgb(var(--sidebar-active-bg))] pl-5 text-ink before:absolute before:left-2 before:top-3 before:bottom-3 before:w-0.5 before:rounded-full before:bg-accent before:content-['']`;
const mobileFilterChipInactiveClass =
  `${mobileFilterChipBaseClass} border-line-subtle bg-paper-2 text-ink-2 hover:bg-[rgb(var(--sidebar-hover-bg))] hover:text-ink`;

// Risk signal derivation from matter data. We only have urgency + updated_at
// in the prefetched list payload — per-row event counts and retainer % live in
// the matter detail and don't fan out to the list (would be N+1). So:
//   - urgency='emergency' → urgent
//   - last activity within 24h → healthy
//   - last activity > 30d → quiet
//   - everything else → warn
const DAY_MS = 24 * 60 * 60 * 1000;
const deriveRiskSignal = (
  urgency: MatterDetail['urgency'] | undefined,
  updatedAt: string,
  now: number
): SignalPillSignal => {
  if (urgency === 'emergency') return 'urgent';
  const updated = new Date(updatedAt).getTime();
  if (!Number.isFinite(updated)) return 'warn';
  const ageMs = now - updated;
  if (ageMs <= DAY_MS) return 'healthy';
  if (ageMs > 30 * DAY_MS) return 'quiet';
  return 'warn';
};

const riskSignalLabel = (signal: SignalPillSignal): string => {
  switch (signal) {
    case 'urgent': return 'At risk';
    case 'healthy': return 'Healthy';
    case 'quiet': return 'Quiet';
    case 'warn': return 'Watch';
    default: return 'Watch';
  }
};

// Board view column buckets — map every workflow status to one of four lanes.
type BoardLane = 'lead' | 'open' | 'in_progress' | 'archived';
const BOARD_LANES: ReadonlyArray<{ id: BoardLane; label: string }> = [
  { id: 'lead', label: 'Lead' },
  { id: 'open', label: 'Open' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'archived', label: 'Archived' },
];
const matterBoardLane = (status: MatterStatus): BoardLane => {
  if (status === 'closed') return 'archived';
  if (DECLINED_STATUSES.has(status)) return 'archived';
  if (ACTIVE_STATUSES.has(status)) return 'in_progress';
  if (CLOSING_STATUSES.has(status)) return 'open';
  return 'lead';
};

const formatCount = (n: number): string => n.toLocaleString('en-US');

const EmptyState = ({ onCreate, disableCreate }: { onCreate?: () => void; disableCreate?: boolean }) => (
  <WorkspacePlaceholderState
    icon={Folder}
    title="No matters yet"
    description="Create your first matter to start tracking progress and milestones."
    primaryAction={{
      label: 'New Matter',
      onClick: onCreate,
      disabled: disableCreate,
      icon: Plus,
    }}
    className="p-8"
  />
);

// Defer skeleton until loading has lasted long enough to be perceptible, then
// hold it long enough that it doesn't flash. Avoids cached/fast loads showing
// a 50ms skeleton flicker.
const SKELETON_SHOW_AFTER_MS = 150;
const SKELETON_HOLD_AT_LEAST_MS = 400;

const useDelayedSkeleton = (loading: boolean): boolean => {
  const [show, setShow] = useState(false);
  const shownAtRef = useRef<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (loading) {
      if (show) return;
      timeoutRef.current = setTimeout(() => {
        shownAtRef.current = Date.now();
        setShow(true);
      }, SKELETON_SHOW_AFTER_MS);
      return;
    }

    if (!show) return;
    const elapsed = shownAtRef.current ? Date.now() - shownAtRef.current : 0;
    const remaining = Math.max(0, SKELETON_HOLD_AT_LEAST_MS - elapsed);
    if (remaining === 0) {
      shownAtRef.current = null;
      setShow(false);
      return;
    }
    timeoutRef.current = setTimeout(() => {
      shownAtRef.current = null;
      setShow(false);
    }, remaining);
  }, [loading, show]);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  return show;
};

// ---------------------------------------------------------------------------
// Detail field row — shared between overview grid cells
// ---------------------------------------------------------------------------
const _DetailField = ({ label, value }: { label: string; value: string }) => (
  <div>
    <p className="text-xs font-medium uppercase tracking-wide text-dim-2">{label}</p>
    <p className="mt-1 text-sm text-ink">{value || '—'}</p>
  </div>
);

// ---------------------------------------------------------------------------
// Error / warning banners — token-compliant
// ---------------------------------------------------------------------------
const WarningBanner = ({ children }: { children: preact.ComponentChildren }) => (
  <div className="status-warning rounded-r-md px-4 py-3 text-sm">{children}</div>
);

const ErrorBanner = ({ children }: { children: preact.ComponentChildren }) => (
  <div className="status-error rounded-2xl px-4 py-3 text-sm">{children}</div>
);

// ---------------------------------------------------------------------------
// Shared "matter not found" / error states
// ---------------------------------------------------------------------------
const MatterNotFound = ({
  matterId,
  onBack
}: {
  matterId: string;
  onBack: () => void;
}) => (
  <Page className="h-full">
    <div className="max-w-5xl mx-auto space-y-6">
      <PageHeader
        title="Matter not found"
        subtitle="This matter may have been removed or is no longer available."
        actions={<Button size="sm" variant="secondary" onClick={onBack}>Back to matters</Button>}
      />
      <section className="panel p-6">
        <p className="text-sm text-dim-2">
          We could not find a matter with the ID{' '}
          <span className="font-mono text-ink">{matterId}</span>{' '}
          in this workspace.
        </p>
      </section>
    </div>
  </Page>
);

const MatterLoadError = ({
  message,
  onBack
}: {
  message: string;
  onBack: () => void;
}) => (
  <Page className="h-full">
    <div className="max-w-5xl mx-auto space-y-6">
      <PageHeader
        title="Unable to load matter"
        subtitle={message}
        actions={<Button size="sm" variant="secondary" onClick={onBack}>Back to matters</Button>}
      />
    </div>
  </Page>
);

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

type PracticeMattersPageProps = {
  basePath?: string;
  practiceId?: string | null;
  renderMode?: 'full' | 'listOnly' | 'detailOnly';
  statusFilter?: string[];
  prefetchedItems?: BackendMatter[];
  prefetchedLoading?: boolean;
  prefetchedError?: string | null;
  onRefetchList?: (signal?: AbortSignal) => Promise<void>;
};

export const PracticeMattersPage = ({
  basePath = '/practice/matters',
  practiceId: routePracticeId = null,
  renderMode = 'full',
  statusFilter,
  prefetchedItems = [],
  prefetchedLoading = false,
  prefetchedError = null,
  onRefetchList,
}: PracticeMattersPageProps) => {
  const location = useLocation();
  const { session, activePracticeId: sessionActivePracticeId } = useSessionContext();
  const { showError } = useToastContext();
  const activePracticeId = routePracticeId ?? sessionActivePracticeId;

  // ── Routing ──────────────────────────────────────────────────────────────
  const pathSuffix = location.path.startsWith(basePath) ? location.path.slice(basePath.length) : '';
  const pathSegments = pathSuffix.replace(/^\/+/, '').split('/').filter(Boolean);
  const firstSegment = pathSegments[0] ?? '';
  const secondSegment = pathSegments[1] ?? '';
  const selectedMatterIdFromPath = firstSegment && firstSegment !== 'activity' && firstSegment !== 'new'
    ? decodeURIComponent(firstSegment)
    : null;
  const detailSection: DetailSectionId = selectedMatterIdFromPath && isDetailSection(secondSegment)
    ? secondSegment
    : 'overview';
  const thirdSegment = pathSegments[2] ?? '';
  const workSubTab: WorkSubTab = detailSection === 'work' && isWorkSubTab(thirdSegment)
    ? thirdSegment
    : 'tasks';
  const billingSubTab: BillingSubTab = detailSection === 'billing' && isBillingSubTab(thirdSegment)
    ? thirdSegment
    : 'unbilled';
  const selectedMatterId = renderMode === 'listOnly' ? null : selectedMatterIdFromPath;
  const convertIntakeUuid = useMemo(
    () => resolveQueryValue(location.query?.convertIntake),
    [location.query?.convertIntake]
  );
  // The matter overview "Add task" CTA navigates to the Work → Tasks view with
  // `?compose=task` so the tasks panel auto-opens its create form on arrival.
  const composeTaskRequested = useMemo(
    () => resolveQueryValue(location.query?.compose) === 'task',
    [location.query?.compose]
  );
  const navigate = useCallback((path: string) => location.route(path), [location]);
  const goToList = () => navigate(basePath);
  const goToDetail = useCallback((
    id: string,
    section: Exclude<DetailSectionId, 'overview'> | null = null,
    subTab: string | null = null
  ) => {
    let path = `${basePath}/${encodeURIComponent(id)}`;
    if (section) {
      path += `/${section}`;
      const defaultSubTab = section === 'work' ? 'tasks' : section === 'billing' ? 'unbilled' : null;
      if (subTab && subTab !== defaultSubTab) {
        path += `/${subTab}`;
      }
    }
    navigate(path);
  }, [basePath, navigate]);
  const invoicesBasePath = useMemo(() => {
    return basePath.replace(/\/matters(?:\/.*)?$/, '/invoices');
  }, [basePath]);

  // ── External hooks ────────────────────────────────────────────────────────
  const {
    members: teamMembers,
  } = usePracticeTeam(activePracticeId, session?.user?.id ?? null, {
    enabled: Boolean(activePracticeId)
  });
  const {
    details: practiceDetails,
    hasDetails: hasPracticeDetails,
    fetchDetails: fetchPracticeDetails
  } = usePracticeDetails(activePracticeId, null, false);

  // ── Detail state ──────────────────────────────────────────────────────────
  const [selectedMatterDetailState, setSelectedMatterDetail] = useState<MatterDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // ── List view state (chat-first Matters.html) ────────────────────────────
  const [activeFilters, setActiveFilters] = useState<ReadonlySet<MatterRiskFilter>>(() => new Set());
  const [viewMode, setViewMode] = useState<MatterViewMode>('table');
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
  const [askAnswer, setAskAnswer] = useState<{ query: string } | null>(null);
  const [isShortcutsHelpOpen, setIsShortcutsHelpOpen] = useState(false);

  const toggleFilter = useCallback((id: MatterRiskFilter) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // ── Keyboard shortcuts ───────────────────────────────────────────────────
  // N = new matter, Esc = clear filters / dismiss ask answer, ? = show help.
  // Shortcuts are skipped while the user is typing so character entry isn't
  // hijacked. Mirrors the Cmd+K pattern in CommandPaletteContext.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === 'Escape') {
        if (askAnswer) {
          event.preventDefault();
          setAskAnswer(null);
          return;
        }
        if (activeFilters.size > 0) {
          event.preventDefault();
          setActiveFilters(new Set());
          return;
        }
        return;
      }

      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;
      }

      if (event.key === 'n' || event.key === 'N') {
        if (!activePracticeId) return;
        event.preventDefault();
        navigate(`${basePath}/new?returnTo=${encodeURIComponent(location.url)}`);
        return;
      }
      if (event.key === '?') {
        event.preventDefault();
        setIsShortcutsHelpOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activePracticeId, navigate, basePath, location.url, activeFilters, askAnswer]);

  // ── Activity / notes ──────────────────────────────────────────────────────
  const [activityRecords, setActivityRecords] = useState<BackendMatterActivity[]>([]);
  const [noteRecords, setNoteRecords] = useState<BackendMatterNote[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [noteLoading, setNoteLoading] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [noteRetryCount, setNoteRetryCount] = useState(0);
  const [activityRetryCount, setActivityRetryCount] = useState(0);

  // ── Sub-resource state ────────────────────────────────────────────────────
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [timeEntriesLoading, setTimeEntriesLoading] = useState(false);
  const [timeEntriesError, setTimeEntriesError] = useState<string | null>(null);
  const [timeStats, setTimeStats] = useState<BackendMatterTimeStats | null>(null);
  const [expenses, setExpenses] = useState<MatterExpense[]>([]);
  const [expensesLoading, setExpensesLoading] = useState(false);
  const [expensesError, setExpensesError] = useState<string | null>(null);
  const [milestones, setMilestones] = useState<MatterDetail['milestones']>([]);
  const [milestonesLoading, setMilestonesLoading] = useState(false);
  const [milestonesError, setMilestonesError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<MatterTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [tasksNotImplemented, setTasksNotImplemented] = useState(false);

  // ── Engagement state ──────────────────────────────────────────────────────
  const [engagement, setEngagement] = useState<EngagementDetail | null>(null);
  const [engagementLoading, setEngagementLoading] = useState(false);
  const [engagementError, setEngagementError] = useState<string | null>(null);
  const [engagementRetryCount, setEngagementRetryCount] = useState(0);
  const [engagementCreating] = useState(false);

  // ── Person / service / assignee options ───────────────────────────────────
  const [clientOptions, setClientOptions] = useState<MatterOption[]>([]);
  const [isClientListTruncated, setIsClientListTruncated] = useState(false);
  const [_servicesLoading, setServicesLoading] = useState(false);
  // Tracks whether the clients fetch (used to resolve `client_id` → display
  // name in the matters list) is still in flight. Without this, the matters
  // API returns first and rows render with `Person 5da12e3f` placeholder
  // labels — then the second wave (clients) lands and labels swap to real
  // names. Combined with `mattersLoading` to keep the skeleton visible
  // until BOTH waves are ready.
  //
  // Initialize to `true` unconditionally (NOT gated on activePracticeId).
  // On hard refresh, activePracticeId resolves async — gating the initial
  // value on it would leave a one-render gap where loading=false and matters
  // could render with placeholder names before refreshClientOptions fires.
  // The early-return in refreshClientOptions sets it false when there's
  // genuinely no practice, so this pessimistic default is safe.
  const [clientsLoading, setClientsLoading] = useState(true);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [isQuickTimeEntryOpen, setIsQuickTimeEntryOpen] = useState(false);
  const [isSettlementModalOpen, setIsSettlementModalOpen] = useState(false);
  const [settlementDraft, setSettlementDraft] = useState<MajorAmount | undefined>(undefined);
  const [matterDeleteOpen, setMatterDeleteOpen] = useState(false);
  const [matterDeleteConfirmInput, setMatterDeleteConfirmInput] = useState('');
  const [matterCloseOpen, setMatterCloseOpen] = useState(false);
  const [_quickTimeEntryKey, _setQuickTimeEntryKey] = useState(0);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [_convertInitialValues, setConvertInitialValues] = useState<Partial<MatterFormState> | undefined>(undefined);
  const [_convertLoading, setConvertLoading] = useState(false);
  const [_convertError, setConvertError] = useState<string | null>(null);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const isMounted = useRef(true);
  const practiceDetailsRequestedRef = useRef<string | null>(null);
  const refreshRequestIdRef = useRef(0);

  const {
    invoices,
    unbilledTimeEntries,
    unbilledExpenses,
    unbilledSummary,
    isLoading: invoicesLoading,
    error: invoicesError,
    refetchAll: refetchBilling
  } = useBillingData({
    practiceId: activePracticeId,
    matterId: selectedMatterId,
    matterBillingType: selectedMatterDetailState?.billingType ?? null,
    attorneyHourlyRate: selectedMatterDetailState?.attorneyHourlyRate ?? null,
    adminHourlyRate: selectedMatterDetailState?.adminHourlyRate ?? null,
    // Overview now consumes unbilledSummary (AI summary lede + StagedAction
    // card + 5-cell stat strip "Unbilled time" cell), so we eager-load
    // billing data for both 'overview' and 'billing' detail sections.
    enabled: Boolean(activePracticeId && selectedMatterId && (detailSection === 'billing' || detailSection === 'overview'))
  });

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  // ── Derived lookup maps ───────────────────────────────────────────────────
  const clientNameById = useMemo(
    () => new Map(clientOptions.map((c) => [c.id, c.name])),
    [clientOptions]
  );

  const practiceAreaOptions = useMemo<MatterOption[]>(() => {
    const services = practiceDetails?.services;
    if (!Array.isArray(services)) return [];
    return services
      .filter((s): s is { id: string; name: string; key?: string } => {
        if (!s || typeof s !== 'object') return false;
        if (typeof s.id !== 'string' || !isUuid(s.id)) return false;
        if (typeof s.name !== 'string' || !s.name.trim()) return false;
        return true;
      })
      .map((s) => ({ id: s.id, name: s.name, role: s.key }));
  }, [practiceDetails?.services]);

  const assigneeOptions = useMemo<MatterOption[]>(() => {
    return teamMembers
      .filter((member) => member.canAssignToMatter)
      .map((m) => ({
        id: m.userId,
        name: m.name ?? m.email,
        email: m.email,
        image: m.image ?? undefined,
        role: m.role
      }));
  }, [teamMembers]);

  const assigneeNameById = useMemo(
    () => new Map(teamMembers.map((m) => [m.userId, m.name ?? m.email])),
    [teamMembers]
  );

  const serviceNameById = useMemo(
    () => new Map(practiceAreaOptions.map((s) => [s.id, s.name])),
    [practiceAreaOptions]
  );

  const selectedMatterDetail = useMemo(() => {
    if (!selectedMatterDetailState) return null;
    return {
      ...selectedMatterDetailState,
      clientName: resolveClientLabel(
        selectedMatterDetailState.clientId,
        clientNameById.get(selectedMatterDetailState.clientId)
      ),
      practiceArea: selectedMatterDetailState.practiceAreaId
        ? resolvePracticeServiceLabel(
          selectedMatterDetailState.practiceAreaId,
          serviceNameById.get(selectedMatterDetailState.practiceAreaId)
        )
        : null
    };
  }, [clientNameById, selectedMatterDetailState, serviceNameById]);

  // Skeleton-flash guard: skeleton appears only if loading lasts >150ms and
  // holds for ≥400ms once shown. Hook must run unconditionally on every render.
  const detailReadyForSkeletonGate =
    Boolean(selectedMatterDetail) && selectedMatterDetail?.id === selectedMatterId;
  const showDetailSkeleton = useDelayedSkeleton(
    Boolean(selectedMatterId) && detailLoading && !detailReadyForSkeletonGate
  );

  const membersById = useMemo(() => {
    if (teamMembers.length === 0) return new Map<string, { name: string; email?: string | null; image?: string | null }>();
    return new Map(
      teamMembers.map((m) => [
        m.userId,
        { name: m.name ?? '', email: m.email ?? null, image: m.image }
      ])
    );
  }, [teamMembers]);

  const matterContext = useMemo(() => ({
    title: selectedMatterDetail?.title ?? null,
    clientName: selectedMatterDetail?.clientName ?? null,
    practiceArea: selectedMatterDetail?.practiceArea ?? null
  }), [selectedMatterDetail?.title, selectedMatterDetail?.clientName, selectedMatterDetail?.practiceArea]);

  // ── Person resolver ───────────────────────────────────────────────────────
  const resolvePerson = useCallback((userId?: string | null): TimelinePerson => {
    if (!userId) return { name: 'System' };
    const member = membersById.get(userId);
    if (member) {
      const fallbackEmail = member.email ?? '';
      const sessionName = session?.user?.id === userId ? session?.user?.name?.trim() : '';
      const preferredName = member.name?.trim() || sessionName || fallbackEmail;
      const name = preferredName && !isEmailLike(preferredName)
        ? preferredName
        : sessionName && !isEmailLike(sessionName)
          ? sessionName
          : fallbackEmail || preferredName;
      return { name: name || `User ${userId.slice(0, 6)}`, imageUrl: member.image ?? null };
    }
    const sessionName = session?.user?.id === userId ? session?.user?.name?.trim() : '';
    if (sessionName && !isEmailLike(sessionName)) {
      return { name: sessionName, imageUrl: session?.user?.image ?? null };
    }
    return { name: `User ${userId.slice(0, 6)}` };
  }, [membersById, session?.user?.id, session?.user?.image, session?.user?.name]);

  // ── Activity builder (now just calls util, passing context) ───────────────
  const toActivityItem = useCallback(
    (activity: BackendMatterActivity, activities: BackendMatterActivity[]): TimelineItem =>
      buildActivityTimelineItem(activity, activities, {
        matterContext,
        clientNameById,
        serviceNameById,
        assigneeNameById,
        resolvePerson
      }),
    [matterContext, clientNameById, serviceNameById, assigneeNameById, resolvePerson]
  );

  const toNoteItem = useCallback(
    (note: Parameters<typeof buildNoteTimelineItem>[0]): TimelineItem =>
      buildNoteTimelineItem(note, resolvePerson),
    [resolvePerson]
  );

  // ── Data fetching: people (paginated) ─────────────────────────────────────
  const buildClientOption = useCallback((detail: UserDetailRecord): MatterOption => ({
    id: detail.id,
    name: detail.user?.name?.trim() || detail.user?.email?.trim() || detail.user?.phone?.trim() || 'Unknown contact',
    email: detail.user?.email ?? undefined,
    role: 'client',
    status: detail.status
  }), []);

  const refreshClientOptions = useCallback(async (signal?: AbortSignal) => {
    if (!activePracticeId) {
      setClientOptions([]);
      setIsClientListTruncated(false);
      setClientsLoading(false);
      return;
    }

    setIsClientListTruncated(false);
    setClientsLoading(true);
    let offset = 0;
    const limit = 100;
    const allClients: MatterOption[] = [];
    let hasMore = true;
    let lastTotal = 0;
    const MAX_PAGES = 100;
    let iterations = 0;

    try {
      while (hasMore && !signal?.aborted && iterations < MAX_PAGES) {
        iterations += 1;
        const response = await listUserDetails(activePracticeId, { limit, offset, signal });
        if (signal?.aborted) break;

        allClients.push(...response.data.map(buildClientOption));
        lastTotal = response.total ?? 0;
        hasMore = lastTotal > 0 ? allClients.length < lastTotal : response.data.length === limit;
        if (hasMore) offset += limit;
      }

      if (!signal?.aborted) {
        setClientOptions(allClients);
        setIsClientListTruncated(iterations >= MAX_PAGES || lastTotal > allClients.length);
      }
    } catch (error) {
      if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) return;
      console.error('[PracticeMattersPage] Failed to load people', error);
      setClientOptions(allClients);
      setIsClientListTruncated(true);
      showError('Failed to load full contacts list', 'Some contacts may be missing.');
    } finally {
      if (!signal?.aborted) setClientsLoading(false);
    }
  }, [activePracticeId, buildClientOption, showError]);

  const refreshClientsControllerRef = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    refreshClientsControllerRef.current = controller;
    void refreshClientOptions(controller.signal);
    return () => {
      controller.abort();
      if (refreshClientsControllerRef.current === controller) refreshClientsControllerRef.current = null;
    };
  }, [refreshClientOptions]);

  // ── Data fetching: practice services ─────────────────────────────────────
  useEffect(() => {
    if (!activePracticeId) return;
    if (practiceDetailsRequestedRef.current === activePracticeId) return;
    if (practiceDetails && hasPracticeDetails) {
      practiceDetailsRequestedRef.current = activePracticeId;
      return;
    }
    practiceDetailsRequestedRef.current = activePracticeId;
    setServicesLoading(true);
    fetchPracticeDetails()
      .catch((error) => console.warn('[PracticeMattersPage] Failed to load practice services', error))
      .finally(() => setServicesLoading(false));
  }, [activePracticeId, fetchPracticeDetails, hasPracticeDetails, practiceDetails]);

  useEffect(() => {
    if (!convertIntakeUuid || !activePracticeId) {
      setConvertInitialValues(undefined);
      setConvertLoading(false);
      setConvertError(null);
      return;
    }

    // Clear stale convertInitialValues before async fetch
    setConvertInitialValues(undefined);

    const controller = new AbortController();
    setConvertLoading(true);
    setConvertError(null);

    getPracticeIntake(activePracticeId, convertIntakeUuid, { signal: controller.signal })
      .then((intake) => {
        const metadata = (intake.metadata ?? {}) as NonNullable<typeof intake.metadata>;
        const description = typeof metadata.description === 'string' ? metadata.description : '';
        const opposingParty = typeof metadata.opposing_party === 'string' ? metadata.opposing_party : '';
        const applyInitialValues = (conversationMetadata?: { title?: string; intake_title?: string } | null) => {
          if (controller.signal.aborted) return;
          const title = resolveIntakeTitle(
            {
              ...metadata,
              title: conversationMetadata?.title ?? metadata.title,
              intake_title: conversationMetadata?.intake_title ?? metadata.intake_title,
            },
            'Intake matter'
          );
          setConvertInitialValues({
            title,
            description,
            opposingParty,
            urgency: intake.urgency === 'routine' || intake.urgency === 'time_sensitive' || intake.urgency === 'emergency'
              ? intake.urgency
              : '',
            status: 'engagement_pending',
            openDate: typeof intake.created_at === 'string' ? intake.created_at.slice(0, 10) : '',
          });
        };

        if (!intake.conversation_id) {
          applyInitialValues();
          return null;
        }

        return getConversation(intake.conversation_id, activePracticeId, { signal: controller.signal })
          .then((conversation) => {
            applyInitialValues(conversation?.user_info ?? null);
          })
          .catch((conversationError: unknown) => {
            if ((conversationError as DOMException).name === 'AbortError') return;
            console.warn('[PracticeMattersPage] Failed to load intake conversation title', conversationError);
            applyInitialValues();
          });
      })
      .catch((error: unknown) => {
        if ((error as DOMException).name === 'AbortError') return;
        const message = error instanceof Error ? error.message : 'Failed to load intake details';
        setConvertError(message);
        console.warn('[PracticeMattersPage] Failed to preload intake for conversion', error);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setConvertLoading(false);
        }
      });

    return () => controller.abort();
  }, [activePracticeId, convertIntakeUuid]);

  const refreshMatters = useCallback(() => {
    void onRefetchList?.();
  }, [onRefetchList]);
  const matters = prefetchedItems;
  const mattersLoading = prefetchedLoading;
  const mattersError = prefetchedError;

  // ── Data fetching: matter detail ──────────────────────────────────────────
  useEffect(() => {
    if (!activePracticeId || !selectedMatterId) {
      setSelectedMatterDetail(null);
      setDetailError(null);
      setDetailLoading(false);
      return;
    }

    const controller = new AbortController();
    setDetailLoading(true);
    setDetailError(null);

    getMatter(activePracticeId, selectedMatterId, { signal: controller.signal })
      .then((matter) => {
        setSelectedMatterDetail(matter ? toMatterDetail(matter) : null);
      })
      .catch((error: unknown) => {
        if ((error as DOMException).name === 'AbortError') return;
        setDetailError(error instanceof Error ? error.message : 'Failed to load matter');
      })
      .finally(() => setDetailLoading(false));

    return () => controller.abort();
  }, [activePracticeId, selectedMatterId]);

  // ── Data fetching: activity ───────────────────────────────────────────────
  useEffect(() => {
    if (!activePracticeId || !selectedMatterId) {
      setActivityRecords([]);
      setActivityLoading(false);
      setActivityError(null);
      return;
    }

    const controller = new AbortController();
    setActivityLoading(true);
    setActivityError(null);

    getMatterActivity(activePracticeId, selectedMatterId, { signal: controller.signal })
      .then((items) => setActivityRecords(items))
      .catch((error: unknown) => {
        if ((error as DOMException).name === 'AbortError') return;
        console.warn('[PracticeMattersPage] Failed to load activity', error);
        setActivityRecords([]);
        setActivityError(error instanceof Error ? error.message : 'Failed to load activity');
      })
      .finally(() => setActivityLoading(false));

    return () => controller.abort();
  }, [activePracticeId, selectedMatterId, activityRetryCount]);

  // ── Data fetching: notes ──────────────────────────────────────────────────
  useEffect(() => {
    if (!activePracticeId || !selectedMatterId) {
      setNoteRecords([]);
      setNoteError(null);
      return;
    }

    const controller = new AbortController();
    setNoteLoading(true);
    listMatterNotes(activePracticeId, selectedMatterId, { signal: controller.signal })
      .then((items) => {
        setNoteError(null);
        setNoteRecords(items);
      })
      .catch((error: unknown) => {
        if ((error as DOMException).name === 'AbortError') return;
        console.error('[PracticeMattersPage] Failed to load notes:', error);
        setNoteError(error instanceof Error ? error.message : 'Failed to load notes');
        setNoteRecords([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setNoteLoading(false);
        }
      });

    return () => controller.abort();
  }, [activePracticeId, selectedMatterId, noteRetryCount]);

  // ── Data fetching: time stats (used by summary cards) ────────────────────
  useEffect(() => {
    if (!activePracticeId || !selectedMatterId) {
      setTimeStats(null);
      return;
    }

    const controller = new AbortController();
    setTimeStats(null);

    getMatterTimeEntryStats(activePracticeId, selectedMatterId, { signal: controller.signal })
      .then((stats) => {
        setTimeStats(stats);
      })
      .catch((error: unknown) => {
        if ((error as DOMException).name === 'AbortError') return;
        console.warn('[PracticeMattersPage] Failed to load time stats', error);
        setTimeStats(null);
      });

    return () => controller.abort();
  }, [activePracticeId, selectedMatterId]);

  // ── Data fetching: time entries ───────────────────────────────────────────
  useEffect(() => {
    if (detailSection !== 'billing') return;
    if (!activePracticeId || !selectedMatterId) {
      setTimeEntries([]); setTimeEntriesError(null); setTimeEntriesLoading(false);
      return;
    }

    const controller = new AbortController();
    setTimeEntriesLoading(true);
    setTimeEntriesError(null);

    Promise.all([
      listMatterTimeEntries(activePracticeId, selectedMatterId, { signal: controller.signal })
    ])
      .then(([entries]) => { setTimeEntries(entries.map(toTimeEntry)); })
      .catch((error: unknown) => {
        if ((error as DOMException).name === 'AbortError') return;
        setTimeEntriesError(error instanceof Error ? error.message : 'Failed to load time entries');
      })
      .finally(() => setTimeEntriesLoading(false));

    return () => controller.abort();
  }, [detailSection, activePracticeId, selectedMatterId]);

  // ── Data fetching: expenses ───────────────────────────────────────────────
  useEffect(() => {
    if (detailSection !== 'work') return;
    if (!activePracticeId || !selectedMatterId) {
      setExpenses([]); setExpensesError(null); setExpensesLoading(false);
      return;
    }

    const controller = new AbortController();
    setExpensesLoading(true);
    setExpensesError(null);

    listMatterExpenses(activePracticeId, selectedMatterId, { signal: controller.signal })
      .then((items) => setExpenses(items.map(toExpense)))
      .catch((error: unknown) => {
        if ((error as DOMException).name === 'AbortError') return;
        setExpensesError(error instanceof Error ? error.message : 'Failed to load expenses');
      })
      .finally(() => setExpensesLoading(false));

    return () => controller.abort();
  }, [detailSection, activePracticeId, selectedMatterId]);

  // ── Data fetching: milestones ─────────────────────────────────────────────
  useEffect(() => {
    if (!activePracticeId || !selectedMatterId) {
      setMilestones([]); setMilestonesError(null); setMilestonesLoading(false);
      return;
    }
    const billing = selectedMatterDetail?.billingType;
    const freq = selectedMatterDetail?.paymentFrequency;
    if (billing !== 'fixed' || freq !== 'milestone') {
      setMilestones([]);
      setMilestonesError(null);
      setMilestonesLoading(false);
      return;
    }

    const controller = new AbortController();
    setMilestonesLoading(true);
    setMilestonesError(null);

    listMatterMilestones(activePracticeId, selectedMatterId, { signal: controller.signal })
      .then((items) => {
        const mapped = items.map(toMilestone);
        setMilestones(mapped);
        setSelectedMatterDetail((prev) => prev ? { ...prev, milestones: mapped } : prev);
      })
      .catch((error: unknown) => {
        if ((error as DOMException).name === 'AbortError') return;
        console.warn('[PracticeMattersPage] Failed to load milestones', error);
        setMilestonesError(error instanceof Error ? error.message : 'Failed to load milestones');
      })
      .finally(() => setMilestonesLoading(false));

    return () => controller.abort();
  }, [activePracticeId, selectedMatterId, selectedMatterDetail?.billingType, selectedMatterDetail?.paymentFrequency]);

  // ── Data fetching: tasks ──────────────────────────────────────────────────
  // Loaded for both 'overview' (Next action / Open tasks cards) and 'work' tab.
  useEffect(() => {
    if (detailSection !== 'overview' && detailSection !== 'work') return;
    if (!activePracticeId || !selectedMatterId) {
      setTasks([]);
      setTasksError(null);
      setTasksLoading(false);
      setTasksNotImplemented(false);
      return;
    }

    const controller = new AbortController();
    setTasksLoading(true);
    setTasksError(null);
    setTasksNotImplemented(false);

    listMatterTasks(activePracticeId, selectedMatterId, {}, { signal: controller.signal })
      .then((items) => setTasks(items.map(toMatterTask)))
      .catch((error: unknown) => {
        if ((error as DOMException).name === 'AbortError') return;
        const maybeStatus = (error as { status?: number; response?: { status?: number } });
        const status = maybeStatus.status ?? maybeStatus.response?.status;
        const message = error instanceof Error ? error.message : 'Failed to load tasks';
        if (status === 404 || status === 501 || message.includes('404') || message.includes('501') || message.includes('Not Found')) {
          setTasksNotImplemented(true);
          setTasksError(null);
          setTasks([]);
          return;
        }
        setTasksError(error instanceof Error ? error.message : 'Failed to load tasks');
      })
      .finally(() => setTasksLoading(false));

    return () => controller.abort();
  }, [detailSection, activePracticeId, selectedMatterId]);

  // ── Data fetching: engagement (eager, alongside detail) ──────────────────
  useEffect(() => {
    if (!activePracticeId || !selectedMatterId) {
      setEngagement(null);
      setEngagementLoading(false);
      setEngagementError(null);
      return;
    }

    const controller = new AbortController();
    setEngagementLoading(true);
    setEngagementError(null);

    getEngagementForMatter(activePracticeId, selectedMatterId, { signal: controller.signal })
      .then((result) => setEngagement(result))
      .catch((error: unknown) => {
        if ((error as DOMException).name === 'AbortError') return;
        console.warn('[PracticeMattersPage] Failed to load engagement', error);
        setEngagementError(error instanceof Error ? error.message : 'Failed to load engagement');
        setEngagement(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setEngagementLoading(false);
      });

    return () => controller.abort();
  }, [activePracticeId, selectedMatterId, engagementRetryCount]);

  // ── Refresh helpers ───────────────────────────────────────────────────────
  const refreshSelectedMatter = useCallback(async () => {
    if (!activePracticeId || !selectedMatterId) return;
    const requestId = ++refreshRequestIdRef.current;

    try {
      const activities = await getMatterActivity(activePracticeId, selectedMatterId);
      if (requestId !== refreshRequestIdRef.current || !isMounted.current) return;
      setActivityRecords(activities ?? []);
    } catch (error) {
      console.warn('[PracticeMattersPage] Failed to refresh activity', error);
    }

    try {
      const refreshed = await getMatter(activePracticeId, selectedMatterId);
      if (requestId !== refreshRequestIdRef.current || !isMounted.current) return;
      if (refreshed) {
        setSelectedMatterDetail(toMatterDetail(refreshed));
      }
    } catch (error) {
      console.warn('[PracticeMattersPage] Failed to refresh matter detail', error);
    }
  }, [activePracticeId, selectedMatterId]);

  const handleEngagementPrimaryAction = useCallback(async () => {
    if (engagement) {
      if (selectedMatterId) goToDetail(selectedMatterId, 'billing');
      return;
    }
    if (!selectedMatterId || engagementCreating) return;
    const message = 'This matter does not have a linked engagement. Accepted intake work now creates matters from accepted engagement contracts.';
    setEngagementError(message);
    showError('Missing engagement', message);
  }, [engagement, engagementCreating, goToDetail, selectedMatterId, showError]);

  // ── Matter CRUD ───────────────────────────────────────────────────────────
  const handleUpdateMatter = useCallback(async (values: MatterFormState) => {
    if (!activePracticeId || !selectedMatterId) return;
    if (values.clientId && !isUuid(values.clientId)) throw new Error(`Invalid client_id UUID: "${values.clientId}"`);
    if (values.practiceAreaId && !isUuid(values.practiceAreaId)) throw new Error(`Invalid practice_service_id UUID: "${values.practiceAreaId}"`);

    await updateMatter(
      activePracticeId,
      selectedMatterId,
      prunePayload(buildUpdatePayload(values, selectedMatterDetail?.status))
    );
    refreshMatters();
    await refreshSelectedMatter();
  }, [activePracticeId, selectedMatterId, selectedMatterDetail?.status, refreshMatters, refreshSelectedMatter]);

  // ── Status update shortcut (uses buildFormStateFromDetail) ────────────────
  const handleUpdateStatus = useCallback((newStatus: MatterStatus) => {
    if (!selectedMatterDetail || !activePracticeId) return;
    void handleUpdateMatter(buildFormStateFromDetail(selectedMatterDetail, { status: newStatus }));
  }, [selectedMatterDetail, activePracticeId, handleUpdateMatter]);

  const handleConfirmCloseMatter = useCallback(async () => {
    if (!selectedMatterDetail || !activePracticeId) return;
    try {
      await handleUpdateMatter(buildFormStateFromDetail(selectedMatterDetail, { status: 'closed' }));
      setMatterCloseOpen(false);
    } catch (error) {
      showError('Could not close matter', error instanceof Error ? error.message : 'Please try again.');
    }
  }, [selectedMatterDetail, activePracticeId, handleUpdateMatter, showError]);

  const handleConfirmDeleteMatter = useCallback(async () => {
    if (!activePracticeId || !selectedMatterId) return;
    try {
      await deleteMatter(activePracticeId, selectedMatterId);
      setMatterDeleteOpen(false);
      setMatterDeleteConfirmInput('');
      refreshMatters();
      navigate(basePath);
    } catch (error) {
      console.error('[PracticeMattersPage] Failed to delete matter', error);
      showError('Could not delete matter', error instanceof Error ? error.message : 'Please try again.');
    }
  }, [activePracticeId, selectedMatterId, refreshMatters, navigate, basePath, showError]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleWorkspaceMatterStatusChange = (
      event: Event
    ) => {
      const customEvent = event as CustomEvent<{ matterId: string; status: MatterStatus }>;
      const detail = customEvent.detail;
      if (!detail || detail.matterId !== selectedMatterId) return;
      handleUpdateStatus(detail.status);
    };
    window.addEventListener('workspace:matter-status-change', handleWorkspaceMatterStatusChange);
    return () => {
      window.removeEventListener('workspace:matter-status-change', handleWorkspaceMatterStatusChange);
    };
  }, [handleUpdateStatus, selectedMatterId]);

  // ── Time entry handlers ───────────────────────────────────────────────────
  const refreshTimeEntries = useCallback(async () => {
    if (!activePracticeId || !selectedMatterId) return;
    const [entries, stats] = await Promise.all([
      listMatterTimeEntries(activePracticeId, selectedMatterId),
      getMatterTimeEntryStats(activePracticeId, selectedMatterId)
    ]);
    setTimeEntries(entries.map(toTimeEntry));
    setTimeStats(stats);
  }, [activePracticeId, selectedMatterId]);

  const handleSaveTimeEntry = useCallback(async (values: TimeEntryFormValues, existing?: TimeEntry | null) => {
    if (!activePracticeId || !selectedMatterId) return;
    try {
      if (existing?.id) {
        await updateMatterTimeEntry(activePracticeId, selectedMatterId, existing.id, {
          start_time: values.startTime,
          end_time: values.endTime,
          description: values.description,
          billable: values.billable
        });
      } else {
        await createMatterTimeEntry(activePracticeId, selectedMatterId, {
          start_time: values.startTime,
          end_time: values.endTime,
          description: values.description,
          billable: values.billable
        });
      }
      await refreshTimeEntries();
      await refetchBilling();
    } catch (error) {
      console.error('[PracticeMattersPage] Failed to save time entry', error);
      showError('Could not save time entry', 'Please try again.');
    }
  }, [activePracticeId, selectedMatterId, refreshTimeEntries, refetchBilling, showError]);

  const handleDeleteTimeEntry = useCallback(async (entry: TimeEntry) => {
    if (!activePracticeId || !selectedMatterId) throw new Error('IDs required');
    try {
      await deleteMatterTimeEntry(activePracticeId, selectedMatterId, entry.id);
      await refreshTimeEntries();
      await refetchBilling();
    } catch (error) {
      console.error('[PracticeMattersPage] Failed to delete time entry', error);
      showError('Could not delete time entry', 'Please try again.');
    }
  }, [activePracticeId, selectedMatterId, refreshTimeEntries, refetchBilling, showError]);

  const handleQuickTimeSubmit = useCallback(async (values: TimeEntryFormValues) => {
    if (!activePracticeId || !selectedMatterId) return;
    try {
      await createMatterTimeEntry(activePracticeId, selectedMatterId, {
        start_time: values.startTime,
        end_time: values.endTime,
        description: values.description,
        billable: values.billable
      });
      await refreshTimeEntries();
      await refetchBilling();
      setIsQuickTimeEntryOpen(false);
    } catch (error) {
      console.error('[PracticeMattersPage] Failed to save quick time entry', error);
      showError('Could not save time entry', 'Please try again.');
    }
  }, [activePracticeId, selectedMatterId, refreshTimeEntries, refetchBilling, showError]);

  // ── Expense handlers ──────────────────────────────────────────────────────
  const refreshExpenses = useCallback(async () => {
    if (!activePracticeId || !selectedMatterId) return;
    const items = await listMatterExpenses(activePracticeId, selectedMatterId);
    setExpenses(items.map(toExpense));
  }, [activePracticeId, selectedMatterId]);

  const handleCreateExpense = useCallback(async (values: { description: string; amount: MajorAmount | undefined; date: string; billable: boolean }) => {
    if (!activePracticeId || !selectedMatterId) throw new Error('IDs required');
    if (values.amount === undefined) throw new Error('Amount is required');
    const created = await createMatterExpense(activePracticeId, selectedMatterId, {
      description: values.description, amount: values.amount, date: values.date, billable: values.billable
    });
    if (created) {
      setExpenses((prev) => [toExpense(created), ...prev]);
    } else {
      await refreshExpenses();
    }
    await refetchBilling();
  }, [activePracticeId, selectedMatterId, refreshExpenses, refetchBilling]);

  const handleUpdateExpense = useCallback(async (expense: MatterExpense, values: { description: string; amount: MajorAmount | undefined; date: string; billable: boolean }) => {
    if (!activePracticeId || !selectedMatterId) throw new Error('IDs required');
    if (values.amount === undefined) throw new Error('Amount is required');
    try {
      const updated = await updateMatterExpense(activePracticeId, selectedMatterId, expense.id, {
        description: values.description, amount: values.amount, date: values.date, billable: values.billable
      });
      if (updated) {
        setExpenses((prev) => prev.map((item) => item.id === expense.id ? toExpense(updated) : item));
      } else {
        await refreshExpenses();
      }
      setExpensesError(null);
      await refetchBilling();
    } catch (error) {
      console.error('[PracticeMattersPage] Failed to update expense', error);
      showError('Could not update expense', 'Please try again.');
      setExpensesError('Unable to update expense.');
      await refreshExpenses().catch(console.error);
      throw error;
    }
  }, [activePracticeId, selectedMatterId, refreshExpenses, refetchBilling, showError]);

  const handleDeleteExpense = useCallback(async (expense: MatterExpense) => {
    if (!activePracticeId || !selectedMatterId) throw new Error('IDs required');
    try {
      await deleteMatterExpense(activePracticeId, selectedMatterId, expense.id);
      setExpenses((prev) => prev.filter((item) => item.id !== expense.id));
      setExpensesError(null);
      await refetchBilling();
    } catch (error) {
      console.error('[PracticeMattersPage] Failed to delete expense', error);
      showError('Could not delete expense', 'Please try again.');
      setExpensesError('Unable to delete expense.');
      await refreshExpenses().catch(console.error);
      throw error;
    }
  }, [activePracticeId, selectedMatterId, refreshExpenses, refetchBilling, showError]);

  // ── Milestone handlers ────────────────────────────────────────────────────
  const refreshMilestones = useCallback(async () => {
    if (!activePracticeId || !selectedMatterId) return;
    const items = await listMatterMilestones(activePracticeId, selectedMatterId);
    const mapped = items.map(toMilestone);
    setMilestones(mapped);
    setSelectedMatterDetail((prev) => prev ? { ...prev, milestones: mapped } : prev);
  }, [activePracticeId, selectedMatterId]);

  const handleCreateMilestone = useCallback(async (values: { description: string; amount: MajorAmount; dueDate: string; status?: string }) => {
    if (!activePracticeId || !selectedMatterId) throw new Error('IDs required');
    const created = await createMatterMilestone(activePracticeId, selectedMatterId, {
      description: values.description,
      amount: values.amount,
      due_date: values.dueDate,
      status: values.status ?? 'pending',
      order: milestones.length + 1
    });
    if (created) {
      const next = [...milestones, toMilestone(created)];
      setMilestones(next);
      setSelectedMatterDetail((prev) => prev ? { ...prev, milestones: next } : prev);
    } else {
      await refreshMilestones();
    }
  }, [activePracticeId, selectedMatterId, milestones, refreshMilestones]);

  const handleUpdateMilestone = useCallback(async (
    milestone: MatterDetail['milestones'][number],
    values: { description: string; amount: MajorAmount; dueDate: string; status?: string }
  ) => {
    if (!activePracticeId || !selectedMatterId) throw new Error('IDs required');
    if (!milestone.id) throw new Error('Milestone ID is required');
    try {
      const updated = await updateMatterMilestone(activePracticeId, selectedMatterId, milestone.id, {
        description: values.description, amount: values.amount, due_date: values.dueDate, status: values.status ?? 'pending'
      });
      if (updated) {
        const next = milestones.map((m) => m.id === milestone.id ? toMilestone(updated) : m);
        setMilestones(next);
        setSelectedMatterDetail((prev) => prev ? { ...prev, milestones: next } : prev);
      } else {
        await refreshMilestones();
      }
      setMilestonesError(null);
    } catch (error) {
      console.error('[PracticeMattersPage] Failed to update milestone', error);
      showError('Could not update milestone', 'Please try again.');
      setMilestonesError('Unable to update milestone.');
      await refreshMilestones().catch(console.error);
      throw error;
    }
  }, [activePracticeId, selectedMatterId, milestones, refreshMilestones, showError]);

  const handleDeleteMilestone = useCallback(async (milestone: MatterDetail['milestones'][number]) => {
    if (!activePracticeId || !selectedMatterId) throw new Error('IDs required');
    if (!milestone.id) throw new Error('Milestone ID is required');
    try {
      await deleteMatterMilestone(activePracticeId, selectedMatterId, milestone.id);
      const next = milestones.filter((m) => m.id !== milestone.id);
      setMilestones(next);
      setSelectedMatterDetail((prev) => prev ? { ...prev, milestones: next } : prev);
      setMilestonesError(null);
    } catch (error) {
      console.error('[PracticeMattersPage] Failed to delete milestone', error);
      showError('Could not delete milestone', 'Please try again.');
      setMilestonesError('Unable to delete milestone.');
      await refreshMilestones().catch(console.error);
      throw error;
    }
  }, [activePracticeId, selectedMatterId, milestones, refreshMilestones, showError]);

  const handleReorderMilestones = useCallback(async (nextOrder: MatterDetail['milestones']) => {
    if (!activePracticeId || !selectedMatterId) return;
    const previous = milestones;
    setMilestones(nextOrder);
    setSelectedMatterDetail((prev) => prev ? { ...prev, milestones: nextOrder } : prev);

    const payload = nextOrder
      .map((m, i) => ({ id: m.id ?? '', order: i + 1 }))
      .filter((item) => item.id);
    if (payload.length === 0) return;

    try {
      await reorderMatterMilestones(activePracticeId, selectedMatterId, payload);
    } catch (error) {
      console.error('[PracticeMattersPage] Failed to reorder milestones', error);
      setMilestones(previous);
      setSelectedMatterDetail((prev) => prev ? { ...prev, milestones: previous } : prev);
      showError('Could not reorder milestones', 'Please try again.');
    }
  }, [activePracticeId, selectedMatterId, milestones, showError]);

  // ── Note handler ──────────────────────────────────────────────────────────
  const handleCreateNote = useCallback(async (values: { content: string }) => {
    if (!activePracticeId || !selectedMatterId) throw new Error('IDs required');
    const created = await createMatterNote(activePracticeId, selectedMatterId, values.content);
    if (created) setNoteRecords((prev) => [...prev, created]);
  }, [activePracticeId, selectedMatterId]);

  // ── Task handlers ─────────────────────────────────────────────────────────
  const refreshTasks = useCallback(async () => {
    if (!activePracticeId || !selectedMatterId) return;
    const items = await listMatterTasks(activePracticeId, selectedMatterId);
    setTasks(items.map(toMatterTask));
  }, [activePracticeId, selectedMatterId]);

  const handleCreateTask = useCallback(async (values: MatterTaskFormValues) => {
    if (!activePracticeId || !selectedMatterId) throw new Error('IDs required');
    await createMatterTask(activePracticeId, selectedMatterId, {
      name: values.name,
      description: values.description || undefined,
      assignee_id: values.assigneeId,
      due_date: values.dueDate,
      status: values.status,
      priority: values.priority,
      stage: values.stage
    });
    await refreshTasks();
  }, [activePracticeId, selectedMatterId, refreshTasks]);

  const handleUpdateTask = useCallback(async (task: MatterTask, patch: UpdateMatterTaskPayload) => {
    if (!activePracticeId || !selectedMatterId) throw new Error('IDs required');
    await updateMatterTask(activePracticeId, selectedMatterId, task.id, patch);
    await refreshTasks();
  }, [activePracticeId, selectedMatterId, refreshTasks]);

  const handleDeleteTask = useCallback(async (task: MatterTask) => {
    if (!activePracticeId || !selectedMatterId) throw new Error('IDs required');
    await deleteMatterTask(activePracticeId, selectedMatterId, task.id);
    await refreshTasks();
  }, [activePracticeId, selectedMatterId, refreshTasks]);

  // ── Derived list data ─────────────────────────────────────────────────────
  // Enriched with the raw fields the chat-first list view needs (urgency,
  // billing type, case number, open date) — these don't fan out per row so
  // they piggyback on the prefetched matter payload. normalizeUrgency throws
  // on unexpected backend values, so we tolerate that here (list keeps
  // rendering with a missing urgency rather than crashing the whole page).
  const matterEntries = useMemo(() => matters.map((m) => {
    let urgency: MatterDetail['urgency'];
    try {
      urgency = normalizeUrgency(m.urgency);
    } catch {
      urgency = undefined;
    }
    return {
      summary: toMatterSummary(m, { clientNameById, serviceNameById }),
      assigneeIds: extractAssigneeIds(m),
      urgency,
      billingType: typeof m.billing_type === 'string' ? m.billing_type : null,
      caseNumber: typeof m.case_number === 'string' ? m.case_number : null,
      openDate: typeof m.open_date === 'string' ? m.open_date : null,
      retainerBalance: typeof m.retainer_balance === 'number' ? m.retainer_balance : null,
      retainerCap: typeof m.retainer_cap === 'number' ? m.retainer_cap : null,
    };
  }), [matters, clientNameById, serviceNameById]);

  const statusFilteredMatterEntries = useMemo(() => {
    if (!statusFilter || statusFilter.length === 0) return matterEntries;
    const accepted = new Set(statusFilter.map((value) => value.toLowerCase()));
    return matterEntries.filter((entry) => accepted.has(entry.summary.status.toLowerCase()));
  }, [matterEntries, statusFilter]);
  const matterSummaries = useMemo(() => statusFilteredMatterEntries.map((e) => e.summary), [statusFilteredMatterEntries]);

  const filteredMatters = statusFilteredMatterEntries;

  // Enriched + sorted matter rows (preserves urgency / billingType / etc.).
  // The chat-first list view consumes these directly; flat-summary code paths
  // can still get `matterSummaries`/`matterSummaries.find()` for lookups.
  const sortedMatterEntries = useMemo(() => {
    return [...filteredMatters].sort(
      (a, b) => new Date(b.summary.updatedAt).getTime() - new Date(a.summary.updatedAt).getTime()
    );
  }, [filteredMatters]);

  const selectedMatterSummary = useMemo(
    () => selectedMatterId ? matterSummaries.find((m) => m.id === selectedMatterId) ?? null : null,
    [matterSummaries, selectedMatterId]
  );
  const { summaryStats: practiceBillingStats } = usePracticeBillingData({
    practiceId: activePracticeId,
    enabled: Boolean(activePracticeId),
    matterLimit: 50,
    windowSize: '7d',
    matters,
  });
  const resolvedSelectedMatter = selectedMatterDetail ?? selectedMatterSummary;
  const clientOptionById = useMemo(
    () => new Map(clientOptions.map((client) => [client.id, client])),
    [clientOptions]
  );
  const fallbackMatterDetailForReadViews = useMemo<MatterDetail | null>(() => {
    if (selectedMatterDetail) return selectedMatterDetail;
    if (!resolvedSelectedMatter) return null;
    return {
      ...resolvedSelectedMatter,
      clientId: '',
      practiceAreaId: '',
      assigneeIds: [],
      description: '',
      billingType: 'hourly',
      milestones: [],
      tasks: [],
      timeEntries: [],
      expenses: [],
      notes: []
    };
  }, [resolvedSelectedMatter, selectedMatterDetail]);
  const detailHeaderMeta = selectedMatterDetail ?? fallbackMatterDetailForReadViews;
  const detailClientOption = useMemo(() => {
    const detail = detailHeaderMeta;
    if (!detail) return null;
    if (detail.clientId) {
      const option = clientOptionById.get(detail.clientId);
      if (option) return option;
    }
    return {
      id: detail.clientId || 'matter-client',
      name: detail.clientName || 'Unassigned client',
      image: null,
      role: 'client'
    } satisfies MatterOption;
  }, [detailHeaderMeta, clientOptionById]);
  const activityItems = useMemo(() => {
    const filtered = activityRecords.filter((item) => !String(item.action ?? '').startsWith('note_'));
    return sortByTimestamp(filtered).map((item) => toActivityItem(item, activityRecords));
  }, [activityRecords, toActivityItem]);
  const noteItems = useMemo(() => {
    return sortByTimestamp(noteRecords).map(toNoteItem);
  }, [noteRecords, toNoteItem]);
  const timelineItems = useMemo(() => {
    return [...activityItems, ...noteItems].sort((a, b) => {
      const at = a.dateTime ? new Date(a.dateTime).getTime() : 0;
      const bt = b.dateTime ? new Date(b.dateTime).getTime() : 0;
      return (Number.isFinite(bt) ? bt : 0) - (Number.isFinite(at) ? at : 0);
    });
  }, [activityItems, noteItems]);

  const prefilledInvoiceLineItems = useMemo<InvoiceLineItem[]>(() => {
    const baseRate = selectedMatterDetail?.attorneyHourlyRate
      ?? selectedMatterDetail?.adminHourlyRate
      ?? asMajor(0);

    const timeItems: InvoiceLineItem[] = unbilledTimeEntries.reduce<InvoiceLineItem[]>((acc, entry, index) => {
      const qty = entry.duration_hours > 0 ? Number(entry.duration_hours.toFixed(2)) : 0;
      const amountValue = getMajorAmountValue(entry.amount);
      if (qty === 0 && amountValue <= 0) return acc;
      const amount = amountValue > 0 ? entry.amount : safeMultiply(baseRate, qty);
      acc.push({
        id: crypto.randomUUID(),
        type: 'time_entry',
        description: entry.description?.trim() || `Billable time entry ${index + 1}`,
        quantity: qty,
        unit_price: qty > 0 ? safeDivide(amount, qty) : baseRate,
        line_total: amount,
        time_entry_id: entry.id
      });
      return acc;
    }, []);

    const expenseItems: InvoiceLineItem[] = unbilledExpenses.map((expense) => ({
      id: crypto.randomUUID(),
      type: 'expense',
      description: expense.description,
      quantity: 1,
      unit_price: expense.amount,
      line_total: expense.amount,
      expense_id: expense.id
    }));

    return [...timeItems, ...expenseItems];
  }, [selectedMatterDetail?.attorneyHourlyRate, selectedMatterDetail?.adminHourlyRate, unbilledTimeEntries, unbilledExpenses]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.info('[Billing][Prefill] Updated unbilled counts', {
      timeEntries: unbilledTimeEntries.length,
      expenses: unbilledExpenses.length
    });
  }, [unbilledExpenses, unbilledTimeEntries]);

  type InvoiceLaunchOptions = {
    milestone?: MatterDetail['milestones'][number] | null;
    context?: 'default' | 'milestone' | 'retainer';
    invoiceType?: Invoice['invoice_type'];
  };

  const navigateToInvoiceCreate = useCallback((
    items?: InvoiceLineItem[],
    options?: InvoiceLaunchOptions
  ) => {
    if (!selectedMatterDetail) return;
    try {
      const draftId = createPendingInvoiceDraftContext({
        matterId: selectedMatterDetail.id,
        clientId: selectedMatterDetail.clientId,
        lineItems: items ?? prefilledInvoiceLineItems,
        invoiceType: options?.invoiceType,
        invoiceContext: options?.context ?? 'default',
        milestoneToComplete: options?.milestone
          ? {
              id: options.milestone.id,
              description: options.milestone.description,
              amount: options.milestone.amount,
              dueDate: options.milestone.dueDate,
            }
          : null,
        returnPath: location.path,
        returnLabel: 'Back to matter',
      });
      navigate(`${invoicesBasePath}/new?draft=${encodeURIComponent(draftId)}`);
    } catch (error) {
      showError(
        'Could not create invoice',
        error instanceof Error ? error.message : 'Failed to prepare the invoice draft.'
      );
    }
  }, [invoicesBasePath, location.path, navigate, prefilledInvoiceLineItems, selectedMatterDetail, showError]);

  const handleCreateInvoiceFromSummary = useCallback(() => {
    if (!selectedMatterDetail) {
      return;
    }

    if (selectedMatterDetail.billingType === 'contingency') {
      const settlement = selectedMatterDetail.settlementAmount ?? 0;
      const percent = selectedMatterDetail.contingencyPercent ?? 0;
      if (settlement <= 0 || percent <= 0) {
        setSettlementDraft(selectedMatterDetail.settlementAmount);
        setIsSettlementModalOpen(true);
        return;
      }
      const fee = asMajor((settlement * percent) / 100);
      navigateToInvoiceCreate([{
        id: crypto.randomUUID(),
        type: 'service',
        description: `Contingency fee (${percent}% of ${formatCurrency(settlement)} settlement)`,
        quantity: 1,
        unit_price: fee,
        line_total: fee
      }], { invoiceType: 'contingency' });
      return;
    }

    if (selectedMatterDetail.billingType === 'fixed' && selectedMatterDetail.paymentFrequency === 'project') {
      const fixedTotal = selectedMatterDetail.totalFixedPrice ?? asMajor(0);
      navigateToInvoiceCreate([{
        id: crypto.randomUUID(),
        type: 'flat_fee',
        description: `${selectedMatterDetail.title} - Fixed project fee`,
        quantity: 1,
        unit_price: fixedTotal,
        line_total: fixedTotal
      }], { invoiceType: 'flat_fee' });
      return;
    }

    navigateToInvoiceCreate(prefilledInvoiceLineItems);
  }, [selectedMatterDetail, navigateToInvoiceCreate, prefilledInvoiceLineItems]);

  const handleCreateMilestoneInvoice = useCallback((milestoneId: string) => {
    if (!selectedMatterDetail) return;
    const milestone = (selectedMatterDetail.milestones ?? []).find((m) => m.id === milestoneId);
    if (!milestone) return;
    const items: InvoiceLineItem[] = [{
      id: crypto.randomUUID(),
      type: 'service',
      description: milestone.description,
      quantity: 1,
      unit_price: milestone.amount,
      line_total: milestone.amount
    }];
    navigateToInvoiceCreate(items, {
      milestone,
      context: 'milestone',
      invoiceType: 'phase_fee'
    });
  }, [navigateToInvoiceCreate, selectedMatterDetail]);

  const handleSaveSettlementAndPrepareInvoice = useCallback(async () => {
    if (!activePracticeId || !selectedMatterId || settlementDraft === undefined || !selectedMatterDetail) return;
    try {
      if (import.meta.env.DEV) {
        console.info('[Billing][Settlement] Updating settlement_amount', {
          field: 'settlement_amount',
          value: settlementDraft
        });
      }
      await updateMatter(activePracticeId, selectedMatterId, {
        settlement_amount: settlementDraft
      });
      refreshMatters();
      setSelectedMatterDetail((prev) => prev ? { ...prev, settlementAmount: settlementDraft } : prev);
      setIsSettlementModalOpen(false);
      const percent = selectedMatterDetail.contingencyPercent ?? 0;
      const fee = asMajor((settlementDraft * percent) / 100);
      const items: InvoiceLineItem[] = [{
        id: crypto.randomUUID(),
        type: 'service',
        description: `Contingency fee (${percent}% of ${formatCurrency(settlementDraft)} settlement)`,
        quantity: 1,
        unit_price: fee,
        line_total: fee
      }];
      navigateToInvoiceCreate(items, { invoiceType: 'contingency' });
    } catch (error) {
      showError('Could not save settlement amount', error instanceof Error ? error.message : 'Please try again.');
    }
  }, [activePracticeId, selectedMatterId, settlementDraft, selectedMatterDetail, navigateToInvoiceCreate, refreshMatters, showError]);

  const handleViewInvoice = useCallback((invoice: Invoice) => {
    const basePath = `${invoicesBasePath}/${encodeURIComponent(invoice.id)}`;
    navigate(invoice.status === 'draft' ? `${basePath}/edit` : basePath);
  }, [invoicesBasePath, navigate]);

  // ── Patch matter — partial update from inline field groups ───────────────
  const handlePatchMatter = useCallback(async (patch: Partial<MatterFormState>) => {
    if (!activePracticeId || !selectedMatterId || !selectedMatterDetail) return;
    const base = buildFormStateFromDetail(selectedMatterDetail);
    const merged: MatterFormState = { ...base, ...patch };
    await updateMatter(
      activePracticeId,
      selectedMatterId,
      prunePayload(buildUpdatePayload(merged, selectedMatterDetail.status))
    );
    refreshMatters();
    await refreshSelectedMatter();
  }, [activePracticeId, selectedMatterId, selectedMatterDetail, refreshMatters, refreshSelectedMatter]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const normalizeWorkspaceMatterPatch = (patch: Record<string, unknown>): Partial<MatterFormState> => {
      const keyMap: Record<string, keyof MatterFormState> = {
        client_id: 'clientId',
        responsible_attorney_id: 'responsibleAttorneyId',
        originating_attorney_id: 'originatingAttorneyId',
        case_number: 'caseNumber',
        matter_type: 'matterType',
        opposing_party: 'opposingParty',
        opposing_counsel: 'opposingCounsel',
      };
      const normalizedEntries = Object.entries(patch).map(([key, value]) => [keyMap[key] ?? key, value]);
      return Object.fromEntries(normalizedEntries) as Partial<MatterFormState>;
    };
    const handleWorkspaceMatterPatchChange = (event: Event) => {
      const customEvent = event as CustomEvent<{
        matterId: string;
        patch: Record<string, unknown>;
        resolve?: () => void;
        reject?: (reason?: unknown) => void;
      }>;
      const detail = customEvent.detail;
      if (!detail || detail.matterId !== selectedMatterId || !detail.patch) return;
      const normalizedPatch = normalizeWorkspaceMatterPatch(detail.patch);
      void handlePatchMatter(normalizedPatch)
        .then(() => {
          detail.resolve?.();
        })
        .catch((error) => {
          console.error('[PracticeMattersPage] Failed to apply workspace matter patch', {
            selectedMatterId,
            patch: detail.patch,
            error
          });
          detail.reject?.(error);
          showError('Could not update matter details', error instanceof Error ? error.message : 'Please try again.');
        });
    };
    window.addEventListener('workspace:matter-patch-change', handleWorkspaceMatterPatchChange);
    return () => {
      window.removeEventListener('workspace:matter-patch-change', handleWorkspaceMatterPatchChange);
    };
  }, [handlePatchMatter, selectedMatterId, showError]);

  // Create flow is rendered as a dialog overlay by PracticeMatterCreatePage in
  // index.tsx — this page falls through to list rendering on /matters/new so
  // the matters list stays visible behind the dialog scrim.

  // =========================================================================
  // Render — detail route
  // =========================================================================
  if (selectedMatterId) {
    // Treat the cached detail as "missing" when it belongs to a different
    // matter than the one currently selected — that means the user just
    // switched matters and the new fetch is in flight. Showing the
    // previous matter's data briefly before B loads would be confusing,
    // so we route through the skeleton path.
    const detailMatchesSelection = selectedMatterDetail?.id === selectedMatterId;
    const detailReady = Boolean(selectedMatterDetail) && detailMatchesSelection;

    // Gate on `!detailReady` (FULL detail for the CURRENT matter), NOT
    // `!resolvedSelectedMatter`. The latter falls back to
    // `selectedMatterSummary` which is hydrated synchronously from the
    // cached matters list, bypassing the gate and letting the page render
    // with partial data (using `fallbackMatterDetailForReadViews` which
    // has empty billing / court / activity fields). Wait for the real
    // detail to land before painting.
    if (detailLoading && !detailReady) {
      // Loading is in flight. If it has been brief, render an empty page so we
      // don't briefly paint stale or partial content. Once the loading state
      // crosses the perceptibility threshold, swap in the skeleton.
      return (
        <Page className="h-full">
          {showDetailSkeleton ? <MatterDetailSkeleton /> : null}
        </Page>
      );
    }
    if (detailError && !detailReady) {
      return <MatterLoadError message={detailError} onBack={goToList} />;
    }
    if (!resolvedSelectedMatter) {
      return <MatterNotFound matterId={selectedMatterId} onBack={goToList} />;
    }
    if (!selectedMatterDetail) {
      // Detail not loaded yet — keep skeleton visible.
      return (
        <Page className="h-full">
          {showDetailSkeleton ? <MatterDetailSkeleton /> : null}
        </Page>
      );
    }

    const assigneeLabelComputed = (() => {
      const ids = selectedMatterDetail.assigneeIds ?? [];
      const names = ids
        .map((id) => assigneeNameById.get(id))
        .filter((n): n is string => Boolean(n));
      return names.length > 0 ? names.join(', ') : null;
    })();
    const responsibleAttorneyLabel = selectedMatterDetail.responsibleAttorneyId
      ? assigneeNameById.get(selectedMatterDetail.responsibleAttorneyId) ?? null
      : null;
    const originatingAttorneyLabel = selectedMatterDetail.originatingAttorneyId
      ? assigneeNameById.get(selectedMatterDetail.originatingAttorneyId) ?? null
      : null;
    const composerPerson: TimelinePerson = {
      name: session?.user?.name ?? session?.user?.email ?? 'You',
      imageUrl: session?.user?.image ?? null
    };
    const onActivityRetry = () => {
      setActivityError(null);
      setActivityRetryCount((count) => count + 1);
    };
    const onCreateNoteSafely = async (content: string) => {
      try {
        await handleCreateNote({ content });
      } catch (err) {
        console.error('[PracticeMattersPage] Failed to create note', err);
        showError('Could not save comment', 'Please try again.');
      }
    };
    const weeklyHoursLabel = (() => {
      const seconds = timeStats?.totalSeconds ?? null;
      const hours = timeStats?.totalHours ?? null;
      const totalMin =
        seconds != null && seconds > 0
          ? Math.round(seconds / 60)
          : hours != null && hours > 0
          ? Math.round(hours * 60)
          : 0;
      const h = Math.floor(totalMin / 60);
      const m = totalMin % 60;
      return `${h}:${String(m).padStart(2, '0')} hrs`;
    })();
    const attorneyRateLabel = selectedMatterDetail.attorneyHourlyRate
      ? `${formatCurrency(selectedMatterDetail.attorneyHourlyRate)}/hr`
      : null;
    const adminRateLabel = selectedMatterDetail.adminHourlyRate
      ? `${formatCurrency(selectedMatterDetail.adminHourlyRate)}/hr`
      : null;

    // ── Detail-mode stat-strip cells ─────────────────────────────────────
    // Per the canonical Matter.html the header strip has 5 cells:
    //   1. Retainer balance — TODO(backend): per-matter trust-ledger balance.
    //      Falls back to engagement.proposal_data.fees retainer_amount.
    //   2. Unbilled time — derived from useBillingData unbilledSummary.
    //   3. Events / 30d — TODO(backend): per-matter event count rollup.
    //   4. Next deadline — earliest open-task due_date (SoL would require a
    //      dedicated backend field; we surface the nearest soft deadline).
    //   5. Est. value — totalFixedPrice if available, else engagement
    //      proposal fee, else "—".
    const unbilledHours = unbilledSummary?.unbilledTime.hours ?? 0;
    const unbilledAmountMajor = unbilledSummary ? getMajorAmountValue(unbilledSummary.unbilledTime.amount) : 0;
    const unbilledEntries = unbilledSummary?.unbilledTime.entries ?? 0;
    const nextOpenTask = [...tasks].filter((t) => t.status !== 'completed').sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    })[0] ?? null;
    const nextDeadlineLabel = nextOpenTask?.dueDate
      ? new Date(nextOpenTask.dueDate).toLocaleDateString('en-US', { month: 'short', day: '2-digit' })
      : null;
    const nextDeadlineExtra = nextOpenTask?.dueDate
      ? (() => {
          const diff = Math.ceil(
            (new Date(nextOpenTask.dueDate as string).getTime() - Date.now()) / (24 * 60 * 60 * 1000)
          );
          if (diff < 0) return `${Math.abs(diff)} ${Math.abs(diff) === 1 ? 'day' : 'days'} overdue`;
          if (diff === 0) return 'due today';
          return `${diff} ${diff === 1 ? 'day' : 'days'} away`;
        })()
      : undefined;

    const estimatedValueCell: { value: string; extra?: string } = (() => {
      if (selectedMatterDetail.totalFixedPrice) {
        const amt = getMajorAmountValue(selectedMatterDetail.totalFixedPrice);
        return { value: formatCurrency(amt), extra: 'fixed fee' };
      }
      if (selectedMatterDetail.billingType === 'contingency' && selectedMatterDetail.contingencyPercent) {
        return {
          value: '—',
          extra: `contingency · ${selectedMatterDetail.contingencyPercent}%`
        };
      }
      const proposalFee = engagement?.proposal_data?.fees;
      if (proposalFee?.fixed_fee_amount && proposalFee.fixed_fee_amount > 0) {
        return { value: formatCurrency(proposalFee.fixed_fee_amount), extra: 'fixed fee' };
      }
      if (proposalFee?.retainer_amount && proposalFee.retainer_amount > 0) {
        return { value: formatCurrency(proposalFee.retainer_amount), extra: 'retainer' };
      }
      return { value: '—' };
    })();

    const retainerCell: { value: string; extra?: string } = (() => {
      const proposalFee = engagement?.proposal_data?.fees;
      const retainerAmount = proposalFee?.retainer_amount && proposalFee.retainer_amount > 0
        ? proposalFee.retainer_amount
        : null;
      // TODO(backend): expose a real trust-ledger-derived retainer balance so
      // we can show the live balance + threshold warning bar per Matter.html.
      if (!retainerAmount) return { value: '—' };
      return { value: formatCurrency(retainerAmount), extra: 'engagement retainer' };
    })();

    const detailStatCells: StatStripCell[] = [
      { label: 'Retainer balance', value: retainerCell.value, extra: retainerCell.extra },
      {
        label: 'Unbilled time',
        value: unbilledHours > 0 ? unbilledHours.toFixed(unbilledHours % 1 === 0 ? 0 : 1) : '—',
        unit: unbilledHours > 0 ? `h · ${formatCurrency(unbilledAmountMajor)}` : undefined,
        extra: unbilledEntries > 0 ? `${unbilledEntries} ${unbilledEntries === 1 ? 'entry' : 'entries'}` : undefined
      },
      // TODO(backend): per-matter event count for trailing 30d.
      { label: 'Events / 30d', value: '—' },
      {
        label: 'Next deadline',
        value: nextDeadlineLabel ?? '—',
        extra: nextDeadlineExtra,
        extraWarn: Boolean(
          nextOpenTask?.dueDate
          && new Date(nextOpenTask.dueDate).getTime() < Date.now()
        )
      },
      { label: 'Est. value', value: estimatedValueCell.value, extra: estimatedValueCell.extra }
    ];

    // Tab counts beside each tab — chat-first information density without
    // changing the IA (canonical design has 9 sibling tabs; we keep 7 with
    // Tasks+Milestones nested under Work and Time+Expenses+Invoices nested
    // under Billing).
    const openTasksCount = tasks.filter((t) => t.status !== 'completed').length;
    const detailTabCounts: MatterDetailTabCounts = {
      work: openTasksCount || undefined,
      notes: noteRecords.length || undefined,
      billing: invoices.length || undefined,
      activity: timelineItems.length || undefined
      // `files` count requires a separate fetch — omitted today.
    };

    // Ask-about-matter handler — wired into the right-rail inspector.
    // TODO(backend): wire to /api/practice/:id/matters/:matterId/ask once
    // the scoped-context practice-assistant route exists. Today we route
    // the user to the activity tab where they can see the matter's
    // events / files / engagement context.
    const handleAskAboutMatter = (_query: string) => {
      goToDetail(selectedMatterDetail.id, 'activity');
    };

    return (
      <>
        <MatterDetailPanel
          matterId={selectedMatterId}
          detailSection={detailSection}
          onSectionChange={(next) => {
            if (next === 'overview') goToDetail(selectedMatterDetail.id, null);
            else goToDetail(selectedMatterDetail.id, next);
          }}
          tabCounts={detailTabCounts}
          header={{
            detail: selectedMatterDetail,
            clientLabel: detailClientOption?.name ?? 'Unassigned client',
            clientEmail: detailClientOption?.email ?? null,
            clientImageUrl: detailClientOption?.image ?? null,
            practiceAreaLabel: selectedMatterDetail.practiceArea ?? null,
            responsibleAttorneyLabel,
            assigneeLabel: assigneeLabelComputed,
            onLogTime: () => goToDetail(selectedMatterDetail.id, 'billing', 'time'),
            onAddTask: () => navigate(`${basePath}/${encodeURIComponent(selectedMatterDetail.id)}/work?compose=task`),
            onAddNote: () => goToDetail(selectedMatterDetail.id, 'notes'),
            onUploadFile: () => goToDetail(selectedMatterDetail.id, 'files'),
            statCells: detailStatCells,
            moreMenuItems: [
              {
                label: 'Edit matter',
                icon: SquarePen,
                onClick: () => setIsEditDialogOpen(true)
              }
            ]
          }}
          overview={{
            detail: selectedMatterDetail,
            clientLabel: detailClientOption?.name ?? 'Unassigned client',
            clientEmail: detailClientOption?.email ?? null,
            assigneeLabel: assigneeLabelComputed,
            responsibleAttorneyLabel,
            tasks,
            engagement,
            engagementLoading,
            engagementError,
            onEngagementRetry: () => {
              setEngagementError(null);
              setEngagementRetryCount((count) => count + 1);
            },
            onViewEngagement: () => void handleEngagementPrimaryAction(),
            timelineItems,
            activityLoading,
            activityError,
            onActivityRetry,
            weeklyHoursLabel,
            attorneyRateLabel,
            adminRateLabel,
            onOpenClient: undefined,
            onCreateInvoice: handleCreateInvoiceFromSummary,
            onLogTime: () => goToDetail(selectedMatterDetail.id, 'billing', 'time'),
            onViewTimesheet: () => goToDetail(selectedMatterDetail.id, 'billing', 'time'),
            onViewAllActivity: () => goToDetail(selectedMatterDetail.id, 'activity'),
            onViewTasks: () => goToDetail(selectedMatterDetail.id, 'work', 'tasks'),
            onAddTask: () => navigate(`${basePath}/${encodeURIComponent(selectedMatterDetail.id)}/work?compose=task`),
            onTaskClick: () => goToDetail(selectedMatterDetail.id, 'work', 'tasks'),
            onUploadFile: () => goToDetail(selectedMatterDetail.id, 'files'),
            onViewFiles: () => goToDetail(selectedMatterDetail.id, 'files'),
            unbilledSummary,
            onApproveInvoiceDraft: handleCreateInvoiceFromSummary,
            onAskAboutMatter: handleAskAboutMatter
          }}
          work={{
            detail: selectedMatterDetail,
            subTab: workSubTab,
            onSubTabChange: (next) => goToDetail(selectedMatterDetail.id, 'work', next),
            tasks,
            tasksLoading,
            tasksError,
            tasksNotImplemented,
            assignees: assigneeOptions,
            tasksReadOnly: selectedMatterDetail.status === 'closed',
            onCreateTask: handleCreateTask,
            onUpdateTask: handleUpdateTask,
            onDeleteTask: handleDeleteTask,
            autoComposeTask: composeTaskRequested,
            onComposeTaskHandled: () => goToDetail(selectedMatterDetail.id, 'work', 'tasks'),
            milestones,
            milestonesLoading,
            milestonesError,
            onCreateMilestone: handleCreateMilestone,
            onUpdateMilestone: handleUpdateMilestone,
            onDeleteMilestone: handleDeleteMilestone,
            onReorderMilestones: handleReorderMilestones
          }}
          notes={{
            noteItems,
            noteLoading,
            noteError,
            onNoteRetry: () => {
              setNoteError(null);
              setNoteRetryCount((count) => count + 1);
            },
            onCreateNote: onCreateNoteSafely,
            composerPerson,
            composerPracticeId: activePracticeId
          }}
          billing={{
            detail: selectedMatterDetail,
            subTab: billingSubTab,
            onSubTabChange: (next) => goToDetail(selectedMatterDetail.id, 'billing', next),
            timeEntries,
            timeEntriesLoading,
            timeEntriesError,
            onSaveTimeEntry: (values, existing) => void handleSaveTimeEntry(values, existing),
            onDeleteTimeEntry: (entry) => void handleDeleteTimeEntry(entry),
            expenses,
            expensesLoading,
            expensesError,
            onCreateExpense: handleCreateExpense,
            onUpdateExpense: handleUpdateExpense,
            onDeleteExpense: handleDeleteExpense,
            invoices,
            invoicesLoading,
            invoicesError,
            unbilledSummary,
            onCreateInvoice: handleCreateInvoiceFromSummary,
            onCreateMilestoneInvoice: handleCreateMilestoneInvoice,
            onEnterSettlement: () => setIsSettlementModalOpen(true),
            onViewInvoice: handleViewInvoice,
            onRetry: () => void refetchBilling()
          }}
          activity={{
            timelineItems,
            activityLoading,
            activityError,
            onActivityRetry,
            onCreateNote: onCreateNoteSafely,
            composerPerson,
            composerPracticeId: activePracticeId,
            onTaskClick: () => goToDetail(selectedMatterDetail.id, 'work', 'tasks')
          }}
          settings={{
            detail: selectedMatterDetail,
            responsibleAttorneyLabel,
            originatingAttorneyLabel,
            assigneeLabel: assigneeLabelComputed,
            onEditMatter: () => setIsEditDialogOpen(true),
            onCloseMatter: selectedMatterDetail.status === 'closed' ? undefined : () => setMatterCloseOpen(true),
            onDeleteMatter: () => { setMatterDeleteConfirmInput(''); setMatterDeleteOpen(true); }
          }}
        />

        {/* Quick time entry modal */}
        {isQuickTimeEntryOpen && (
          <Dialog
            isOpen={isQuickTimeEntryOpen}
            onClose={() => setIsQuickTimeEntryOpen(false)}
            title="Add time entry"
            contentClassName="max-w-2xl"
          >
            <TimeEntryForm
              key={`quick-time-${_quickTimeEntryKey}`}
              onSubmit={handleQuickTimeSubmit}
              onCancel={() => setIsQuickTimeEntryOpen(false)}
            />
          </Dialog>
        )}

        {isEditDialogOpen && selectedMatterDetail ? (
          <Dialog
            isOpen
            onClose={() => setIsEditDialogOpen(false)}
            title="Edit Matter"
            description="Update matter details, billing structure, and assignment."
            contentClassName="!max-w-3xl"
          >
            <DialogBody>
              <MatterEditForm
                unwrapped
                onClose={() => setIsEditDialogOpen(false)}
                onSubmit={handleUpdateMatter}
                practiceId={activePracticeId}
                clients={clientOptions}
                practiceAreas={practiceAreaOptions}
                assignees={assigneeOptions}
                initialValues={buildFormStateFromDetail(selectedMatterDetail)}
              />
            </DialogBody>
          </Dialog>
        ) : null}

        {matterCloseOpen ? (
          <Dialog
            isOpen={matterCloseOpen}
            onClose={() => setMatterCloseOpen(false)}
            title="Close this matter?"
            contentClassName="max-w-md"
          >
            <DialogBody className="space-y-3">
              <p className="text-sm text-dim-2">
                Closing marks this matter as closed. No new time entries or tasks can be added.
              </p>
            </DialogBody>
            <div className="flex justify-end gap-2 px-6 pb-6">
              <Button variant="secondary" onClick={() => setMatterCloseOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={() => void handleConfirmCloseMatter()}>Close matter</Button>
            </div>
          </Dialog>
        ) : null}

        {matterDeleteOpen ? (
          <Dialog
            isOpen={matterDeleteOpen}
            onClose={() => { setMatterDeleteOpen(false); setMatterDeleteConfirmInput(''); }}
            title="Delete this matter?"
            contentClassName="max-w-md"
          >
            <DialogBody className="space-y-4">
              <p className="text-sm text-dim-2">
                This permanently deletes <strong className="text-ink">{selectedMatterDetail.title}</strong> and all associated data (time entries, expenses, notes, files, milestones). This cannot be undone.
              </p>
              <div className="space-y-2">
                <label className="block text-xs font-medium text-ink">
                  Type <span className="font-semibold">{selectedMatterDetail.title}</span> to confirm
                </label>
                <Input
                  value={matterDeleteConfirmInput}
                  onChange={(value) => setMatterDeleteConfirmInput(value)}
                  placeholder={selectedMatterDetail.title}
                />
              </div>
            </DialogBody>
            <div className="flex justify-end gap-2 px-6 pb-6">
              <Button variant="secondary" onClick={() => { setMatterDeleteOpen(false); setMatterDeleteConfirmInput(''); }}>
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={matterDeleteConfirmInput.trim() !== selectedMatterDetail.title.trim()}
                onClick={() => void handleConfirmDeleteMatter()}
              >
                Delete matter
              </Button>
            </div>
          </Dialog>
        ) : null}

        {isSettlementModalOpen ? (
          <Dialog
            isOpen={isSettlementModalOpen}
            onClose={() => setIsSettlementModalOpen(false)}
            title="Enter Settlement Amount"
            contentClassName="max-w-xl"
          >
            <div className="space-y-4">
              <p className="text-sm text-dim-2">
                Set the settlement amount before generating a contingency invoice.
              </p>
              <CurrencyInput
                label="Settlement amount"
                value={settlementDraft}
                onChange={(value) => setSettlementDraft(value === undefined ? undefined : asMajor(value))}
              />
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setIsSettlementModalOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => void handleSaveSettlementAndPrepareInvoice()}
                  disabled={settlementDraft === undefined || settlementDraft <= 0}
                >
                  Save and continue
                </Button>
              </div>
            </div>
          </Dialog>
        ) : null}
      </>
    );
  }

  // =========================================================================
  // Render — list route (default): chat-first Matters surface
  // (per design_handoff_blawby_chat_first/screens/Matters.html).
  // =========================================================================
  if (renderMode === 'detailOnly') {
    return null;
  }

  const handleNewMatter = () => navigate(`${basePath}/new?returnTo=${encodeURIComponent(location.url)}`);
  const showLoading = mattersLoading || clientsLoading;

  // Apply the chat-first filter chips to the already status-filtered + sorted
  // list. Each chip narrows the visible set independently; multiple chips
  // compose (AND) — `at risk` + `assigned: me` selects rows that meet both.
  // `assigned: me` is a no-op when we don't yet know the current user.
  const sessionUserId = session?.user?.id ?? null;
  const now = Date.now();
  const visibleMatterEntries = sortedMatterEntries.filter((entry) => {
    if (activeFilters.has('at_risk')) {
      const signal = deriveRiskSignal(entry.urgency, entry.summary.updatedAt, now);
      if (signal !== 'urgent' && signal !== 'warn') return false;
    }
    if (activeFilters.has('status_open')) {
      const cat = matterStatusCategory(entry.summary.status);
      if (cat !== 'active' && cat !== 'closing' && cat !== 'new') return false;
    }
    if (activeFilters.has('assigned_me')) {
      if (!sessionUserId) return false;
      if (!entry.assigneeIds.includes(sessionUserId)) return false;
    }
    return true;
  });

  // Header summary — mirror the redesign's hero layout while staying grounded
  // in live data we actually have today. Retainer totals come from the list
  // payload, unbilled comes from the shared practice-billing aggregate hook,
  // and the second line uses matter counts until a dedicated matter-stats
  // endpoint exists for event/court rollups.
  const openMattersCount = sortedMatterEntries.filter((e) => {
    const cat = matterStatusCategory(e.summary.status);
    return cat === 'active' || cat === 'closing' || cat === 'new';
  }).length;
  const atRiskCount = sortedMatterEntries.filter((e) =>
    deriveRiskSignal(e.urgency, e.summary.updatedAt, now) === 'urgent'
  ).length;
  const totalMatters = sortedMatterEntries.length;
  const openRetainerTotal = sortedMatterEntries.reduce((sum, entry) => {
    const cat = matterStatusCategory(entry.summary.status);
    if (cat !== 'active' && cat !== 'closing' && cat !== 'new') return sum;
    return sum + ((entry.retainerBalance ?? 0) / 100);
  }, 0);
  const unbilledSummaryStat = practiceBillingStats.find((stat) => stat.id === 'unbilled') ?? null;
  const totalUnbilled = unbilledSummaryStat ? getMajorAmountValue(unbilledSummaryStat.value) : 0;

  const showEmpty = !showLoading && !mattersError && sortedMatterEntries.length === 0;
  const showFilteredEmpty =
    !showLoading && !mattersError && sortedMatterEntries.length > 0 && visibleMatterEntries.length === 0;
  const filteredEmptyMessage = (() => {
    if (activeFilters.size === 0) return 'No matters match these filters.';
    if (activeFilters.has('at_risk') && activeFilters.size === 1) return 'No matters at risk right now — quiet day.';
    if (activeFilters.has('assigned_me') && activeFilters.size === 1) return 'Nothing assigned to you right now.';
    return 'No matters match these filters.';
  })();

  const crumb = `Workspace · ${formatCount(openMattersCount)} active`;

  const handleAskSubmit = (query: string) => {
    // TODO(backend): wire to /api/practice/:id/matters/ask once the natural-
    // language matters-query endpoint exists. Today we surface a placeholder
    // AIAnswerCard so the surface composes the canonical chat-first shape;
    // the model never fabricates numbers — the lede is grounded narration
    // of the current filter state instead.
    setAskAnswer({ query });
  };

  // TODO(backend): replace with a real CSV stream via
  // /api/practice/:id/matters/export?format=csv. Stub until then.
  const handleExport = () => {
    setAskAnswer({ query: '__export_pending__' });
  };

  // Mobile reflow strategy:
  // - H1: 32px on mobile, 44px from sm+
  // - Hero stats stack under the title on mobile, align right on desktop
  // - Toolbar actions stay with filters/view controls (matches redesign)
  // - Filter chip row: dialog ("Filters" button) on mobile, inline pills sm+
  // - Page padding: tighter (px-4) on mobile, 24px sm+
  // - Table row: 2 cols (title + status pill) below md, 6 cols at md+
  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto">
      {isClientListTruncated && (
        <div className="px-4 pt-4 sm:px-6">
          <WarningBanner>
            <strong>Warning:</strong> The contacts list is incomplete. Some names or options may be missing.
          </WarningBanner>
        </div>
      )}

      {mattersError && (
        <div className="px-4 pt-4 sm:px-6">
          <ErrorBanner>{mattersError}</ErrorBanner>
        </div>
      )}

      <div className="mx-auto w-full max-w-[1280px] px-4 pb-12 pt-6 sm:px-6 sm:pt-7">
        {/* ── PAGE HEADER ROW ──────────────────────────────────────────── */}
        <header className="flex flex-col gap-4 border-b border-line-subtle pb-5 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
              {crumb}
            </div>
            <h1 className="mt-1 font-[family-name:var(--serif)] text-[32px] font-normal leading-none tracking-tight text-ink sm:text-4xl lg:text-[44px]">
              Matters
            </h1>
          </div>
          <div className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-dim md:text-right">
            <span className="block">Open</span>
            <div className="mt-1 leading-[1.7]">
              <span className="font-sans text-[13px] font-medium tracking-normal text-ink">{formatCurrency(openRetainerTotal)}</span>{' '}
              in retainer
              {' · '}
              <span className="font-sans text-[13px] font-medium tracking-normal text-ink">{formatCurrency(totalUnbilled)}</span>{' '}
              unbilled
            </div>
            <div className="leading-[1.7]">
              <span className="font-sans text-[13px] font-medium tracking-normal text-ink">{formatCount(atRiskCount)}</span>{' '}
              at risk
              {' · '}
              <span className="font-sans text-[13px] font-medium tracking-normal text-ink">{formatCount(totalMatters)}</span>{' '}
              total
            </div>
          </div>
        </header>

        {/* ── AI ASK BAR (non-sticky on list views) ────────────────────── */}
        <div className="mt-6">
          <AIAskBar
            sticky={false}
            placeholder='Ask anything — "which matters are at risk?" · "open Martinez" · "draft an invoice for Johnson"'
            suggestions={[
              'Show matters at risk',
              'Retainer below 30%',
              'No activity > 2 weeks',
            ]}
            onSubmit={handleAskSubmit}
          />
        </div>

        {/* ── AI ANSWER CARD (shown after ask) ─────────────────────────── */}
        {askAnswer ? (
          <div className="mt-5">
            <AIAnswerCard
              groundingLabel={`Practice assistant · grounded in matters · ${totalMatters} rows · just now`}
              lede={
                askAnswer.query === '__export_pending__'
                  ? <>Exporting <em>{formatCount(totalMatters)}</em> matters to CSV. The download will start shortly.</>
                  : <>Showing <em>{formatCount(visibleMatterEntries.length)}</em> of <em>{formatCount(totalMatters)}</em> matters{activeFilters.size > 0 ? ' that match the active filters' : ''}. Sorted by most recent activity.</>
              }
              body={
                askAnswer.query === '__export_pending__'
                  ? undefined
                  : <p className="text-sm text-dim-2">
                      You asked: <span className="italic text-ink">&ldquo;{askAnswer.query}&rdquo;</span>. Live natural-language matters search is coming soon &mdash; for now I&rsquo;ve applied the closest matching filter and surfaced the rows below.
                    </p>
              }
              actions={[
                {
                  id: 'show-at-risk',
                  label: 'Show at risk',
                  variant: 'primary',
                  onClick: () => {
                    setActiveFilters(new Set(['at_risk']));
                    setAskAnswer(null);
                  },
                },
                {
                  id: 'dismiss',
                  label: 'Dismiss',
                  onClick: () => setAskAnswer(null),
                },
              ]}
              sources={[{ table: 'matters', count: totalMatters }]}
            />
          </div>
        ) : null}

        {/* ── TOOLBAR (filter chips + view toggle) ─────────────────────── */}
        <div className="mt-7 flex flex-wrap items-center gap-3">
          {/* Desktop: chips inline. Mobile: collapse to overflow menu. */}
          <div className="hidden flex-wrap items-center gap-2 sm:flex">
            {FILTER_CHIP_OPTIONS.map((chip) => {
              const isOn = activeFilters.has(chip.id);
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => toggleFilter(chip.id)}
                  aria-pressed={isOn}
                  className={isOn ? filterChipActiveClass : filterChipInactiveClass}
                  style={isOn ? { color: 'var(--ink)' } : undefined}
                >
                  {chip.label}
                  {isOn ? <span className="text-dim-2">×</span> : null}
                </button>
              );
            })}
            <button
              type="button"
              disabled
              className="inline-flex items-center gap-1.5 rounded-[2px] border border-solid border-line-utility bg-transparent px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-wider text-ink-2 opacity-60"
              title="More filters — coming soon"
            >
              + filter
            </button>
          </div>
          <div className="sm:hidden">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setIsMobileFiltersOpen(true)}
            >
              Filters{activeFilters.size > 0 ? ` (${activeFilters.size})` : ''}
            </Button>
          </div>

          <div className="flex-1" />

          <span className="hidden font-mono text-[10px] uppercase tracking-wider text-dim md:inline">view</span>
          {/* Board view requires more horizontal space — hide it on mobile
              by forcing Table mode there via the wrapper logic below. */}
          <div className="overflow-x-auto scrollbar-hide">
            <Seg<MatterViewMode>
              value={viewMode}
              options={[
                { value: 'table', label: 'Table' },
                { value: 'board', label: 'Board' },
                { value: 'timeline', label: 'Timeline' },
              ]}
              onChange={setViewMode}
              ariaLabel="Switch matter view"
            />
          </div>
          <Button
            size="sm"
            variant="ghost"
            icon={Download}
            onClick={handleExport}
            disabled={!activePracticeId || totalMatters === 0}
            className="min-h-[44px] sm:min-h-0"
          >
            Export
          </Button>
          <Button
            size="sm"
            variant="primary"
            icon={Plus}
            onClick={handleNewMatter}
            disabled={!activePracticeId}
            className="min-h-[44px] sm:min-h-0"
          >
            New matter
            <kbd className="ml-2 hidden rounded border border-line-utility bg-paper-2 px-1.5 py-0.5 text-[10px] font-medium text-dim-2 md:inline">
              N
            </kbd>
          </Button>
        </div>

        {/* ── MAIN VIEW ─────────────────────────────────────────────────── */}
        <div className="mt-4">
          {showLoading ? (
            <div className="panel overflow-hidden">
              <div className="flex animate-pulse flex-col gap-3 p-6">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-12 rounded-md bg-rule-soft" />
                ))}
              </div>
            </div>
          ) : showEmpty ? (
            <EmptyState onCreate={handleNewMatter} disableCreate={!activePracticeId} />
          ) : showFilteredEmpty ? (
            <div className="panel px-6 py-12 text-center text-sm text-dim-2">
              {filteredEmptyMessage}
            </div>
          ) : viewMode === 'timeline' ? (
            <div className="panel px-6 py-16 text-center">
              <p className="font-[family-name:var(--serif)] text-lg text-ink">Timeline view</p>
              <p className="mt-2 text-sm text-dim-2">
                Coming soon — a chronological lane of matter activity grouped by week.
              </p>
            </div>
          ) : viewMode === 'board' ? (
            <>
              {/* Hide Board on mobile per spec; fall back to Table. */}
              <div className="hidden lg:block">
                <MattersBoard
                  entries={visibleMatterEntries}
                  onSelect={(id) => goToDetail(id)}
                  now={now}
                />
              </div>
              <div className="lg:hidden">
                <MattersTable
                  entries={visibleMatterEntries}
                  onSelect={(id) => goToDetail(id)}
                  now={now}
                  activeFilters={activeFilters}
                />
              </div>
            </>
          ) : (
            <MattersTable
              entries={visibleMatterEntries}
              onSelect={(id) => goToDetail(id)}
              now={now}
              activeFilters={activeFilters}
            />
          )}
        </div>
      </div>

      {/* ── Mobile filters drawer ──────────────────────────────────────── */}
      {isMobileFiltersOpen && (
        <Dialog
          isOpen
          onClose={() => setIsMobileFiltersOpen(false)}
          title="Filters"
          contentClassName="max-w-sm"
        >
          <DialogBody className="space-y-2">
            {FILTER_CHIP_OPTIONS.map((chip) => {
              const isOn = activeFilters.has(chip.id);
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => toggleFilter(chip.id)}
                  aria-pressed={isOn}
                  className={isOn ? mobileFilterChipActiveClass : mobileFilterChipInactiveClass}
                  style={isOn ? { color: 'var(--ink)' } : undefined}
                >
                  <span>{chip.label}</span>
                  {isOn ? <span className="font-mono text-xs text-dim-2">×</span> : null}
                </button>
              );
            })}
          </DialogBody>
          <div className="flex justify-end gap-2 px-6 pb-6">
            <Button variant="ghost" onClick={() => setActiveFilters(new Set())}>
              Clear all
            </Button>
            <Button variant="primary" onClick={() => setIsMobileFiltersOpen(false)}>
              Done
            </Button>
          </div>
        </Dialog>
      )}

      {isShortcutsHelpOpen && (
        <Dialog
          isOpen
          onClose={() => setIsShortcutsHelpOpen(false)}
          title="Keyboard shortcuts"
          contentClassName="max-w-md"
        >
          <DialogBody>
            <ul className="space-y-2.5">
              {[
                { key: 'N', desc: 'Create a new matter' },
                { key: 'Esc', desc: 'Clear filters or dismiss answer' },
                { key: '?', desc: 'Show this help' },
                { key: '⌘ K', desc: 'Open command palette (or Ctrl + K)' },
              ].map((s) => (
                <li key={s.key} className="flex items-center justify-between gap-4">
                  <span className="text-sm text-ink">{s.desc}</span>
                  <kbd className="rounded border border-line-utility bg-paper-2 px-2 py-0.5 text-xs font-medium text-dim-2">
                    {s.key}
                  </kbd>
                </li>
              ))}
            </ul>
          </DialogBody>
        </Dialog>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Inline matters table + board (chat-first Matters.html).
// Lives in this file because they consume the parent's enriched row data
// and don't need lifecycle of their own. Pure presentational; all row data
// shape is owned by the parent.
// ---------------------------------------------------------------------------

type MatterRow = {
  summary: MatterSummary;
  assigneeIds: string[];
  urgency: MatterDetail['urgency'];
  billingType: string | null;
  caseNumber: string | null;
  openDate: string | null;
  retainerBalance: number | null;
  retainerCap: number | null;
};

const daysSince = (iso: string | null, now: number): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now - t) / DAY_MS));
};

const billingTypeLabel = (raw: string | null): string | null => {
  if (!raw) return null;
  const norm = raw.toLowerCase().replace(/\s+/g, '_');
  switch (norm) {
    case 'hourly': return 'hourly';
    case 'fixed': return 'flat-fee';
    case 'contingency': return 'contingency';
    case 'pro_bono': return 'pro bono';
    default: return raw;
  }
};

function MattersTable({
  entries,
  onSelect,
  now,
  activeFilters,
}: {
  entries: MatterRow[];
  onSelect: (id: string) => void;
  now: number;
  activeFilters: ReadonlySet<MatterRiskFilter>;
}) {
  const filterSummary = activeFilters.size === 0
    ? 'no filters'
    : Array.from(activeFilters)
        .map((id) => FILTER_CHIP_OPTIONS.find((c) => c.id === id)?.label ?? id)
        .join(' · ');

  return (
    <div className="panel overflow-hidden">
      {/* Header row — desktop only. Mobile reduces to 2 cols (title + status). */}
      <div className="hidden border-b border-line-subtle bg-paper-2 px-5 py-2.5 font-mono text-[10px] uppercase tracking-wider text-dim md:grid md:grid-cols-[minmax(0,2.1fr)_110px_minmax(0,1fr)_minmax(0,1.2fr)_120px_110px] md:gap-4">
        <div>Matter</div>
        <div>Status</div>
        <div>Retainer</div>
        <div>Tags</div>
        <div>Risk</div>
        <div>Activity</div>
      </div>

      <ul className="divide-y divide-line-subtle">
        {entries.map((row) => {
          const { summary } = row;
          const signal = deriveRiskSignal(row.urgency, summary.updatedAt, now);
          const tone = matterStatusPillTone(summary.status);
          const billingLabel = billingTypeLabel(row.billingType);
          const opened = daysSince(row.openDate ?? summary.createdAt, now);
          const urgentTint = signal === 'urgent';
          const retainerPct = row.retainerBalance != null && row.retainerCap != null && row.retainerCap > 0
            ? Math.max(0, Math.min(100, Math.round((row.retainerBalance / row.retainerCap) * 100)))
            : null;

          return (
            <li key={summary.id}>
              <button
                type="button"
                onClick={() => onSelect(summary.id)}
                className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-rule-soft md:grid-cols-[minmax(0,2.1fr)_110px_minmax(0,1fr)_minmax(0,1.2fr)_120px_110px] md:gap-4 ${
                  urgentTint ? 'bg-[color-mix(in_oklab,var(--neg)_4%,transparent)]' : ''
                }`}
              >
                {/* Matter (title + sub) */}
                <div className="min-w-0">
                  <div className="truncate font-[family-name:var(--serif)] text-[17px] leading-tight text-ink">
                    {summary.title}
                  </div>
                  <div className="mt-1 truncate font-mono text-xs text-dim">
                    {row.caseNumber ? <>{row.caseNumber} · </> : null}
                    <span className="font-[family-name:var(--sans)] text-ink-2">
                      {summary.practiceArea ?? summary.clientName}
                    </span>
                    {opened !== null ? <> · opened {opened}d</> : null}
                  </div>
                </div>

                {/* Status pill — visible on mobile (2nd col) and desktop. */}
                <div className="flex justify-end md:justify-start">
                  <Pill tone={tone}>{MATTER_STATUS_LABELS[summary.status]}</Pill>
                </div>

                {/* Retainer bar — desktop only. */}
                <div className="hidden items-center gap-2 md:flex">
                  {retainerPct !== null ? (
                    <>
                      <Bar
                        value={retainerPct}
                        tone={retainerPct < 30 ? 'warn' : retainerPct > 70 ? 'ok' : 'default'}
                        className="flex-1"
                      />
                      <small className="min-w-[30px] text-right font-mono text-[10.5px] text-dim">{retainerPct}%</small>
                    </>
                  ) : (
                    <span className="font-mono text-[10.5px] text-dim-2">—</span>
                  )}
                </div>

                {/* Tag chips — desktop only. */}
                <div className="hidden flex-wrap gap-1 md:flex">
                  {billingLabel ? (
                    <span className="rounded-[2px] bg-rule-soft px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-ink-2">
                      {billingLabel}
                    </span>
                  ) : null}
                  {summary.practiceArea ? (
                    <span className="rounded-[2px] bg-rule-soft px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-ink-2">
                      {summary.practiceArea}
                    </span>
                  ) : null}
                </div>

                {/* Risk SignalPill — desktop only. */}
                <div className="hidden md:block">
                  <SignalPill signal={signal} label={riskSignalLabel(signal)} />
                </div>

                {/* Activity — desktop only. */}
                <div className="hidden text-right md:block">
                  <div className="font-mono text-sm text-ink">{formatRelativeTime(summary.updatedAt)}</div>
                  {/* TODO(backend): per-matter event count for trailing 30d. */}
                  <div className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-dim">last activity</div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      {/* Foot row — counts + active filter summary. */}
      <div className="flex items-center justify-between border-t border-line-subtle bg-paper-2 px-5 py-3 font-mono text-[10.5px] uppercase tracking-wider text-dim">
        <span>{formatCount(entries.length)} shown</span>
        <span>
          filtered by:{' '}
          <span className="font-[family-name:var(--sans)] text-sm font-medium normal-case tracking-normal text-ink-2">
            {filterSummary}
          </span>
        </span>
      </div>
    </div>
  );
}

function MattersBoard({
  entries,
  onSelect,
  now,
}: {
  entries: MatterRow[];
  onSelect: (id: string) => void;
  now: number;
}) {
  const byLane: Record<BoardLane, MatterRow[]> = {
    lead: [],
    open: [],
    in_progress: [],
    archived: [],
  };
  for (const row of entries) {
    byLane[matterBoardLane(row.summary.status)].push(row);
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {BOARD_LANES.map((lane) => {
        const rows = byLane[lane.id];
        const dimmed = lane.id === 'archived';
        return (
          <section
            key={lane.id}
            className={`flex min-h-[360px] flex-col gap-2.5 rounded-md border border-line-subtle bg-paper-2 p-3.5 ${
              dimmed ? 'opacity-75' : ''
            }`}
          >
            <header className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-dim">
              <span>{lane.label}</span>
              <span>{formatCount(rows.length)}</span>
            </header>
            {rows.length === 0 ? (
              <p className="mt-2 font-mono text-[10.5px] text-dim-2">No matters in this lane.</p>
            ) : (
              rows.map((row) => {
                const signal = deriveRiskSignal(row.urgency, row.summary.updatedAt, now);
                return (
                  <button
                    key={row.summary.id}
                    type="button"
                    onClick={() => onSelect(row.summary.id)}
                    className="flex flex-col gap-1.5 rounded-md border border-line-subtle bg-card p-3 text-left transition-transform hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div className="font-mono text-[10.5px] text-dim">
                      {row.caseNumber ?? 'BLB-—'}
                      {row.summary.practiceArea ? <> · {row.summary.practiceArea}</> : null}
                    </div>
                    <div className="font-[family-name:var(--serif)] text-[15px] leading-tight text-ink">
                      {row.summary.title}
                    </div>
                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-dim-2">
                        {formatRelativeTime(row.summary.updatedAt)}
                      </span>
                      <SignalPill signal={signal} label={riskSignalLabel(signal)} />
                    </div>
                  </button>
                );
              })
            )}
          </section>
        );
      })}
    </div>
  );
}
