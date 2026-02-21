import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { PageHeader } from '@/shared/ui/layout/PageHeader';
import { Page } from '@/shared/ui/layout/Page';
import { Panel } from '@/shared/ui/layout/Panel';
import { Tabs, type TabItem } from '@/shared/ui/tabs/Tabs';
import { Button } from '@/shared/ui/Button';
import { Breadcrumbs } from '@/shared/ui/navigation';
import { MarkdownUploadTextarea } from '@/shared/ui/input/MarkdownUploadTextarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/shared/ui/dropdown';
import { ActivityTimeline, type TimelineItem, type TimelinePerson } from '@/shared/ui/activity/ActivityTimeline';
import Modal from '@/shared/components/Modal';
import { ChevronUpDownIcon, FolderIcon, PencilIcon, PlusIcon } from '@heroicons/react/24/outline';
import { MATTER_WORKFLOW_STATUSES, type MatterStatus } from '@/shared/types/matterStatus';
import {
  type MatterDetail,
  type MatterExpense,
  type MatterOption,
  type MatterSummary,
  type TimeEntry
} from '@/features/matters/data/matterTypes';
import { MatterCreateForm, type MatterFormState } from '@/features/matters/components/MatterCreateModal';
import { MatterDetailsPanel } from '@/features/matters/components/MatterDetailPanel';
import { MatterListItem } from '@/features/matters/components/MatterListItem';
import { TimeEntriesPanel } from '@/features/matters/components/time-entries/TimeEntriesPanel';
import { TimeEntryForm, type TimeEntryFormValues } from '@/features/matters/components/time-entries/TimeEntryForm';
import { MatterExpensesPanel } from '@/features/matters/components/expenses/MatterExpensesPanel';
import { MatterMessagesPanel } from '@/features/matters/components/messages/MatterMessagesPanel';
import { MatterMilestonesPanel } from '@/features/matters/components/milestones/MatterMilestonesPanel';
import { MatterSummaryCards } from '@/features/matters/components/MatterSummaryCards';
import { MatterDetailHeader } from '@/features/matters/components/MatterDetailHeader';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { usePracticeDetails } from '@/shared/hooks/usePracticeDetails';
import { type MajorAmount } from '@/shared/utils/money';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { formatLongDate } from '@/shared/utils/dateFormatter';
import {
  createMatter,
  getMatter,
  getMatterActivity,
  listMatters,
  updateMatter,
  type BackendMatter,
  type BackendMatterActivity,
  type BackendMatterTimeStats,
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
  listMatterTimeEntries,
  reorderMatterMilestones,
  updateMatterExpense,
  updateMatterMilestone,
  updateMatterTimeEntry
} from '@/features/matters/services/mattersApi';
import { listUserDetails, type UserDetailRecord } from '@/shared/lib/apiClient';
import {
  buildActivityTimelineItem,
  buildCreatePayload,
  buildFormStateFromDetail,
  buildNoteTimelineItem,
  buildUpdatePayload,
  extractAssigneeIds,
  isClosedStatus,
  isEmailLike,
  isUuid,
  prunePayload,
  resolveClientLabel,
  resolveOptionLabel,
  sortByTimestamp,
  statusOrder,
  toExpense,
  toMatterDetail,
  toMatterSummary,
  toMilestone,
  toTimeEntry
} from '@/features/matters/utils/matterUtils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MatterTabId = 'all' | 'open' | 'closed';
type DetailTabId = 'overview' | 'time' | 'messages';
type SortOption = 'updated' | 'title' | 'status' | 'client' | 'assigned' | 'practice_area';
type IntakeTriageStatus = 'pending_review' | 'accepted' | 'declined' | string;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SORT_LABELS: Record<SortOption, string> = {
  updated: 'Date updated',
  title: 'Title',
  status: 'Status',
  client: 'Client',
  assigned: 'Assigned',
  practice_area: 'Practice area'
};

const TAB_HEADINGS: Record<MatterTabId, string> = {
  all: 'All',
  open: 'Open',
  closed: 'Closed'
};

const DETAIL_TABS: Array<{ id: DetailTabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'time', label: 'Billing' },
  { id: 'messages', label: 'Messages' }
];

const buildTabs = (counts: { open: number; closed: number; all: number }): TabItem[] => [
  { id: 'all', label: 'All', count: counts.all },
  { id: 'open', label: 'Open', count: counts.open },
  { id: 'closed', label: 'Closed', count: counts.closed }
];

const PAGE_SIZE = 50;

const resolveQueryValue = (value?: string | string[] | null) => {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
};

// ---------------------------------------------------------------------------
// Small local components
// ---------------------------------------------------------------------------

const EmptyState = ({ onCreate, disableCreate }: { onCreate?: () => void; disableCreate?: boolean }) => (
  <div className="flex h-full items-center justify-center p-8">
    <div className="max-w-md text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.08] ring-1 ring-white/[0.12]">
        <FolderIcon className="h-6 w-6 text-input-text/70" aria-hidden="true" />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-input-text">No matters yet</h3>
      <p className="mt-2 text-sm text-input-placeholder">
        Create your first matter to start tracking progress and milestones.
      </p>
      <div className="mt-6 flex justify-center">
        <Button size="sm" icon={<PlusIcon className="h-4 w-4" />} onClick={onCreate} disabled={disableCreate}>
          Add Matter
        </Button>
      </div>
    </div>
  </div>
);

const LoadingState = ({ message }: { message: string }) => (
  <div className="flex h-full items-center justify-center p-8 text-sm text-input-placeholder">
    {message}
  </div>
);

