import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { PageHeader } from '@/shared/ui/layout/PageHeader';
import { Page } from '@/shared/ui/layout/Page';
import { WorkspacePlaceholderState } from '@/shared/ui/layout/WorkspacePlaceholderState';
import { Button } from '@/shared/ui/Button';
import { CurrencyInput, Input } from '@/shared/ui/input';
import { Seg } from '@/design-system/patterns';
import { EntityList } from '@/shared/ui/list/EntityList';
import { type TimelineItem, type TimelinePerson } from '@/shared/ui/activity/ActivityTimeline';
import { Dialog, DialogBody } from '@/shared/ui/dialog';
import { Folder, SquarePen, Plus } from 'lucide-preact';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';

import { MATTER_STATUS_LABELS, type MatterStatus } from '@/shared/types/matterStatus';
import {
  type MatterDetail,
  type MatterExpense,
  type MatterOption,
  type MatterTask,
  type TimeEntry
} from '@/features/matters/data/matterTypes';
import { MatterEditForm, type MatterFormState } from '@/features/matters/components/MatterForm';
import { TimeEntryForm, type TimeEntryFormValues } from '@/features/matters/components/time-entries/TimeEntryForm';
import type { MatterTaskFormValues } from '@/features/matters/components/tasks/MatterTaskForm';
import {
  MatterDetailPanel,
  type DetailSectionId
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

const matterStatusBadgeClass = (status: MatterStatus): string => {
  const base = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap';
  if (ACTIVE_STATUSES.has(status)) return `${base} status-success`;
  if (status === 'closed' || DECLINED_STATUSES.has(status)) {
    return `${base} border border-line-subtle bg-paper-2 text-dim-2`;
  }
  return `${base} status-warning`;
};

type MatterFilterCategory = 'all' | 'new' | 'active' | 'closing' | 'closed' | 'declined';

const MATTER_FILTER_CATEGORIES: ReadonlyArray<{ id: MatterFilterCategory; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'new', label: 'New' },
  { id: 'active', label: 'Active' },
  { id: 'closing', label: 'Closing' },
  { id: 'closed', label: 'Closed' },
  { id: 'declined', label: 'Declined' },
];

