import type { ComponentChildren } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState, useErrorBoundary } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { PageHeader } from '@/shared/ui/layout/PageHeader';
import { Page } from '@/shared/ui/layout/Page';
import { Panel } from '@/shared/ui/layout/Panel';
import { DetailHeader } from '@/shared/ui/layout/DetailHeader';
import { Button } from '@/shared/ui/Button';
import { EntityList } from '@/shared/ui/list/EntityList';
import { Breadcrumbs } from '@/shared/ui/navigation';
import { MarkdownUploadTextarea } from '@/shared/ui/input/MarkdownUploadTextarea';
import { CurrencyInput } from '@/shared/ui/input';
import { ActivityTimeline, type TimelineItem, type TimelinePerson } from '@/shared/ui/activity/ActivityTimeline';
import { Avatar } from '@/shared/ui/profile';
import Modal from '@/shared/components/Modal';
import {
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  CurrencyDollarIcon,
  FolderIcon,
  HomeIcon,
  PencilSquareIcon,
  PlusIcon
} from '@heroicons/react/24/outline';
import { Icon } from '@/shared/ui/Icon';
import { MATTER_STATUS_LABELS, type MatterStatus } from '@/shared/types/matterStatus';
import {
  type MatterDetail,
  type MatterExpense,
  type MatterOption,
  type MatterTask,
  type TimeEntry
} from '@/features/matters/data/matterTypes';
import { MatterCreateForm, type MatterFormState } from '@/features/matters/components/MatterCreateModal';
import { MatterListItem } from '@/features/matters/components/MatterListItem';
import { TimeEntriesPanel } from '@/features/matters/components/time-entries/TimeEntriesPanel';
import { TimeEntryForm, type TimeEntryFormValues } from '@/features/matters/components/time-entries/TimeEntryForm';
import { MatterExpensesPanel } from '@/features/matters/components/expenses/MatterExpensesPanel';
import { MatterMilestonesPanel } from '@/features/matters/components/milestones/MatterMilestonesPanel';
import { MatterTasksPanel } from '@/features/matters/components/tasks/MatterTasksPanel';
import { MatterMessagesPanel } from '@/features/matters/components/messages/MatterMessagesPanel';
import { InvoiceBuilder } from '@/features/matters/components/billing/InvoiceBuilder';
import { InvoicesSection } from '@/features/matters/components/billing/InvoicesSection';
import { UnbilledSummaryCard } from '@/features/matters/components/billing/UnbilledSummaryCard';
import { MatterSummaryCards } from '@/features/matters/components/MatterSummaryCards';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { usePracticeDetails } from '@/shared/hooks/usePracticeDetails';
import { asMajor, getMajorAmountValue, safeDivide, safeMultiply, type MajorAmount } from '@/shared/utils/money';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import {
  createMatter,
  getMatter,
  getMatterActivity,
  updateMatter,
  type BackendMatter,
  type BackendMatterActivity,
  type BackendMatterTimeStats,
  createMatterExpense,
  createMatterNote,
  createMatterMilestone,
  createMatterTask,
  createMatterTimeEntry,
  deleteMatterExpense,
  deleteMatterMilestone,
  deleteMatterTask,
  deleteMatterTimeEntry,
  getMatterTimeEntryStats,
  listMatterExpenses,
  listMatterMilestones,
  listMatterNotes,
  listMatterTasks,
  listMatterTimeEntries,
  reorderMatterMilestones,
  updateMatterExpense,
  updateMatterMilestone,
  updateMatterTask,
  updateMatterTimeEntry
} from '@/features/matters/services/mattersApi';
import { getInvoice, sendInvoice, syncInvoice, voidInvoice as voidInvoiceRequest } from '@/features/matters/services/invoicesApi';
import { useBillingData } from '@/features/matters/hooks/useBillingData';
import type { Invoice, InvoiceLineItem } from '@/features/matters/types/billing.types';
import { getOnboardingStatus, listUserDetails, type UserDetailRecord } from '@/shared/lib/apiClient';
import { invalidateMattersForPractice } from '@/shared/stores/mattersStore';
import { normalizePracticeOnboardingStatus } from '@/features/practice/types/onboarding.types';
import {
  buildActivityTimelineItem,
  buildCreatePayload,
  buildFormStateFromDetail,
  buildNoteTimelineItem,
  buildUpdatePayload,
  extractAssigneeIds,
  isEmailLike,
  isUuid,
  prunePayload,
  sortByTimestamp,
  toExpense,
  toMatterDetail,
  toMatterTask,
  toMatterSummary,
  toMilestone,
  toTimeEntry
} from '@/features/matters/utils/matterUtils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DetailSectionId = 'overview' | 'tasks' | 'billing' | 'messages';
type IntakeTriageStatus = 'pending_review' | 'accepted' | 'declined' | string;