// ---------------------------------------------------------------------------
// Detail field row — shared between overview grid cells
// ---------------------------------------------------------------------------
const DetailField = ({ label, value }: { label: string; value: string }) => (
  <div>
    <p className="text-xs font-medium uppercase tracking-wide text-input-placeholder">{label}</p>
    <p className="mt-1 text-sm text-input-text">{value || '—'}</p>
  </div>
);

// ---------------------------------------------------------------------------
// Error / warning banners — token-compliant
// ---------------------------------------------------------------------------
const WarningBanner = ({ children }: { children: preact.ComponentChildren }) => (
  <div className="status-warning rounded-xl px-4 py-3 text-sm">{children}</div>
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
      <section className="glass-panel p-6">
        <p className="text-sm text-input-placeholder">
          We could not find a matter with the ID{' '}
          <span className="font-mono text-input-text">{matterId}</span>{' '}
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
};

export const PracticeMattersPage = ({ basePath = '/practice/matters' }: PracticeMattersPageProps) => {
  const location = useLocation();
  const { activePracticeId, session } = useSessionContext();
  const { showError } = useToastContext();

  // ── Routing ──────────────────────────────────────────────────────────────
  const pathSuffix = location.path.startsWith(basePath) ? location.path.slice(basePath.length) : '';
  const pathSegments = pathSuffix.replace(/^\/+/, '').split('/').filter(Boolean);
  const firstSegment = pathSegments[0] ?? '';
  const secondSegment = pathSegments[1] ?? '';
  const isCreateRoute = firstSegment === 'new';
  const selectedMatterId = firstSegment && firstSegment !== 'activity' && firstSegment !== 'new'
    ? decodeURIComponent(firstSegment)
    : null;
  const convertIntakeUuid = useMemo(
    () => resolveQueryValue(location.query?.convertIntake),
    [location.query?.convertIntake]
  );
  const conversationBasePath = basePath.endsWith('/matters')
    ? basePath.replace(/\/matters$/, '/conversations')
    : '/practice/conversations';

  const navigate = (path: string) => location.route(path);
  const goToList = () => navigate(basePath);
  const goToDetail = (id: string) => navigate(`${basePath}/${encodeURIComponent(id)}`);

  // ── External hooks ────────────────────────────────────────────────────────
  const { getMembers, fetchMembers } = usePracticeManagement({
    autoFetchPractices: false,
    fetchInvitations: false,
    fetchPracticeDetails: false
  });
  const {
    details: practiceDetails,
    hasDetails: hasPracticeDetails,
    fetchDetails: fetchPracticeDetails
  } = usePracticeDetails(activePracticeId);

  // ── List state ────────────────────────────────────────────────────────────
  const [matters, setMatters] = useState<BackendMatter[]>([]);
  const [mattersLoading, setMattersLoading] = useState(false);
  const [mattersError, setMattersError] = useState<string | null>(null);
  const [mattersRefreshKey, setMattersRefreshKey] = useState(0);
  const [mattersPage, setMattersPage] = useState(1);
  const [mattersHasMore, setMattersHasMore] = useState(true);
  const [mattersLoadingMore, setMattersLoadingMore] = useState(false);
  const [activeTab, setActiveTab] = useState<MatterTabId>('all');
  const [sortOption, setSortOption] = useState<SortOption>('updated');

  // ── Detail state ──────────────────────────────────────────────────────────
  const [selectedMatterDetail, setSelectedMatterDetail] = useState<MatterDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTabId>('overview');

  // ── Activity / notes ──────────────────────────────────────────────────────
  const [activityItems, setActivityItems] = useState<TimelineItem[]>([]);
  const [noteItems, setNoteItems] = useState<TimelineItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

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

  // ── Client / service / assignee options ───────────────────────────────────
  const [clientOptions, setClientOptions] = useState<MatterOption[]>([]);
  const [isClientListTruncated, setIsClientListTruncated] = useState(false);
  const [servicesLoading, setServicesLoading] = useState(false);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [isQuickTimeEntryOpen, setIsQuickTimeEntryOpen] = useState(false);
  const [quickTimeEntryKey, setQuickTimeEntryKey] = useState(0);
  const [isDescriptionEditing, setIsDescriptionEditing] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [isSavingDescription, setIsSavingDescription] = useState(false);
  const [convertInitialValues, setConvertInitialValues] = useState<Partial<MatterFormState> | undefined>(undefined);
  const [convertLoading, setConvertLoading] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const isMounted = useRef(true);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const practiceDetailsRequestedRef = useRef<string | null>(null);
  const refreshRequestIdRef = useRef(0);
  const createdMatterIdRef = useRef<string | null>(null);

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
    if (!activePracticeId) return [];
    return getMembers(activePracticeId)
      .filter((m) => m.role !== 'member' && m.role !== 'client')
      .map((m) => ({
        id: m.userId,
        name: m.name ?? m.email,
        email: m.email,
        image: m.image ?? undefined,
        role: m.role
      }));
  }, [activePracticeId, getMembers]);

  const assigneeNameById = useMemo(
    () => new Map(assigneeOptions.map((a) => [a.id, a.name])),
    [assigneeOptions]
  );

  const serviceNameById = useMemo(
    () => new Map(practiceAreaOptions.map((s) => [s.id, s.name])),
    [practiceAreaOptions]
  );

  const membersById = useMemo(() => {
    if (!activePracticeId) return new Map<string, { name: string; email?: string | null; image?: string | null }>();
    return new Map(
      getMembers(activePracticeId).map((m) => [
        m.userId,
        { name: m.name ?? '', email: m.email ?? null, image: m.image }
      ])
    );
  }, [activePracticeId, getMembers]);

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

  // ── Data fetching: members ────────────────────────────────────────────────
  useEffect(() => {
    if (!activePracticeId) return;
    void fetchMembers(activePracticeId, { force: false });
  }, [activePracticeId, fetchMembers]);

  // ── Data fetching: clients (paginated) ────────────────────────────────────
  const buildClientOption = useCallback((detail: UserDetailRecord): MatterOption => ({
    id: detail.id,
    name: detail.user?.name?.trim() || detail.user?.email?.trim() || detail.user?.phone?.trim() || 'Unknown Client',
    email: detail.user?.email ?? undefined,
    role: 'client',
    status: detail.status
  }), []);

  useEffect(() => {
    if (!activePracticeId) {
      setClientOptions([]);
      setIsClientListTruncated(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    const fetchAllClients = async () => {
      setIsClientListTruncated(false);
      let offset = 0;
      const limit = 100;
      const allClients: MatterOption[] = [];
      let hasMore = true;
      let lastTotal = 0;
      const MAX_PAGES = 100;
      let iterations = 0;

      try {
        while (hasMore && !cancelled && !controller.signal.aborted && iterations < MAX_PAGES) {
          iterations++;
          const response = await listUserDetails(activePracticeId, { limit, offset, signal: controller.signal });
          if (cancelled || controller.signal.aborted) break;

          allClients.push(...response.data.map(buildClientOption));
          lastTotal = response.total ?? 0;
          hasMore = lastTotal > 0 ? allClients.length < lastTotal : response.data.length === limit;
          if (hasMore) offset += limit;
        }

        if (!cancelled && !controller.signal.aborted) {
          setClientOptions(allClients);
          setIsClientListTruncated(iterations >= MAX_PAGES || lastTotal > allClients.length);
        }
      } catch (error) {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return;
        if (!cancelled) {
          console.error('[PracticeMattersPage] Failed to load clients', error);
          setClientOptions(allClients);
          setIsClientListTruncated(true);
          showError('Failed to load full client list', 'Some clients may be missing.');
        }
      }
    };

    void fetchAllClients();
    return () => { cancelled = true; controller.abort(); };
  }, [activePracticeId, buildClientOption, showError]);

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

    const controller = new AbortController();
    setConvertLoading(true);
    setConvertError(null);

    fetch(`/api/practice/${encodeURIComponent(activePracticeId)}/client-intakes/${encodeURIComponent(convertIntakeUuid)}/status`, {
      credentials: 'include',
      signal: controller.signal
    })
      .then(async (response) => {
        if (!response.ok) {
          let errData: { message?: string; error?: string } = {};
          try {
            const jsonBody = await response.json();
            errData = jsonBody as { message?: string; error?: string };
          } catch {
            const textBody = await response.text();
            const message = textBody || `Failed to load intake (HTTP ${response.status})`;
            throw new Error(message);
          }
          throw new Error(errData.message ?? errData.error ?? `Failed to load intake (HTTP ${response.status})`);
        }
        const payload = await response.json() as {
          success?: boolean;
          data?: {
            description?: string;
            opposing_party?: string;
            urgency?: MatterFormState['urgency'];
            triage_status?: IntakeTriageStatus;
          };
        };
        const intake = payload.data ?? {};
        setConvertInitialValues({
          description: typeof intake.description === 'string' ? intake.description : '',
          opposingParty: typeof intake.opposing_party === 'string' ? intake.opposing_party : '',
          urgency: intake.urgency === 'routine' || intake.urgency === 'time_sensitive' || intake.urgency === 'emergency'
            ? intake.urgency
            : '',
          status: 'engagement_pending',
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

  // ── Data fetching: matters list ───────────────────────────────────────────
  useEffect(() => {
    if (!activePracticeId) {
      setMatters([]);
      setMattersError(null);
      setMattersLoading(false);
      setMattersHasMore(true);
      setMattersPage(1);
      return;
    }

    const controller = new AbortController();
    setMattersLoading(true);
    setMattersError(null);
    setMattersHasMore(true);
    setMattersPage(1);

    listMatters(activePracticeId, { signal: controller.signal, page: 1, limit: PAGE_SIZE })
      .then((items) => {
        setMatters(items);
        setMattersHasMore(items.length === PAGE_SIZE);
      })
      .catch((error: unknown) => {
        if ((error as DOMException).name === 'AbortError') return;
        setMattersError(error instanceof Error ? error.message : 'Failed to load matters');
      })
      .finally(() => setMattersLoading(false));

    return () => controller.abort();
  }, [activePracticeId, mattersRefreshKey]);

  const refreshMatters = useCallback(() => setMattersRefreshKey((prev) => prev + 1), []);

  const loadMoreMatters = useCallback(async () => {
    if (!activePracticeId || mattersLoadingMore || mattersLoading || !mattersHasMore) return;
    const nextPage = mattersPage + 1;
    setMattersLoadingMore(true);
    try {
      const items = await listMatters(activePracticeId, { page: nextPage, limit: PAGE_SIZE });
      setMatters((prev) => [...prev, ...items]);
      setMattersPage(nextPage);
      setMattersHasMore(items.length === PAGE_SIZE);
    } catch (error) {
      console.error('[PracticeMattersPage] Failed to load more matters', error);
      showError('Could not load more matters', 'Please try again.');
    } finally {
      setMattersLoadingMore(false);
    }
  }, [activePracticeId, mattersHasMore, mattersLoading, mattersLoadingMore, mattersPage, showError]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !mattersHasMore || mattersLoading || mattersLoadingMore) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) void loadMoreMatters(); },
      { rootMargin: '200px' }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [loadMoreMatters, mattersHasMore, mattersLoading, mattersLoadingMore]);

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
        setSelectedMatterDetail(matter ? toMatterDetail(matter, { clientNameById, serviceNameById }) : null);
      })
      .catch((error: unknown) => {
        if ((error as DOMException).name === 'AbortError') return;
        setDetailError(error instanceof Error ? error.message : 'Failed to load matter');
      })
      .finally(() => setDetailLoading(false));

    return () => controller.abort();
  }, [activePracticeId, selectedMatterId, clientNameById, serviceNameById]);

  // ── Data fetching: activity ───────────────────────────────────────────────
  useEffect(() => {
    if (!activePracticeId || !selectedMatterId) {
      setActivityItems([]);
      setActivityLoading(false);
      return;
    }

    const controller = new AbortController();
    setActivityLoading(true);

    getMatterActivity(activePracticeId, selectedMatterId, { signal: controller.signal })
      .then((items) => {
        const filtered = items.filter((item) => !String(item.action ?? '').startsWith('note_'));
        setActivityItems(sortByTimestamp(filtered).map((item) => toActivityItem(item, items)));
      })
      .catch((error: unknown) => {
        if ((error as DOMException).name === 'AbortError') return;
        console.warn('[PracticeMattersPage] Failed to load activity', error);
        setActivityItems([]);
      })
      .finally(() => setActivityLoading(false));

    return () => controller.abort();
  }, [activePracticeId, selectedMatterId, toActivityItem]);

  // ── Data fetching: notes ──────────────────────────────────────────────────
  useEffect(() => {
    if (!activePracticeId || !selectedMatterId) { setNoteItems([]); return; }

    const controller = new AbortController();
    listMatterNotes(activePracticeId, selectedMatterId, { signal: controller.signal })
      .then((items) => setNoteItems(sortByTimestamp(items).map(toNoteItem)))
      .catch((error: unknown) => {
        if ((error as DOMException).name === 'AbortError') return;
        console.warn('[PracticeMattersPage] Failed to load notes', error);
        setNoteItems([]);
      });

    return () => controller.abort();
  }, [activePracticeId, selectedMatterId, toNoteItem]);

  // ── Data fetching: time entries ───────────────────────────────────────────
  useEffect(() => {
    if (!activePracticeId || !selectedMatterId) {
      setTimeEntries([]); setTimeEntriesError(null); setTimeEntriesLoading(false); setTimeStats(null);
      return;
    }

    const controller = new AbortController();
    setTimeEntriesLoading(true);
    setTimeEntriesError(null);

    Promise.all([
      listMatterTimeEntries(activePracticeId, selectedMatterId, { signal: controller.signal }),
      getMatterTimeEntryStats(activePracticeId, selectedMatterId, { signal: controller.signal })
    ])
      .then(([entries, stats]) => { setTimeEntries(entries.map(toTimeEntry)); setTimeStats(stats); })
      .catch((error: unknown) => {
        if ((error as DOMException).name === 'AbortError') return;
        setTimeEntriesError(error instanceof Error ? error.message : 'Failed to load time entries');
      })
      .finally(() => setTimeEntriesLoading(false));

    return () => controller.abort();
  }, [activePracticeId, selectedMatterId]);

  // ── Data fetching: expenses ───────────────────────────────────────────────
  useEffect(() => {
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
  }, [activePracticeId, selectedMatterId]);

  // ── Data fetching: milestones ─────────────────────────────────────────────
  useEffect(() => {
    if (!activePracticeId || !selectedMatterId) {
      setMilestones([]); setMilestonesError(null); setMilestonesLoading(false);
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
  }, [activePracticeId, selectedMatterId]);

  // ── Refresh helpers ───────────────────────────────────────────────────────
  const refreshSelectedMatter = useCallback(async () => {
    if (!activePracticeId || !selectedMatterId) return;
    const requestId = ++refreshRequestIdRef.current;

    try {
      const activities = await getMatterActivity(activePracticeId, selectedMatterId);
      if (requestId !== refreshRequestIdRef.current || !isMounted.current) return;
      const filtered = (activities ?? []).filter((item) => !String(item.action ?? '').startsWith('note_'));
      setActivityItems(sortByTimestamp(filtered).map((item) => toActivityItem(item, activities ?? [])));
    } catch (error) {
      console.warn('[PracticeMattersPage] Failed to refresh activity', error);
    }

    try {
      const refreshed = await getMatter(activePracticeId, selectedMatterId);
      if (requestId !== refreshRequestIdRef.current || !isMounted.current) return;
      if (refreshed) {
        setSelectedMatterDetail(toMatterDetail(refreshed, { clientNameById, serviceNameById }));
      }
    } catch (error) {
      console.warn('[PracticeMattersPage] Failed to refresh matter detail', error);
    }
  }, [activePracticeId, selectedMatterId, clientNameById, serviceNameById, toActivityItem]);

  // ── Matter CRUD ───────────────────────────────────────────────────────────
  const handleCreateMatter = useCallback(async (values: MatterFormState) => {
    if (!activePracticeId) throw new Error('Practice ID is required to create a matter.');
    if (values.clientId && !isUuid(values.clientId)) throw new Error(`Invalid client_id UUID: "${values.clientId}"`);
    if (values.practiceAreaId && !isUuid(values.practiceAreaId)) throw new Error(`Invalid practice_service_id UUID: "${values.practiceAreaId}"`);

    const created = await createMatter(activePracticeId, prunePayload(buildCreatePayload(values)));
    refreshMatters();
    createdMatterIdRef.current = created?.id ?? null;
  }, [activePracticeId, refreshMatters]);

  const handleConvertIntake = useCallback(async (values: MatterFormState) => {
    if (!activePracticeId || !convertIntakeUuid) {
      throw new Error('Practice ID and intake UUID are required to convert an intake.');
    }

    const response = await fetch(
      `/api/practice/${encodeURIComponent(activePracticeId)}/client-intakes/${encodeURIComponent(convertIntakeUuid)}/convert`,
      {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billing_type: values.billingType || undefined,
          responsible_attorney_id: values.responsibleAttorneyId || undefined,
          practice_service_id: values.practiceAreaId || undefined,
          title: values.title || undefined,
          status: values.status || 'engagement_pending',
          open_date: values.openDate || undefined,
        })
      }
    );

    if (!response.ok) {
      let err: { message?: string; error?: string } = {};
      try {
        const jsonBody = await response.json();
        err = jsonBody as { message?: string; error?: string };
      } catch {
        const textBody = await response.text();
        const message = textBody || `Intake conversion failed (HTTP ${response.status})`;
        throw new Error(message);
      }
      throw new Error(err.message ?? err.error ?? `Intake conversion failed (HTTP ${response.status})`);
    }

    const payload = await response.json() as {
      matter?: { id?: string };
      data?: { matter?: { id?: string } };
    };
    const matterId = payload.matter?.id ?? payload.data?.matter?.id;
    if (!matterId) {
      throw new Error('Intake conversion response did not include a matter ID.');
    }

    refreshMatters();
    createdMatterIdRef.current = matterId;
  }, [activePracticeId, convertIntakeUuid, refreshMatters]);

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

  // ── Description edit handlers ─────────────────────────────────────────────
  const startDescriptionEdit = useCallback(() => {
    if (!selectedMatterDetail) return;
    setDescriptionDraft(selectedMatterDetail.description ?? '');
    setIsDescriptionEditing(true);
  }, [selectedMatterDetail]);

  const cancelDescriptionEdit = useCallback(() => {
    setIsDescriptionEditing(false);
    setDescriptionDraft('');
  }, []);

  const saveDescription = useCallback(async () => {
    if (!selectedMatterDetail || !activePracticeId) return;
    setIsSavingDescription(true);
    try {
      await handleUpdateMatter(buildFormStateFromDetail(selectedMatterDetail, { description: descriptionDraft }));
      setIsDescriptionEditing(false);
      setDescriptionDraft('');
    } catch (error) {
      console.error('[PracticeMattersPage] Failed to update description', error);
      showError('Could not save description', 'Please try again.');
    } finally {
      setIsSavingDescription(false);
    }
  }, [selectedMatterDetail, activePracticeId, descriptionDraft, handleUpdateMatter, showError]);

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
          start_time: values.startTime, end_time: values.endTime, description: values.description, billable: true
        });
      } else {
        await createMatterTimeEntry(activePracticeId, selectedMatterId, {
          start_time: values.startTime, end_time: values.endTime, description: values.description, billable: true
        });
      }
      await refreshTimeEntries();
    } catch (error) {
      console.error('[PracticeMattersPage] Failed to save time entry', error);
      showError('Could not save time entry', 'Please try again.');
    }
  }, [activePracticeId, selectedMatterId, refreshTimeEntries, showError]);

  const handleDeleteTimeEntry = useCallback(async (entry: TimeEntry) => {
    if (!activePracticeId || !selectedMatterId) throw new Error('IDs required');
    try {
      await deleteMatterTimeEntry(activePracticeId, selectedMatterId, entry.id);
      await refreshTimeEntries();
    } catch (error) {
      console.error('[PracticeMattersPage] Failed to delete time entry', error);
      showError('Could not delete time entry', 'Please try again.');
    }
  }, [activePracticeId, selectedMatterId, refreshTimeEntries, showError]);

  const handleQuickTimeSubmit = useCallback(async (values: TimeEntryFormValues) => {
    if (!activePracticeId || !selectedMatterId) return;
    try {
      await createMatterTimeEntry(activePracticeId, selectedMatterId, {
        start_time: values.startTime, end_time: values.endTime, description: values.description, billable: true
      });
      await refreshTimeEntries();
      setIsQuickTimeEntryOpen(false);
    } catch (error) {
      console.error('[PracticeMattersPage] Failed to save quick time entry', error);
      showError('Could not save time entry', 'Please try again.');
    }
  }, [activePracticeId, selectedMatterId, refreshTimeEntries, showError]);

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
  }, [activePracticeId, selectedMatterId, refreshExpenses]);

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
    } catch (error) {
      console.error('[PracticeMattersPage] Failed to update expense', error);
      showError('Could not update expense', 'Please try again.');
      setExpensesError('Unable to update expense.');
      await refreshExpenses().catch(console.error);
      throw error;
    }
  }, [activePracticeId, selectedMatterId, refreshExpenses, showError]);

  const handleDeleteExpense = useCallback(async (expense: MatterExpense) => {
    if (!activePracticeId || !selectedMatterId) throw new Error('IDs required');
    try {
      await deleteMatterExpense(activePracticeId, selectedMatterId, expense.id);
      setExpenses((prev) => prev.filter((item) => item.id !== expense.id));
      setExpensesError(null);
    } catch (error) {
      console.error('[PracticeMattersPage] Failed to delete expense', error);
      showError('Could not delete expense', 'Please try again.');
      setExpensesError('Unable to delete expense.');
      await refreshExpenses().catch(console.error);
      throw error;
    }
  }, [activePracticeId, selectedMatterId, refreshExpenses, showError]);

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
    if (created) setNoteItems((prev) => [...prev, toNoteItem(created)]);
  }, [activePracticeId, selectedMatterId, toNoteItem]);

  // ── Derived list data ─────────────────────────────────────────────────────
  const matterEntries = useMemo(() => matters.map((m) => ({
    summary: toMatterSummary(m, { clientNameById, serviceNameById }),
    assigneeIds: extractAssigneeIds(m)
  })), [matters, clientNameById, serviceNameById]);

  const matterSummaries = useMemo(() => matterEntries.map((e) => e.summary), [matterEntries]);

  const counts = useMemo(() => {
    const all = matterSummaries.length;
    const closed = matterSummaries.filter((m) => isClosedStatus(m.status)).length;
    return { all, closed, open: all - closed };
  }, [matterSummaries]);

  const tabs = useMemo(() => buildTabs(counts), [counts]);

  const filteredMatters = useMemo(() => {
    if (activeTab === 'all') return matterEntries;
    if (activeTab === 'open') return matterEntries.filter((e) => !isClosedStatus(e.summary.status));
    return matterEntries.filter((e) => isClosedStatus(e.summary.status));
  }, [activeTab, matterEntries]);

  const sortedMatterSummaries = useMemo(() => {
    const entries = [...filteredMatters];
    if (sortOption === 'title') entries.sort((a, b) => a.summary.title.localeCompare(b.summary.title));
    else if (sortOption === 'status') entries.sort((a, b) => statusOrder[a.summary.status] - statusOrder[b.summary.status]);
    else if (sortOption === 'client') entries.sort((a, b) => a.summary.clientName.localeCompare(b.summary.clientName));
    else if (sortOption === 'practice_area') entries.sort((a, b) => (a.summary.practiceArea ?? '').localeCompare(b.summary.practiceArea ?? ''));
    else if (sortOption === 'assigned') {
      entries.sort((a, b) => {
        const aName = a.assigneeIds[0] ? assigneeNameById.get(a.assigneeIds[0]) ?? '' : '';
        const bName = b.assigneeIds[0] ? assigneeNameById.get(b.assigneeIds[0]) ?? '' : '';
        return aName.localeCompare(bName);
      });
    } else {
      entries.sort((a, b) => new Date(b.summary.updatedAt).getTime() - new Date(a.summary.updatedAt).getTime());
    }
    return entries.map((e) => e.summary);
  }, [filteredMatters, sortOption, assigneeNameById]);

  const selectedMatterSummary = useMemo(
    () => selectedMatterId ? matterSummaries.find((m) => m.id === selectedMatterId) ?? null : null,
    [matterSummaries, selectedMatterId]
  );
  const resolvedSelectedMatter = selectedMatterDetail ?? selectedMatterSummary;

  const timelineItems = useMemo(() => {
    return [...activityItems, ...noteItems].sort((a, b) => {
      const at = a.dateTime ? new Date(a.dateTime).getTime() : 0;
      const bt = b.dateTime ? new Date(b.dateTime).getTime() : 0;
      return (Number.isFinite(bt) ? bt : 0) - (Number.isFinite(at) ? at : 0);
    });
  }, [activityItems, noteItems]);

  // ── Header meta ───────────────────────────────────────────────────────────
  const headerMeta = useMemo(() => {
    if (!resolvedSelectedMatter) return null;
    const detail = selectedMatterDetail;
    const clientIds = detail
      ? [detail.clientId, ...((detail as { clientIds?: string[] }).clientIds ?? [])].filter(Boolean) as string[]
      : [];

    const clientEntries = clientIds.map((id) => {
      const option = clientOptions.find((o) => o.id === id);
      return {
        id,
        name: option?.name ?? resolveOptionLabel(clientOptions, id, resolveClientLabel(id)),
        status: option?.status,
        location: option?.location
      };
    });
    if (clientEntries.length === 0 && resolvedSelectedMatter.clientName) {
      clientEntries.push({ id: 'client-name-fallback', name: resolvedSelectedMatter.clientName, status: undefined, location: undefined });
    }

    return {
      description: detail?.description,
      clientEntries,
      assigneeNames: detail?.assigneeIds.map((id) => resolveOptionLabel(assigneeOptions, id, `User ${id.slice(0, 6)}`)).filter(Boolean) ?? [],
      billingLabel: detail?.billingType ? detail.billingType.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : '',
      createdLabel: formatLongDate(resolvedSelectedMatter.createdAt)
    };
  }, [resolvedSelectedMatter, selectedMatterDetail, clientOptions, assigneeOptions]);

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

  // =========================================================================
  // Render — create route
  // =========================================================================
  if (isCreateRoute) {
    const submitHandler = convertIntakeUuid ? handleConvertIntake : handleCreateMatter;
    const shouldDeferCreateForm = Boolean(convertIntakeUuid && convertLoading && !convertInitialValues);
    return (
      <Page className="min-h-full">
        <div className="max-w-6xl mx-auto flex flex-col gap-6">
          <Breadcrumbs
            items={[{ label: 'Matters', href: basePath }, { label: 'Create matter' }]}
            onNavigate={navigate}
          />
          <PageHeader
            title={convertIntakeUuid ? 'Convert Intake to Matter' : 'Create Matter'}
            subtitle={convertIntakeUuid
              ? 'Finalize intake details and convert this intake into a new matter.'
              : 'Capture matter details, billing structure, and assignment in one place.'}
            actions={<Button size="sm" variant="secondary" onClick={goToList}>Back to matters</Button>}
          />
          {convertError && <ErrorBanner>{convertError}</ErrorBanner>}
          {convertIntakeUuid && convertLoading && !convertInitialValues ? (
            <Panel className="p-6">
              <LoadingState message="Loading intake details..." />
            </Panel>
          ) : null}
          {!shouldDeferCreateForm ? (
            <MatterCreateForm
              onClose={() => {
                const id = createdMatterIdRef.current;
                createdMatterIdRef.current = null;
                if (id) { goToDetail(id); return; }
                goToList();
              }}
              onSubmit={submitHandler}
              practiceId={activePracticeId}
              clients={clientOptions}
              practiceAreas={practiceAreaOptions}
              practiceAreasLoading={servicesLoading}
              assignees={assigneeOptions}
              initialValues={convertInitialValues}
            />
          ) : null}
        </div>
      </Page>
    );
  }

  // =========================================================================
  // Render — detail route
  // =========================================================================
  if (selectedMatterId) {
    if (detailLoading && !resolvedSelectedMatter) {
      return <Page className="h-full"><LoadingState message="Loading matter details..." /></Page>;
    }
    if (detailError && !resolvedSelectedMatter) {
      return <MatterLoadError message={detailError} onBack={goToList} />;
    }
    if (!resolvedSelectedMatter) {
      return <MatterNotFound matterId={selectedMatterId} onBack={goToList} />;
    }

    return (
      <Page className="min-h-full">
        <div className="max-w-6xl mx-auto flex flex-col gap-6">

          {headerMeta && (
            <MatterDetailHeader
              matter={resolvedSelectedMatter}
              detail={selectedMatterDetail}
              headerMeta={headerMeta}
              activeTab={detailTab}
              onTabChange={(id) => setDetailTab(id as DetailTabId)}
              tabs={DETAIL_TABS}
              onUpdateStatus={handleUpdateStatus}
              isLoading={detailLoading}
            />
          )}

          <MatterSummaryCards
            activeTab={detailTab}
            onAddTime={() => {
              if (detailTab !== 'overview') return;
              setQuickTimeEntryKey((k) => k + 1);
              setIsQuickTimeEntryOpen(true);
            }}
            onViewTimesheet={() => setDetailTab('time')}
            onChangeRate={() => {}}
            timeStats={timeStats}
          />

          {/* Description — inline editable */}
          {detailTab === 'overview' && selectedMatterDetail && (
            <div className="glass-panel overflow-hidden">
              <div className="border-b border-white/[0.06] px-6 py-4">
                <h3 className="text-sm font-semibold text-input-text">Matter description</h3>
              </div>
              {isDescriptionEditing ? (
                <div className="space-y-3 px-6 py-5">
                  <MarkdownUploadTextarea
                    label="Description"
                    value={descriptionDraft}
                    onChange={setDescriptionDraft}
                    practiceId={activePracticeId}
                    showLabel={false}
                    showTabs
                    showFooter
                    rows={12}
                    defaultTab="preview"
                  />
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="secondary" onClick={cancelDescriptionEdit} disabled={isSavingDescription}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={() => void saveDescription()} disabled={isSavingDescription}>
                      {isSavingDescription ? 'Saving...' : 'Save description'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-4 px-6 py-5">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-input-placeholder">
                    {selectedMatterDetail.description?.trim() || 'No description yet.'}
                  </p>
                  <Button
                    size="icon-sm"
                    variant="icon"
                    onClick={startDescriptionEdit}
                    icon={<PencilIcon className="h-4 w-4" />}
                    aria-label="Edit description"
                    className="shrink-0"
                  />
                </div>
              )}
            </div>
          )}

          {/* Tab panels */}
          <section>
            {detailTab === 'overview' ? (
              <div className="space-y-6">

                {/* Inline-editable matter details */}
                {selectedMatterDetail && (
                  <MatterDetailsPanel
                    detail={selectedMatterDetail}
                    assigneeOptions={assigneeOptions}
                    onSave={handlePatchMatter}
                  />
                )}

                {/* Activity timeline */}
                <div>
                  <h3 className="text-sm font-semibold text-input-text">Recent activity</h3>
                  <Panel className="mt-4 p-4">
                    {activityLoading && activityItems.length === 0 ? (
                      <LoadingState message="Loading activity..." />
                    ) : (
                      <ActivityTimeline
                        items={timelineItems}
                        showComposer
                        composerDisabled={activityLoading || !selectedMatterDetail}
                        composerLabel="Comment"
                        composerPlaceholder="Add your comment..."
                        composerPracticeId={activePracticeId}
                        composerPerson={{
                          name: session?.user?.name ?? session?.user?.email ?? 'You',
                          imageUrl: session?.user?.image ?? null
                        }}
                        onComposerSubmit={async (value) => {
                          try {
                            await handleCreateNote({ content: value });
                          } catch (err) {
                            console.error('[PracticeMattersPage] Failed to create note', err);
                            showError('Could not save comment', 'Please try again.');
                          }
                        }}
                      />
                    )}
                  </Panel>
                </div>

                {/* Milestones */}
                {selectedMatterDetail && (
                  <MatterMilestonesPanel
                    key={`milestones-${selectedMatterDetail.id}`}
                    matter={selectedMatterDetail}
                    milestones={milestones}
                    loading={milestonesLoading}
                    error={milestonesError}
                    onCreateMilestone={handleCreateMilestone}
                    onUpdateMilestone={handleUpdateMilestone}
                    onDeleteMilestone={handleDeleteMilestone}
                    onReorderMilestones={handleReorderMilestones}
                    allowReorder
                  />
                )}
              </div>

            ) : detailTab === 'time' && selectedMatterDetail ? (
              <div className="space-y-6">
                <TimeEntriesPanel
                  key={`time-${selectedMatterDetail.id}`}
                  entries={timeEntries}
                  onSaveEntry={(values, existing) => void handleSaveTimeEntry(values, existing)}
                  onDeleteEntry={(entry) => void handleDeleteTimeEntry(entry)}
                  loading={timeEntriesLoading}
                  error={timeEntriesError}
                />
                <MatterExpensesPanel
                  key={`expenses-${selectedMatterDetail.id}`}
                  matter={selectedMatterDetail}
                  expenses={expenses}
                  loading={expensesLoading}
                  error={expensesError}
                  onCreateExpense={handleCreateExpense}
                  onUpdateExpense={handleUpdateExpense}
                  onDeleteExpense={handleDeleteExpense}
                />
                <Panel>
                  <header className="flex items-center justify-between border-b border-line-glass/30 px-6 py-4">
                    <div>
                      <h3 className="text-sm font-semibold text-input-text">Recent transactions</h3>
                      <p className="text-xs text-input-placeholder">Summary of billed time across recent periods.</p>
                    </div>
                  </header>
                  <div className="grid gap-4 p-6 sm:grid-cols-3">
                    {[
                      { label: 'Last 7 days', value: '$0.00' },
                      { label: 'Last 30 days', value: '$0.00' },
                      { label: 'Since start', value: '$1,237.50' }
                    ].map((card) => (
                      <div key={card.label} className="glass-panel p-4">
                        <p className="text-xs font-medium text-input-placeholder">{card.label}</p>
                        <p className="mt-2 text-lg font-semibold text-input-text">{card.value}</p>
                      </div>
                    ))}
                  </div>
                </Panel>
              </div>

            ) : detailTab === 'messages' && selectedMatterDetail ? (
              <MatterMessagesPanel
                key={`messages-${selectedMatterDetail.id}`}
                matter={selectedMatterDetail}
                practiceId={activePracticeId}
                conversationBasePath={conversationBasePath}
              />
            ) : (
              <p className="text-sm text-input-placeholder">
                We will add the {DETAIL_TABS.find((t) => t.id === detailTab)?.label ?? 'tab'} details next.
              </p>
            )}
          </section>
        </div>

        {/* Quick time entry modal */}
        {isQuickTimeEntryOpen && (
          <Modal
            isOpen={isQuickTimeEntryOpen}
            onClose={() => setIsQuickTimeEntryOpen(false)}
            title="Add time entry"
            contentClassName="max-w-2xl"
          >
            <TimeEntryForm
              key={`quick-time-${quickTimeEntryKey}`}
              onSubmit={handleQuickTimeSubmit}
              onCancel={() => setIsQuickTimeEntryOpen(false)}
            />
          </Modal>
        )}
      </Page>
    );
  }

  // =========================================================================
  // Render — list route (default)
  // =========================================================================
  return (
    <Page className="min-h-full">
      <div className="max-w-6xl mx-auto flex flex-col gap-6">
        <PageHeader
          title="Matters"
          subtitle="Track matter progress, client updates, and case milestones."
          actions={
            <Button
              size="sm"
              icon={<PlusIcon className="h-4 w-4" />}
              onClick={() => navigate(`${basePath}/new`)}
              disabled={!activePracticeId}
            >
              Create Matter
            </Button>
          }
        />

        {isClientListTruncated && (
          <WarningBanner>
            <strong>Warning:</strong> The client list is incomplete. Some names or options may be missing.
          </WarningBanner>
        )}

        <Tabs
          items={tabs}
          activeId={activeTab}
          onChange={(id) => setActiveTab(id as MatterTabId)}
          actions={
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm" icon={<ChevronUpDownIcon className="h-4 w-4" />} iconPosition="right">
                  Sort by {SORT_LABELS[sortOption]}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <div className="py-1">
                  {(Object.keys(SORT_LABELS) as SortOption[]).map((option) => (
                    <DropdownMenuItem
                      key={option}
                      onSelect={() => setSortOption(option)}
                      className={option === sortOption ? 'font-semibold text-input-text' : ''}
                    >
                      {SORT_LABELS[option]}
                    </DropdownMenuItem>
                  ))}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          }
        />

        {mattersError && <ErrorBanner>{mattersError}</ErrorBanner>}

        <Panel className="overflow-hidden">
          <header className="flex items-center justify-between border-b border-line-glass/30 px-4 py-4 sm:px-6 lg:px-8">
            <div>
              <h2 className="text-sm font-semibold text-input-text">{TAB_HEADINGS[activeTab]} Matters</h2>
              <p className="text-xs text-input-placeholder">{sortedMatterSummaries.length} showing</p>
            </div>
          </header>
          {mattersLoading ? (
            <LoadingState message="Loading matters..." />
          ) : sortedMatterSummaries.length === 0 ? (
            <EmptyState onCreate={() => navigate(`${basePath}/new`)} disableCreate={!activePracticeId} />
          ) : (
            <ul className="divide-y divide-line-default">
              {sortedMatterSummaries.map((matter) => (
                <MatterListItem
                  key={matter.id}
                  matter={matter}
                  onSelect={(selected) => goToDetail(selected.id)}
                />
              ))}
            </ul>
          )}
          {mattersHasMore && !mattersLoading && <div ref={loadMoreRef} className="h-10" />}
          {mattersLoadingMore && (
            <p className="px-6 py-4 text-sm text-input-placeholder">Loading more matters...</p>
          )}
        </Panel>
      </div>
    </Page>
  );
};