const matterStatusCategory = (status: MatterStatus): Exclude<MatterFilterCategory, 'all'> => {
  if (status === 'closed') return 'closed';
  if (DECLINED_STATUSES.has(status)) return 'declined';
  if (ACTIVE_STATUSES.has(status)) return 'active';
  if (CLOSING_STATUSES.has(status)) return 'closing';
  return 'new';
};

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

  // ── List view state ──────────────────────────────────────────────────────
  const [matterCategoryFilter, setMatterCategoryFilter] = useState<MatterFilterCategory>('all');
  const [isShortcutsHelpOpen, setIsShortcutsHelpOpen] = useState(false);

  // ── Keyboard shortcuts ───────────────────────────────────────────────────
  // N = new matter, Esc = reset mobile filter, ? = show help. Shortcuts are
  // skipped while the user is typing so character entry isn't hijacked.
  // Mirrors the Cmd+K pattern in CommandPaletteContext.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === 'Escape') {
        if (matterCategoryFilter !== 'all') {
          event.preventDefault();
          setMatterCategoryFilter('all');
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
  }, [activePracticeId, navigate, basePath, location.url, matterCategoryFilter]);

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
    enabled: Boolean(activePracticeId && selectedMatterId && detailSection === 'billing')
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
  const matterEntries = useMemo(() => matters.map((m) => ({
    summary: toMatterSummary(m, { clientNameById, serviceNameById }),
    assigneeIds: extractAssigneeIds(m)
  })), [matters, clientNameById, serviceNameById]);

  const statusFilteredMatterEntries = useMemo(() => {
    if (!statusFilter || statusFilter.length === 0) return matterEntries;
    const accepted = new Set(statusFilter.map((value) => value.toLowerCase()));
    return matterEntries.filter((entry) => accepted.has(entry.summary.status.toLowerCase()));
  }, [matterEntries, statusFilter]);
  const matterSummaries = useMemo(() => statusFilteredMatterEntries.map((e) => e.summary), [statusFilteredMatterEntries]);

  const filteredMatters = statusFilteredMatterEntries;

  const sortedMatterSummaries = useMemo(() => {
    return [...filteredMatters]
      .sort((a, b) => new Date(b.summary.updatedAt).getTime() - new Date(a.summary.updatedAt).getTime())
      .map((e) => e.summary);
  }, [filteredMatters]);

  const selectedMatterSummary = useMemo(
    () => selectedMatterId ? matterSummaries.find((m) => m.id === selectedMatterId) ?? null : null,
    [matterSummaries, selectedMatterId]
  );
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
    return (
      <>
        <MatterDetailPanel
          matterId={selectedMatterId}
          detailSection={detailSection}
          onSectionChange={(next) => {
            if (next === 'overview') goToDetail(selectedMatterDetail.id, null);
            else goToDetail(selectedMatterDetail.id, next);
          }}
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
            onViewFiles: () => goToDetail(selectedMatterDetail.id, 'files')
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
  // Render — list route (default): full-width matters table
  // =========================================================================
  if (renderMode === 'detailOnly') {
    return null;
  }

  const handleNewMatter = () => navigate(`${basePath}/new?returnTo=${encodeURIComponent(location.url)}`);
  const showLoading = mattersLoading || clientsLoading;

  const filteredMatterSummaries = matterCategoryFilter === 'all'
    ? sortedMatterSummaries
    : sortedMatterSummaries.filter((matter) => matterStatusCategory(matter.status) === matterCategoryFilter);

  const showEmpty = !showLoading && !mattersError && sortedMatterSummaries.length === 0;
  const showFilteredEmpty = !showLoading && !mattersError && sortedMatterSummaries.length > 0 && filteredMatterSummaries.length === 0;
  const filteredEmptyMessage = (() => {
      switch (matterCategoryFilter) {
        case 'new': return 'No new matters waiting.';
        case 'active': return 'No active matters right now. Quiet day.';
        case 'closing': return 'No matters in closing.';
        case 'closed': return 'No closed matters yet.';
        case 'declined': return 'No declined matters — clean intake.';
        default: return 'No matters match the selected filter.';
      }
    })();

  return (
    <div className="flex h-full min-h-0 flex-col">
      {isClientListTruncated && (
        <div className="px-6 pt-4">
          <WarningBanner>
            <strong>Warning:</strong> The contacts list is incomplete. Some names or options may be missing.
          </WarningBanner>
        </div>
      )}

      {mattersError && (
        <div className="px-6 pt-4">
          <ErrorBanner>{mattersError}</ErrorBanner>
        </div>
      )}

      <header className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
        <Seg<MatterFilterCategory>
          value={matterCategoryFilter}
          options={MATTER_FILTER_CATEGORIES.map((category) => ({
            value: category.id,
            label: category.label,
          }))}
          onChange={setMatterCategoryFilter}
          ariaLabel="Filter matters by status"
          className="w-full sm:w-auto sm:min-w-[32rem]"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsShortcutsHelpOpen(true)}
            aria-label="Show keyboard shortcuts"
            className="hidden h-8 w-8 items-center justify-center rounded-full text-dim-2 transition-colors hover:bg-paper-2 hover:text-ink md:inline-flex"
          >
            <span className="text-sm font-semibold">?</span>
          </button>
          <Button
            size="sm"
            variant="primary"
            icon={Plus}
            onClick={handleNewMatter}
            disabled={!activePracticeId}
          >
            New Matter
            <kbd className="ml-2 hidden rounded border border-line-utility bg-paper-2 px-1.5 py-0.5 text-[10px] font-medium text-dim-2 md:inline">
              N
            </kbd>
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto px-6 pb-6 pt-4">
        {showEmpty ? (
          <EmptyState onCreate={handleNewMatter} disableCreate={!activePracticeId} />
        ) : showFilteredEmpty ? (
          <div className="px-2 py-8 text-sm text-dim-2">
            {filteredEmptyMessage}
          </div>
        ) : (
          <EntityList
            items={filteredMatterSummaries}
            onSelect={(matter) => goToDetail(matter.id)}
            isLoading={showLoading}
            className="panel overflow-hidden"
            renderItem={(matter) => (
              <div className="flex w-full items-center gap-4 px-4 py-3 hover:bg-paper-2/10">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                  {matter.title}
                </span>
                <span className="hidden min-w-[140px] truncate text-sm text-dim-2 sm:block">
                  {matter.clientName}
                </span>
                <span className="hidden min-w-[140px] truncate text-sm text-dim-2 md:block">
                  {matter.practiceArea ?? '—'}
                </span>
                <span className={`min-w-[80px] text-sm ${matterStatusBadgeClass(matter.status)}`}>
                  {MATTER_STATUS_LABELS[matter.status]}
                </span>
                <span className="hidden min-w-[80px] text-right text-sm tabular-nums text-dim-2 sm:block">
                  {formatRelativeTime(matter.createdAt)}
                </span>
              </div>
            )}
          />
        )}
      </div>

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
                { key: 'Esc', desc: 'Reset mobile filter' },
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