const DETAIL_TABS: Array<{ id: DetailSectionId; label: string; icon: typeof CheckCircleIcon }> = [
  { id: 'overview', label: 'Overview', icon: HomeIcon },
  { id: 'tasks', label: 'Tasks', icon: CheckCircleIcon },
  { id: 'billing', label: 'Billing', icon: CurrencyDollarIcon },
  { id: 'messages', label: 'Messages', icon: ChatBubbleLeftRightIcon }
];

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
        <Icon icon={FolderIcon} className="h-6 w-6 text-input-text/70" aria-hidden="true"  />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-input-text">No matters yet</h3>
      <p className="mt-2 text-sm text-input-placeholder">
        Create your first matter to start tracking progress and milestones.
      </p>
      <div className="mt-6 flex justify-center">
        <Button size="sm" icon={PlusIcon} iconClassName="h-4 w-4" onClick={onCreate} disabled={disableCreate}>
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
const _DetailField = ({ label, value }: { label: string; value: string }) => (
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

const BillingErrorBoundary = ({ children, onRetry }: { children: preact.ComponentChildren; onRetry: () => void }) => {
  const [error, resetError] = useErrorBoundary((err) => {
    console.error('[PracticeMattersPage] Billing tab render failed', err);
  });

  if (error) {
    return (
      <ErrorBanner>
        <div className="flex items-center justify-between gap-4">
          <span>Unable to load billing data.</span>
          <Button
            size="xs"
            variant="secondary"
            onClick={() => {
              resetError();
              onRetry();
            }}
          >
            Retry
          </Button>
        </div>
      </ErrorBanner>
    );
  }

  return <>{children}</>;
};

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
  listHeaderLeftControl?: ComponentChildren;
  detailHeaderRightControl?: ComponentChildren;
  showDetailBackButton?: boolean;
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
  listHeaderLeftControl,
  detailHeaderRightControl,
  showDetailBackButton = true,
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
  const isCreateRouteFromPath = firstSegment === 'new';
  const selectedMatterIdFromPath = firstSegment && firstSegment !== 'activity' && firstSegment !== 'new'
    ? decodeURIComponent(firstSegment)
    : null;
  const detailSection: DetailSectionId = selectedMatterIdFromPath
    ? (secondSegment === 'tasks' || secondSegment === 'billing' || secondSegment === 'messages'
      ? secondSegment
      : 'overview')
    : 'overview';
  const isCreateRoute = renderMode === 'listOnly' ? false : isCreateRouteFromPath;
  const selectedMatterId = renderMode === 'listOnly' ? null : selectedMatterIdFromPath;
  const convertIntakeUuid = useMemo(
    () => resolveQueryValue(location.query?.convertIntake),
    [location.query?.convertIntake]
  );
  const navigate = (path: string) => location.route(path);
  const goToList = () => navigate(basePath);
  const goToDetail = (id: string, section: Exclude<DetailSectionId, 'overview'> | null = null) =>
    navigate(section ? `${basePath}/${encodeURIComponent(id)}/${section}` : `${basePath}/${encodeURIComponent(id)}`);
  const conversationBasePath = basePath.endsWith('/matters')
    ? basePath.replace(/\/matters$/, '/conversations')
    : '/practice/conversations';

  // ── External hooks ────────────────────────────────────────────────────────
  const { getMembers, fetchMembers } = usePracticeManagement({
    autoFetchPractices: false,
    fetchPracticeDetails: false
  });
  const {
    details: practiceDetails,
    hasDetails: hasPracticeDetails,
    fetchDetails: fetchPracticeDetails
  } = usePracticeDetails(activePracticeId, null, false);

  // ── Detail state ──────────────────────────────────────────────────────────
  const [selectedMatterDetail, setSelectedMatterDetail] = useState<MatterDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // ── Activity / notes ──────────────────────────────────────────────────────
  const [activityItems, setActivityItems] = useState<TimelineItem[]>([]);
  const [noteItems, setNoteItems] = useState<TimelineItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [activityRetryCount, setActivityRetryCount] = useState(0);
  const rawActivityRef = useRef<BackendMatterActivity[]>([]);

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

  // ── Person / service / assignee options ───────────────────────────────────
  const [clientOptions, setClientOptions] = useState<MatterOption[]>([]);
  const [isClientListTruncated, setIsClientListTruncated] = useState(false);
  const [servicesLoading, setServicesLoading] = useState(false);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [isQuickTimeEntryOpen, setIsQuickTimeEntryOpen] = useState(false);
  const [isInvoiceBuilderOpen, setIsInvoiceBuilderOpen] = useState(false);
  const [invoiceSeedItems, setInvoiceSeedItems] = useState<InvoiceLineItem[]>([]);
  const [isInvoiceEditMode, setIsInvoiceEditMode] = useState(false);
  const [invoiceFormDefaults, setInvoiceFormDefaults] = useState<{
    dueDate?: string;
    notes?: string;
    memo?: string;
    invoiceType?: Invoice['invoice_type'];
  }>({});
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [invoiceContext, setInvoiceContext] = useState<'default' | 'milestone' | 'retainer'>('default');
  const [milestoneToComplete, setMilestoneToComplete] = useState<MatterDetail['milestones'][number] | null>(null);
  const [isSettlementModalOpen, setIsSettlementModalOpen] = useState(false);
  const [settlementDraft, setSettlementDraft] = useState<MajorAmount | undefined>(undefined);
  const [connectedAccountId, setConnectedAccountId] = useState<string | null>(null);
  const [stripeAccountId, setStripeAccountId] = useState<string | null>(null);
  const [onboardingUrl, setOnboardingUrl] = useState<string | null>(null);
  const [quickTimeEntryKey, setQuickTimeEntryKey] = useState(0);
  const [isDescriptionEditing, setIsDescriptionEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [isSavingDescription, setIsSavingDescription] = useState(false);
  const [convertInitialValues, setConvertInitialValues] = useState<Partial<MatterFormState> | undefined>(undefined);
  const [convertLoading, setConvertLoading] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const isMounted = useRef(true);
  const practiceDetailsRequestedRef = useRef<string | null>(null);
  const refreshRequestIdRef = useRef(0);
  const createdMatterIdRef = useRef<string | null>(null);

  const {
    invoices,
    unbilledTimeEntries,
    unbilledExpenses,
    unbilledSummary,
    loading: invoicesLoading,
    error: invoicesError,
    refetchAll: refetchBilling
  } = useBillingData({
    practiceId: activePracticeId,
    matterId: selectedMatterId,
    matter: selectedMatterDetail,
    enabled: Boolean(activePracticeId && selectedMatterId)
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

  useEffect(() => {
    if (!activePracticeId) {
      setConnectedAccountId(null);
      setStripeAccountId(null);
      setOnboardingUrl(null);
      return;
    }
    let cancelled = false;
    getOnboardingStatus(activePracticeId)
      .then((status) => {
        if (cancelled) return;
        const normalized = normalizePracticeOnboardingStatus(status);
        setConnectedAccountId(normalized.connected_account_id ?? null);
        setStripeAccountId(normalized.stripe_account_id ?? null);
        setOnboardingUrl(normalized.url ?? null);
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn('[PracticeMattersPage] Failed to load connected Stripe account', error);
        setConnectedAccountId(null);
        setStripeAccountId(null);
        setOnboardingUrl(null);
      });
    return () => { cancelled = true; };
  }, [activePracticeId]);

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
  const remapActivities = useCallback((activities: BackendMatterActivity[]) => {
    const filtered = activities.filter((item) => !String(item.action ?? '').startsWith('note_'));
    setActivityItems(sortByTimestamp(filtered).map((item) => toActivityItem(item, activities)));
  }, [toActivityItem]);

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

  // ── Data fetching: people (paginated) ─────────────────────────────────────
  const buildClientOption = useCallback((detail: UserDetailRecord): MatterOption => ({
    id: detail.id,
    name: detail.user?.name?.trim() || detail.user?.email?.trim() || detail.user?.phone?.trim() || 'Unknown person',
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
          console.error('[PracticeMattersPage] Failed to load people', error);
          setClientOptions(allClients);
          setIsClientListTruncated(true);
          showError('Failed to load full people list', 'Some people may be missing.');
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

  const refreshMatters = useCallback(() => {
    void onRefetchList?.();
  }, [onRefetchList]);
  const matters = prefetchedItems;
  const mattersLoading = prefetchedLoading;
  const mattersLoadingMore = false;
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
      rawActivityRef.current = [];
      setActivityItems([]);
      setActivityLoading(false);
      setActivityError(null);
      return;
    }

    const controller = new AbortController();
    setActivityLoading(true);
    setActivityError(null);

    getMatterActivity(activePracticeId, selectedMatterId, { signal: controller.signal })
      .then((items) => {
        rawActivityRef.current = items;
        remapActivities(items);
      })
      .catch((error: unknown) => {
        if ((error as DOMException).name === 'AbortError') return;
        console.warn('[PracticeMattersPage] Failed to load activity', error);
        rawActivityRef.current = [];
        setActivityItems([]);
        setActivityError(error instanceof Error ? error.message : 'Failed to load activity');
      })
      .finally(() => setActivityLoading(false));

    return () => controller.abort();
  }, [activePracticeId, selectedMatterId, remapActivities, activityRetryCount]);

  useEffect(() => {
    if (rawActivityRef.current.length === 0) return;
    remapActivities(rawActivityRef.current);
  }, [remapActivities]);

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
    if (detailSection !== 'billing') return;
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
  useEffect(() => {
    if (detailSection !== 'tasks') return;
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
        if (status === 404 || message.includes('404') || message.includes('Not Found')) {
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
    invalidateMattersForPractice(activePracticeId);
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

    invalidateMattersForPractice(activePracticeId);
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
    invalidateMattersForPractice(activePracticeId);
    refreshMatters();
    await refreshSelectedMatter();
  }, [activePracticeId, selectedMatterId, selectedMatterDetail?.status, refreshMatters, refreshSelectedMatter]);

  // ── Status update shortcut (uses buildFormStateFromDetail) ────────────────
  const handleUpdateStatus = useCallback((newStatus: MatterStatus) => {
    if (!selectedMatterDetail || !activePracticeId) return;
    void handleUpdateMatter(buildFormStateFromDetail(selectedMatterDetail, { status: newStatus }));
  }, [selectedMatterDetail, activePracticeId, handleUpdateMatter]);
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

  // ── Description edit handlers ─────────────────────────────────────────────
  const startDescriptionEdit = useCallback(() => {
    if (!selectedMatterDetail) return;
    setTitleDraft(selectedMatterDetail.title ?? '');
    setDescriptionDraft(selectedMatterDetail.description ?? '');
    setIsDescriptionEditing(true);
  }, [selectedMatterDetail]);

  const cancelDescriptionEdit = useCallback(() => {
    setIsDescriptionEditing(false);
    setTitleDraft('');
    setDescriptionDraft('');
  }, []);

  const saveDescription = useCallback(async () => {
    if (!selectedMatterDetail || !activePracticeId) return;
    setIsSavingDescription(true);
    try {
      await handleUpdateMatter(buildFormStateFromDetail(selectedMatterDetail, {
        title: titleDraft.trim() || selectedMatterDetail.title,
        description: descriptionDraft
      }));
      setIsDescriptionEditing(false);
      setTitleDraft('');
      setDescriptionDraft('');
    } catch (error) {
      console.error('[PracticeMattersPage] Failed to update matter title/description', error);
      showError('Could not save matter details', 'Please try again.');
    } finally {
      setIsSavingDescription(false);
    }
  }, [selectedMatterDetail, activePracticeId, titleDraft, descriptionDraft, handleUpdateMatter, showError]);

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

  // ── Task handlers ─────────────────────────────────────────────────────────
  const refreshTasks = useCallback(async (signal?: AbortSignal) => {
    if (!activePracticeId || !selectedMatterId) return;
    const items = await listMatterTasks(activePracticeId, selectedMatterId, {}, { signal });
    setTasks(items.map(toMatterTask));
    setTasksError(null);
  }, [activePracticeId, selectedMatterId]);

  const handleCreateTask = useCallback(async (values: {
    name: string;
    description: string;
    assigneeId: string | null;
    dueDate: string | null;
    status: MatterTask['status'];
    priority: MatterTask['priority'];
    stage: string;
  }) => {
    if (!activePracticeId || !selectedMatterId) throw new Error('IDs required');
    await createMatterTask(activePracticeId, selectedMatterId, {
      name: values.name,
      description: values.description.trim() || undefined,
      assignee_id: values.assigneeId,
      due_date: values.dueDate,
      status: values.status,
      priority: values.priority,
      stage: values.stage
    });
    await refreshTasks();
  }, [activePracticeId, selectedMatterId, refreshTasks]);

  const handleUpdateTask = useCallback(async (task: MatterTask, patch: Partial<{
    name: string;
    description: string | null;
    assignee_id: string | null;
    due_date: string | null;
    status: MatterTask['status'];
    priority: MatterTask['priority'];
    stage: string;
  }>) => {
    if (!activePracticeId || !selectedMatterId) throw new Error('IDs required');
    await updateMatterTask(activePracticeId, selectedMatterId, task.id, patch);
    await refreshTasks();
  }, [activePracticeId, selectedMatterId, refreshTasks]);

  const handleDeleteTask = useCallback(async (task: MatterTask) => {
    if (!activePracticeId || !selectedMatterId) throw new Error('IDs required');
    await deleteMatterTask(activePracticeId, selectedMatterId, task.id);
    await refreshTasks();
  }, [activePracticeId, selectedMatterId, refreshTasks]);

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

  const openInvoiceBuilderWithItems = useCallback((
    items?: InvoiceLineItem[],
    options?: InvoiceLaunchOptions
  ) => {
    setInvoiceSeedItems(items ?? prefilledInvoiceLineItems);
    setMilestoneToComplete(options?.milestone ?? null);
    setIsInvoiceEditMode(false);
    setInvoiceContext(options?.context ?? 'default');
    setInvoiceFormDefaults(options?.invoiceType ? { invoiceType: options.invoiceType } : {});
    setEditingInvoiceId(null);
    setIsInvoiceBuilderOpen(true);
  }, [prefilledInvoiceLineItems]);

  const closeInvoiceBuilder = useCallback(() => {
    setIsInvoiceBuilderOpen(false);
    setInvoiceSeedItems([]);
    setInvoiceFormDefaults({});
    setEditingInvoiceId(null);
    setIsInvoiceEditMode(false);
    setInvoiceContext('default');
    setMilestoneToComplete(null);
  }, []);

  const handleCreateInvoiceFromSummary = useCallback(() => {
    if (!selectedMatterDetail) {
      openInvoiceBuilderWithItems(prefilledInvoiceLineItems);
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
      openInvoiceBuilderWithItems([{
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
      openInvoiceBuilderWithItems([{
        id: crypto.randomUUID(),
        type: 'flat_fee',
        description: `${selectedMatterDetail.title} - Fixed project fee`,
        quantity: 1,
        unit_price: fixedTotal,
        line_total: fixedTotal
      }], { invoiceType: 'flat_fee' });
      return;
    }

    openInvoiceBuilderWithItems(prefilledInvoiceLineItems);
  }, [selectedMatterDetail, openInvoiceBuilderWithItems, prefilledInvoiceLineItems]);

  const handleEditDraftInvoice = useCallback(async (invoice: Invoice) => {
    if (!activePracticeId) return;
    try {
      const detail = await getInvoice(activePracticeId, invoice.id);
      if (!detail) throw new Error('Invoice not found');
      setInvoiceSeedItems(detail.line_items ?? []);
      setInvoiceFormDefaults({
        dueDate: detail.due_date ? detail.due_date.split('T')[0] : undefined,
        notes: detail.notes ?? '',
        memo: detail.memo ?? '',
        invoiceType: detail.invoice_type
      });
      setIsInvoiceEditMode(true);
      setInvoiceContext('default');
      setEditingInvoiceId(detail.id);
      setMilestoneToComplete(null);
      setIsInvoiceBuilderOpen(true);
    } catch (error) {
      showError('Could not load invoice', error instanceof Error ? error.message : 'Please try again.');
    }
  }, [activePracticeId, showError]);

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
    openInvoiceBuilderWithItems(items, {
      milestone,
      context: 'milestone',
      invoiceType: 'phase_fee'
    });
  }, [openInvoiceBuilderWithItems, selectedMatterDetail]);

  const handleOpenSettlementModal = useCallback(() => {
    setSettlementDraft(selectedMatterDetail?.settlementAmount);
    setIsSettlementModalOpen(true);
  }, [selectedMatterDetail?.settlementAmount]);

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
      invalidateMattersForPractice(activePracticeId);
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
      openInvoiceBuilderWithItems(items, { invoiceType: 'contingency' });
    } catch (error) {
      showError('Could not save settlement amount', error instanceof Error ? error.message : 'Please try again.');
    }
  }, [activePracticeId, selectedMatterId, settlementDraft, selectedMatterDetail, openInvoiceBuilderWithItems, refreshMatters, showError]);

  const handleSendInvoice = useCallback(async (invoice: Invoice) => {
    if (!activePracticeId) return;
    try {
      await sendInvoice(activePracticeId, invoice.id);
      await refetchBilling();
    } catch (error) {
      showError('Could not send invoice', error instanceof Error ? error.message : 'Please try again.');
    }
  }, [activePracticeId, refetchBilling, showError]);

  const handleViewInvoice = useCallback((invoice: Invoice) => {
    if (!invoice.stripe_hosted_invoice_url) {
      showError('No hosted invoice URL', 'This invoice has not been published to Stripe yet.');
      return;
    }
    window.open(invoice.stripe_hosted_invoice_url, '_blank', 'noopener,noreferrer');
  }, [showError]);

  const handleResendInvoice = useCallback(async (invoice: Invoice) => {
    if (!activePracticeId) return;
    try {
      const synced = await syncInvoice(activePracticeId, invoice.id);
      const url = synced?.stripe_hosted_invoice_url ?? invoice.stripe_hosted_invoice_url;
      if (url && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      }
      await refetchBilling();
    } catch (error) {
      showError('Could not resend invoice', error instanceof Error ? error.message : 'Please try again.');
    }
  }, [activePracticeId, refetchBilling, showError]);

  const handleSyncInvoice = useCallback(async (invoice: Invoice) => {
    if (!activePracticeId) return;
    try {
      await syncInvoice(activePracticeId, invoice.id);
      await refetchBilling();
    } catch (error) {
      showError('Could not sync invoice', error instanceof Error ? error.message : 'Please try again.');
    }
  }, [activePracticeId, refetchBilling, showError]);

  const handleVoidInvoice = useCallback(async (invoice: Invoice) => {
    if (!activePracticeId) return;
    const confirmed = window.confirm('Void this invoice? This cannot be undone.');
    if (!confirmed) return;
    try {
      await voidInvoiceRequest(activePracticeId, invoice.id);
      await refetchBilling();
    } catch (error) {
      showError('Could not void invoice', error instanceof Error ? error.message : 'Please try again.');
    }
  }, [activePracticeId, refetchBilling, showError]);

  const handleInvoiceBuilderSuccess = useCallback(async () => {
    const milestoneSnapshot = milestoneToComplete;
    if (milestoneSnapshot?.id && activePracticeId && selectedMatterId) {
      try {
        if (import.meta.env.DEV) {
          console.info('[Billing][Milestone] Marking milestone as invoiced', {
            milestoneId: milestoneSnapshot.id
          });
        }
        await updateMatterMilestone(activePracticeId, selectedMatterId, milestoneSnapshot.id, {
          description: milestoneSnapshot.description,
          amount: milestoneSnapshot.amount,
          due_date: milestoneSnapshot.dueDate,
          status: 'completed'
        });
      } catch (error) {
        showError('Invoice created, but milestone status was not updated', error instanceof Error ? error.message : 'Please refresh and try again.');
      }
    }
    await Promise.all([
      refetchBilling(),
      refreshMilestones()
    ]);
    closeInvoiceBuilder();
  }, [milestoneToComplete, activePracticeId, selectedMatterId, refetchBilling, refreshMilestones, showError, closeInvoiceBuilder]);

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
    invalidateMattersForPractice(activePracticeId);
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

    const matterDetailHeaderActions = (
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant={isDescriptionEditing ? 'secondary' : 'icon'}
          size="icon-sm"
          onClick={isDescriptionEditing ? cancelDescriptionEdit : startDescriptionEdit}
          icon={PencilSquareIcon}
          iconClassName="h-4 w-4"
          aria-label={isDescriptionEditing ? 'Close matter editor' : 'Edit matter title and description'}
        />
        {detailHeaderRightControl}
      </div>
    );

    return (
      <>
        <div className="h-full overflow-y-auto">
          <div className="relative z-20 overflow-visible">
            <DetailHeader
              title="Matter details"
              showBack={showDetailBackButton}
              onBack={goToList}
              actions={matterDetailHeaderActions}
            />
            {detailHeaderMeta ? (
              <div className="px-4 py-4">
                <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-b from-accent-500/30 via-surface-glass/70 to-surface-overlay/85 [--accent-foreground:var(--input-text)]">
                  <div className="absolute inset-0 bg-gradient-to-t from-surface-base/45 via-transparent to-white/10" />
                  <div className="relative px-6 pb-12 pt-10">
                    <div className="flex flex-col items-start gap-6 md:flex-row md:items-start md:gap-8">
                      <Avatar
                        size="xl"
                        src={detailClientOption?.image ?? null}
                        name={detailClientOption?.name ?? 'Unassigned client'}
                      />
                      <div className="min-w-0 flex-1">
                        {selectedMatterDetail ? (
                          <div>
                            {isDescriptionEditing ? (
                              <div className="space-y-3">
                                <div>
                                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[rgb(var(--accent-foreground))]/80" htmlFor="matter-title-editor">
                                    Title
                                  </label>
                                  <input
                                    id="matter-title-editor"
                                    type="text"
                                    value={titleDraft}
                                    onInput={(event) => setTitleDraft((event.currentTarget as HTMLInputElement).value)}
                                    placeholder="Matter title"
                                    className="glass-input h-10 w-full rounded-xl px-3 text-sm"
                                  />
                                </div>
                                <MarkdownUploadTextarea
                                  label="Description"
                                  value={descriptionDraft}
                                  onChange={setDescriptionDraft}
                                  practiceId={activePracticeId}
                                  showLabel={false}
                                  showTabs
                                  showFooter
                                  rows={10}
                                  defaultTab="write"
                                />
                                <div className="flex justify-end gap-2">
                                  <Button size="sm" variant="secondary" onClick={cancelDescriptionEdit} disabled={isSavingDescription}>
                                    Cancel
                                  </Button>
                                  <Button size="sm" onClick={() => void saveDescription()} disabled={isSavingDescription}>
                                    {isSavingDescription ? 'Saving...' : 'Save changes'}
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="flex items-baseline justify-between gap-3">
                                  <h4 className="text-4xl font-semibold leading-tight text-[rgb(var(--accent-foreground))] md:text-5xl">
                                    {selectedMatterDetail.title?.trim() || 'Untitled matter'}
                                  </h4>
                                  {selectedMatterDetail.caseNumber?.trim() ? (
                                    <span className="shrink-0 text-sm font-normal text-[rgb(var(--accent-foreground))]/65">
                                      #{selectedMatterDetail.caseNumber.trim()}
                                    </span>
                                  ) : null}
                                </div>
                                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[rgb(var(--accent-foreground))]/85">
                                  {selectedMatterDetail.description?.trim() || 'No description yet.'}
                                </p>
                              </>
                            )}
                          </div>
                        ) : null}
                        <nav className="mt-6 flex items-center gap-3" aria-label="Matter detail tabs">
                          {DETAIL_TABS.map((tab) => {
                            const isActive = detailSection === tab.id;
                            const TabIcon = tab.icon;
                            return (
                              <button
                                key={tab.id}
                                type="button"
                                onClick={() => {
                                  if (!selectedMatterId) return;
                                  goToDetail(selectedMatterId, tab.id === 'overview' ? null : tab.id);
                                }}
                                aria-selected={isActive}
                                aria-label={tab.label}
                                title={tab.label}
                                role="tab"
                                className={[
                                  'flex h-11 w-11 items-center justify-center rounded-full transition-colors duration-150',
                                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500',
                                  isActive
                                    ? 'bg-white/20 text-[rgb(var(--accent-foreground))]'
                                    : 'bg-white/10 text-[rgb(var(--accent-foreground))]/80 hover:bg-white/15 hover:text-[rgb(var(--accent-foreground))]'
                                ].join(' ')}
                              >
                                <TabIcon className="h-5 w-5" aria-hidden="true" />
                              </button>
                            );
                          })}
                        </nav>
                        {selectedMatterDetail ? (
                          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                            <div>
                              <p className="text-xs font-medium uppercase tracking-wide text-[rgb(var(--accent-foreground))]/70">Client</p>
                              <p className="mt-1 text-sm text-[rgb(var(--accent-foreground))]">
                                {detailClientOption?.name ?? 'Unassigned client'}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs font-medium uppercase tracking-wide text-[rgb(var(--accent-foreground))]/70">Assigned</p>
                              <p className="mt-1 text-sm text-[rgb(var(--accent-foreground))]">
                                {assigneeNameById.get(selectedMatterDetail.responsibleAttorneyId ?? '') || 'Not set'}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs font-medium uppercase tracking-wide text-[rgb(var(--accent-foreground))]/70">Status</p>
                              <p className="mt-1 text-sm text-[rgb(var(--accent-foreground))]">
                                {MATTER_STATUS_LABELS[selectedMatterDetail.status]}
                              </p>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            ) : null}
            <div className="px-4 pb-4 pt-2">
              <MatterSummaryCards
                activeTab="overview"
                onAddTime={() => {
                  setQuickTimeEntryKey((k) => k + 1);
                  setIsQuickTimeEntryOpen(true);
                }}
                onViewTimesheet={() => {
                  if (!selectedMatterId) return;
                  goToDetail(selectedMatterId, 'billing');
                }}
                timeStats={timeStats}
                billingType={selectedMatterDetail?.billingType}
                attorneyHourlyRate={selectedMatterDetail?.attorneyHourlyRate ?? null}
                adminHourlyRate={selectedMatterDetail?.adminHourlyRate ?? null}
                totalFixedPrice={selectedMatterDetail?.totalFixedPrice ?? null}
                contingencyPercent={selectedMatterDetail?.contingencyPercent ?? null}
                paymentFrequency={selectedMatterDetail?.paymentFrequency ?? null}
              />
            </div>
          </div>
          <div className="space-y-6 p-4 sm:p-6">
          {/* Tab panels */}
          <section>
            {detailSection === 'overview' ? (
            <div className="space-y-6">

                {/* Read-only matter details */}
                {selectedMatterDetail && (
                  <section className="glass-panel rounded-2xl">
                    <div className="grid grid-cols-1 divide-y divide-line-glass/5 md:grid-cols-2 md:divide-x md:divide-y-0 md:divide-line-glass/5">
                      <dl className="divide-y divide-line-glass/5">
                        <div className="px-5 py-4">
                          <dt className="text-sm font-medium text-input-placeholder">Court</dt>
                          <dd className="mt-1 text-sm text-input-text">{selectedMatterDetail.court?.trim() || 'Not set'}</dd>
                        </div>
                        <div className="px-5 py-4">
                          <dt className="text-sm font-medium text-input-placeholder">Judge</dt>
                          <dd className="mt-1 text-sm text-input-text">{selectedMatterDetail.judge?.trim() || 'Not set'}</dd>
                        </div>
                        <div className="px-5 py-4">
                          <dt className="text-sm font-medium text-input-placeholder">Opposing party</dt>
                          <dd className="mt-1 text-sm text-input-text">{selectedMatterDetail.opposingParty?.trim() || 'Not set'}</dd>
                        </div>
                        <div className="px-5 py-4">
                          <dt className="text-sm font-medium text-input-placeholder">Opposing counsel</dt>
                          <dd className="mt-1 text-sm text-input-text">{selectedMatterDetail.opposingCounsel?.trim() || 'Not set'}</dd>
                        </div>
                      </dl>
                      <dl className="divide-y divide-line-glass/5">
                        <div className="px-5 py-4">
                          <dt className="text-sm font-medium text-input-placeholder">Matter type</dt>
                          <dd className="mt-1 text-sm text-input-text">{selectedMatterDetail.matterType?.trim() || 'Not set'}</dd>
                        </div>
                        <div className="px-5 py-4">
                          <dt className="text-sm font-medium text-input-placeholder">Urgency</dt>
                          <dd className="mt-1 text-sm text-input-text">
                            {selectedMatterDetail.urgency ? selectedMatterDetail.urgency.replace(/_/g, ' ') : 'Not set'}
                          </dd>
                        </div>
                        <div className="px-5 py-4">
                          <dt className="text-sm font-medium text-input-placeholder">Responsible attorney</dt>
                          <dd className="mt-1 text-sm text-input-text">
                            {assigneeNameById.get(selectedMatterDetail.responsibleAttorneyId ?? '') || 'Not set'}
                          </dd>
                        </div>
                        <div className="px-5 py-4">
                          <dt className="text-sm font-medium text-input-placeholder">Originating attorney</dt>
                          <dd className="mt-1 text-sm text-input-text">
                            {assigneeNameById.get(selectedMatterDetail.originatingAttorneyId ?? '') || 'Not set'}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  </section>
                )}

                {/* Activity timeline */}
                <div>
                  <h3 className="text-sm font-semibold text-input-text">Recent activity</h3>
                  <div className="mt-4">
                    {activityLoading && activityItems.length === 0 ? (
                      <LoadingState message="Loading activity..." />
                    ) : activityError && activityItems.length === 0 ? (
                      <p className="px-4 py-3 text-sm text-input-placeholder">
                        Could not load activity.{' '}
                        <button
                          type="button"
                          className="underline"
                          onClick={() => {
                            setActivityError(null);
                            setActivityRetryCount((count) => count + 1);
                          }}
                        >
                          Retry
                        </button>
                      </p>
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
                        onTaskClick={() => {
                          if (!selectedMatterId) return;
                          goToDetail(selectedMatterId, 'tasks');
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
                  </div>
                </div>

              </div>
            ) : null}
            {detailSection === 'tasks' ? (
              <div className="space-y-6">
                {tasksNotImplemented ? (
                  <div className="flex flex-col items-center justify-center h-full min-h-[200px] gap-3 text-center p-8">
                    <p className="text-sm font-medium text-muted-foreground">Tasks coming soon</p>
                    <p className="text-xs text-muted-foreground/70">Task management for this matter is not yet available.</p>
                  </div>
                ) : (
                  <MatterTasksPanel
                    tasks={tasks}
                    loading={tasksLoading}
                    error={tasksError}
                    assignees={assigneeOptions}
                    onCreateTask={handleCreateTask}
                    onUpdateTask={handleUpdateTask}
                    onDeleteTask={handleDeleteTask}
                  />
                )}
                {selectedMatterDetail?.billingType === 'fixed' && selectedMatterDetail.paymentFrequency === 'milestone' ? (
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
                ) : null}
              </div>
            ) : detailSection === 'billing' && selectedMatterDetail ? (
              <BillingErrorBoundary onRetry={refetchBilling}>
                <div className="space-y-6">
                  {invoicesError ? (
                    <ErrorBanner>
                      <div className="flex items-center justify-between gap-4">
                        <span>{invoicesError}</span>
                        <Button size="xs" variant="secondary" onClick={() => void refetchBilling()}>
                          Retry
                        </Button>
                      </div>
                    </ErrorBanner>
                  ) : null}
                  {!connectedAccountId ? (
                    <WarningBanner>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span>Complete Stripe onboarding to save or send invoices.</span>
                        {onboardingUrl ? (
                          <Button
                            size="xs"
                            variant="secondary"
                            onClick={() => {
                              if (typeof window !== 'undefined') {
                                window.open(onboardingUrl, '_blank', 'noopener,noreferrer');
                              }
                            }}
                          >
                            Open onboarding
                          </Button>
                        ) : null}
                      </div>
                      {stripeAccountId ? (
                        <p className="mt-2 text-xs text-input-placeholder">
                          Stripe account: {stripeAccountId}
                        </p>
                      ) : null}
                    </WarningBanner>
                  ) : null}
                  {!unbilledSummary && (unbilledTimeEntries.length > 0 || unbilledExpenses.length > 0) ? (
                    <WarningBanner>
                      Unbilled summary is still calculating. Showing time and expense data directly.
                    </WarningBanner>
                  ) : null}
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
                  {unbilledSummary ? (
                    <UnbilledSummaryCard
                      summary={unbilledSummary}
                      matter={selectedMatterDetail}
                      onCreateInvoice={handleCreateInvoiceFromSummary}
                      onInvoiceMilestone={handleCreateMilestoneInvoice}
                      onEnterSettlement={handleOpenSettlementModal}
                    />
                  ) : null}
                  <InvoicesSection
                    invoices={invoices}
                    loading={invoicesLoading}
                    error={invoicesError}
                    onCreateInvoice={handleCreateInvoiceFromSummary}
                    onSendInvoice={handleSendInvoice}
                    onViewInvoice={handleViewInvoice}
                    onResendInvoice={handleResendInvoice}
                    onVoidInvoice={handleVoidInvoice}
                    onEditDraft={handleEditDraftInvoice}
                    onSyncInvoice={handleSyncInvoice}
                  />
                </div>
              </BillingErrorBoundary>
            ) : detailSection === 'messages' && selectedMatterDetail ? (
              <MatterMessagesPanel
                key={`messages-${selectedMatterDetail.id}`}
                matter={selectedMatterDetail}
                practiceId={activePracticeId}
                conversationBasePath={conversationBasePath}
              />
            ) : null}
          </section>
          </div>
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

        {isInvoiceBuilderOpen && selectedMatterDetail && activePracticeId ? (
          <InvoiceBuilder
            key={isInvoiceEditMode ? (editingInvoiceId ?? 'edit') : 'new'}
            practiceId={activePracticeId}
            matter={selectedMatterDetail}
            connectedAccountId={connectedAccountId}
            initialLineItems={invoiceSeedItems}
            initialDueDate={invoiceFormDefaults.dueDate}
            initialNotes={invoiceFormDefaults.notes}
            initialMemo={invoiceFormDefaults.memo}
            initialInvoiceType={invoiceFormDefaults.invoiceType}
            editMode={isInvoiceEditMode}
            existingInvoiceId={editingInvoiceId ?? undefined}
            invoiceContext={invoiceContext}
            onClose={closeInvoiceBuilder}
            onSuccess={handleInvoiceBuilderSuccess}
          />
        ) : null}

        {isSettlementModalOpen ? (
          <Modal
            isOpen={isSettlementModalOpen}
            onClose={() => setIsSettlementModalOpen(false)}
            title="Enter Settlement Amount"
            contentClassName="max-w-xl"
          >
            <div className="space-y-4">
              <p className="text-sm text-input-placeholder">
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
          </Modal>
        ) : null}
      </>
    );
  }

  // =========================================================================
  // Render — list route (default)
  // =========================================================================
  if (renderMode === 'detailOnly') {
    return null;
  }

  if (renderMode === 'listOnly') {
    return (
      <div className="h-full min-h-0 flex flex-col gap-2">
        {mattersError && <ErrorBanner>{mattersError}</ErrorBanner>}
        {listHeaderLeftControl ? (
          <div className="px-1 py-1">{listHeaderLeftControl}</div>
        ) : null}
        <Panel className="list-panel-card-gradient min-h-0 flex-1 overflow-hidden">
          <EntityList
            items={sortedMatterSummaries}
            renderItem={(matter, isSelected) => (
              <MatterListItem
                matter={matter}
                isSelected={isSelected}
                onSelect={(selected) => goToDetail(selected.id)}
              />
            )}
            onSelect={(matter) => goToDetail(matter.id)}
            selectedId={selectedMatterId ?? undefined}
            isLoading={mattersLoading}
            isLoadingMore={mattersLoadingMore}
            error={mattersError}
            emptyState={<div className="p-4 text-sm text-input-placeholder">No matters found.</div>}
          />
        </Panel>
      </div>
    );
  }

  return (
    <Page className="min-h-full">
      <div className="max-w-6xl mx-auto flex flex-col gap-6">
        <PageHeader
          title="Matters"
          subtitle="Track matter progress, people updates, and case milestones."
          actions={
            <Button
              size="sm"
              icon={PlusIcon} iconClassName="h-4 w-4"
              onClick={() => navigate(`${basePath}/new`)}
              disabled={!activePracticeId}
            >
              Create Matter
            </Button>
          }
        />

        {isClientListTruncated && (
          <WarningBanner>
            <strong>Warning:</strong> The people list is incomplete. Some names or options may be missing.
          </WarningBanner>
        )}

        {mattersError && <ErrorBanner>{mattersError}</ErrorBanner>}

        <Panel className="list-panel-card-gradient overflow-hidden">
          <EntityList
            items={sortedMatterSummaries}
            renderItem={(matter, isSelected) => (
              <MatterListItem
                matter={matter}
                isSelected={isSelected}
                onSelect={(selected) => goToDetail(selected.id)}
              />
            )}
            onSelect={(matter) => goToDetail(matter.id)}
            selectedId={selectedMatterId ?? undefined}
            isLoading={mattersLoading}
            isLoadingMore={mattersLoadingMore}
            error={mattersError}
            emptyState={<EmptyState onCreate={() => navigate(`${basePath}/new`)} disableCreate={!activePracticeId} />}
          />
        </Panel>
      </div>
    </Page>
  );
};
