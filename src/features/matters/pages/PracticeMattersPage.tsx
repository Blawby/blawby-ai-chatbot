import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { PageHeader } from '@/shared/ui/layout/PageHeader';
import { Tabs, type TabItem } from '@/shared/ui/tabs/Tabs';
import { Button } from '@/shared/ui/Button';
import { Breadcrumbs } from '@/shared/ui/navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/shared/ui/dropdown';
import { ActivityTimeline, type TimelineItem } from '@/shared/ui/activity/ActivityTimeline';
import Modal from '@/shared/components/Modal';
import { ChevronUpDownIcon, FolderIcon, PlusIcon } from '@heroicons/react/24/outline';
import type { MattersSidebarStatus } from '@/shared/hooks/useMattersSidebar';
import {
  type MatterDetail,
  type MatterExpense,
  type MatterNote,
  type MatterOption,
  type MatterSummary,
  type TimeEntry
} from '@/features/matters/data/mockMatters';
import { MatterCreateModal, MatterEditModal, type MatterFormState } from '@/features/matters/components/MatterCreateModal';
import { MatterListItem } from '@/features/matters/components/MatterListItem';
import { MatterStatusDot } from '@/features/matters/components/MatterStatusDot';
import { MatterStatusPill } from '@/features/matters/components/MatterStatusPill';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
import { TimeEntriesPanel } from '@/features/matters/components/time-entries/TimeEntriesPanel';
import { TimeEntryForm, type TimeEntryFormValues } from '@/features/matters/components/time-entries/TimeEntryForm';
import { MatterExpensesPanel } from '@/features/matters/components/expenses/MatterExpensesPanel';
import { MatterMessagesPanel } from '@/features/matters/components/messages/MatterMessagesPanel';
import { MatterMilestonesPanel } from '@/features/matters/components/milestones/MatterMilestonesPanel';
import { MatterNotesPanel } from '@/features/matters/components/notes/MatterNotesPanel';
import { MatterSummaryCards } from '@/features/matters/components/MatterSummaryCards';
import { Avatar } from '@/shared/ui/profile';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { usePracticeDetails } from '@/shared/hooks/usePracticeDetails';
import { asMajor, type MajorAmount } from '@/shared/utils/money';
import {
  createMatter,
  getMatter,
  getMatterActivity,
  listMatters,
  updateMatter,
  type BackendMatter,
  type BackendMatterActivity,
  type BackendMatterExpense,
  type BackendMatterMilestone,
  type BackendMatterNote,
  type BackendMatterTimeEntry,
  type BackendMatterTimeStats,
  createMatterExpense,
  createMatterNote,
  createMatterMilestone,
  createMatterTimeEntry,
  deleteMatterExpense,
  deleteMatterMilestone,
  deleteMatterNote,
  deleteMatterTimeEntry,
  getMatterTimeEntryStats,
  listMatterExpenses,
  listMatterMilestones,
  listMatterNotes,
  listMatterTimeEntries,
  reorderMatterMilestones,
  updateMatterExpense,
  updateMatterMilestone,
  updateMatterNote,
  updateMatterTimeEntry
} from '@/features/matters/services/mattersApi';

const statusOrder: Record<MattersSidebarStatus, number> = {
  lead: 0,
  open: 1,
  in_progress: 2,
  completed: 3,
  archived: 4
};

type MatterTabId = 'all' | MattersSidebarStatus;
type DetailTabId = 'overview' | 'time' | 'messages';

type SortOption = 'updated' | 'title' | 'status' | 'client' | 'assigned' | 'practice_area';

const SORT_LABELS: Record<SortOption, string> = {
  updated: 'Date updated',
  title: 'Title',
  status: 'Status',
  client: 'Client',
  assigned: 'Assigned',
  practice_area: 'Practice area'
};

const buildTabs = (counts: Record<MattersSidebarStatus, number>): TabItem[] => [
  { id: 'all', label: 'All', count: Object.values(counts).reduce((sum, value) => sum + value, 0) },
  { id: 'lead', label: 'Leads', count: counts.lead },
  { id: 'open', label: 'Open', count: counts.open },
  { id: 'in_progress', label: 'In Progress', count: counts.in_progress },
  { id: 'completed', label: 'Completed', count: counts.completed },
  { id: 'archived', label: 'Archived', count: counts.archived }
];

const TAB_HEADINGS: Record<MatterTabId, string> = {
  all: 'All',
  lead: 'Lead',
  open: 'Open',
  in_progress: 'In Progress',
  completed: 'Completed',
  archived: 'Archived'
};

const DETAIL_TABS: Array<{ id: DetailTabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'time', label: 'Billing' },
  { id: 'messages', label: 'Messages' }
];

type PracticeMattersPageProps = {
  basePath?: string;
};

const formatLongDate = (value?: string | null) => {
  if (!value) return 'Not available';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not available';
  return parsed.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

const resolveClientLabel = (clientId?: string | null) =>
  clientId ? `Client ${clientId.slice(0, 8)}` : 'Unassigned client';

const resolvePracticeServiceLabel = (serviceId?: string | null) =>
  serviceId ? `Service ${serviceId.slice(0, 8)}` : 'Not specified';

const normalizeMatterStatus = (status?: string | null): MattersSidebarStatus => {
  const normalized = status?.toLowerCase().replace(/\s+/g, '_');
  if (normalized === 'draft') return 'lead';
  if (normalized === 'active') return 'open';
  if (
    normalized === 'lead' ||
    normalized === 'open' ||
    normalized === 'in_progress' ||
    normalized === 'completed' ||
    normalized === 'archived'
  ) {
    return normalized;
  }
  return 'open';
};

const mapStatusToBackend = (
  status: MattersSidebarStatus
): 'draft' | 'open' | 'in_progress' | 'completed' | 'archived' =>
  status === 'lead' ? 'draft' : status;

const extractAssigneeIds = (matter: BackendMatter): string[] => {
  if (Array.isArray(matter.assignee_ids)) {
    return matter.assignee_ids.filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
  }
  if (Array.isArray(matter.assignees)) {
    return matter.assignees
      .map((assignee) => {
        if (typeof assignee === 'string') return assignee;
        if (!assignee || typeof assignee !== 'object') return '';
        const record = assignee as Record<string, unknown>;
        if (typeof record.id === 'string') return record.id;
        if (typeof record.user_id === 'string') return record.user_id;
        return '';
      })
      .filter((id) => id.trim().length > 0);
  }
  return [];
};

const mapMilestones = (milestones?: BackendMatter['milestones']): MatterDetail['milestones'] => {
  if (!Array.isArray(milestones)) return [];
  return milestones.map((item, index) => {
    if (!item || typeof item !== 'object') {
      return {
        description: `Milestone ${index + 1}`,
        dueDate: '',
        amount: asMajor(0)
      };
    }
    const record = item as Record<string, unknown>;
    return {
      description: typeof record.description === 'string' ? record.description : `Milestone ${index + 1}`,
      dueDate: typeof record.due_date === 'string'
        ? record.due_date
        : typeof record.dueDate === 'string'
          ? record.dueDate
          : '',
      amount: typeof record.amount === 'number' ? asMajor(record.amount) : asMajor(0)
    };
  });
};

const toMatterSummary = (matter: BackendMatter): MatterSummary => {
  const updatedAt = matter.updated_at || matter.created_at || new Date().toISOString();
  return {
    id: matter.id,
    title: matter.title || 'Untitled matter',
    clientName: resolveClientLabel(matter.client_id),
    practiceArea: matter.practice_service_id ? resolvePracticeServiceLabel(matter.practice_service_id) : null,
    status: normalizeMatterStatus(matter.status),
    updatedAt
  };
};

const toMatterDetail = (matter: BackendMatter): MatterDetail => ({
  ...toMatterSummary(matter),
  clientId: matter.client_id || '',
  practiceAreaId: matter.practice_service_id || '',
  assigneeIds: extractAssigneeIds(matter),
  description: matter.description || '',
  billingType: (matter.billing_type as MatterDetail['billingType']) || 'hourly',
  attorneyHourlyRate: typeof matter.attorney_hourly_rate === 'number'
    ? asMajor(matter.attorney_hourly_rate)
    : undefined,
  adminHourlyRate: typeof matter.admin_hourly_rate === 'number'
    ? asMajor(matter.admin_hourly_rate)
    : undefined,
  paymentFrequency: (matter.payment_frequency as MatterDetail['paymentFrequency']) ?? undefined,
  totalFixedPrice: typeof matter.total_fixed_price === 'number'
    ? asMajor(matter.total_fixed_price)
    : undefined,
  milestones: mapMilestones(matter.milestones),
  contingencyPercent: matter.contingency_percentage ?? undefined,
  timeEntries: [],
  expenses: [],
  notes: []
});

const resolveActivityType = (activity: BackendMatterActivity): TimelineItem['type'] => {
  const content = `${activity.action ?? ''} ${activity.description ?? ''}`.toLowerCase();
  if (content.includes('create')) return 'created';
  if (content.includes('comment')) return 'commented';
  if (content.includes('pay')) return 'paid';
  if (content.includes('view')) return 'viewed';
  if (content.includes('send')) return 'sent';
  return 'edited';
};

const toActivityTimelineItem = (activity: BackendMatterActivity): TimelineItem => {
  const createdAt = activity.created_at ?? new Date().toISOString();
  const userLabel = activity.user_id ? `User ${activity.user_id.slice(0, 6)}` : 'System';
  const type = resolveActivityType(activity);
  const date = formatRelativeTime(createdAt);
  return {
    id: activity.id,
    type,
    person: { name: userLabel },
    date: date || 'Just now',
    dateTime: createdAt,
    comment: type === 'commented' ? activity.description ?? undefined : undefined,
    action: type !== 'commented' ? activity.action ?? activity.description ?? undefined : undefined
  };
};

const toNote = (note: BackendMatterNote): MatterNote => {
  const createdAt = note.created_at ?? new Date().toISOString();
  const updatedAt = note.updated_at ?? undefined;
  const userLabel = note.user_id ? `User ${note.user_id.slice(0, 6)}` : 'System';
  return {
    id: note.id,
    author: {
      name: userLabel
    },
    content: note.content ?? '',
    createdAt,
    updatedAt
  };
};

const toTimeEntry = (entry: BackendMatterTimeEntry): TimeEntry => ({
  id: entry.id,
  startTime: entry.start_time ?? new Date().toISOString(),
  endTime: entry.end_time ?? new Date().toISOString(),
  description: entry.description ?? ''
});

const toExpense = (expense: BackendMatterExpense): MatterExpense => ({
  id: expense.id,
  description: expense.description ?? 'Expense',
  amount: asMajor(expense.amount ?? 0),
  date: expense.date ?? new Date().toISOString().slice(0, 10),
  billable: expense.billable ?? true
});

const toMilestone = (milestone: BackendMatterMilestone): MatterDetail['milestones'][number] => ({
  id: milestone.id,
  description: milestone.description ?? 'Milestone',
  amount: asMajor(milestone.amount ?? 0),
  dueDate: milestone.due_date ?? '',
  status: ((): MatterDetail['milestones'][number]['status'] => {
    const status = milestone.status ?? undefined;
    if (!status) return undefined;
    if (status === 'pending' || status === 'in_progress' || status === 'completed' || status === 'overdue') {
      return status;
    }
    return undefined;
  })()
});

const EmptyState = ({ onCreate, disableCreate }: { onCreate?: () => void; disableCreate?: boolean }) => (
  <div className="flex h-full items-center justify-center p-8">
    <div className="max-w-md text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-light-hover dark:bg-dark-hover">
        <FolderIcon className="h-6 w-6 text-gray-600 dark:text-gray-300" aria-hidden="true" />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-gray-900 dark:text-white">No matters yet</h3>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
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
  <div className="flex h-full items-center justify-center p-8 text-sm text-gray-500 dark:text-gray-400">
    {message}
  </div>
);

export const PracticeMattersPage = ({ basePath = '/practice/matters' }: PracticeMattersPageProps) => {
  const location = useLocation();
  const pathSuffix = location.path.startsWith(basePath)
    ? location.path.slice(basePath.length)
    : '';
  const firstSegment = pathSuffix.replace(/^\/+/, '').split('/')[0] ?? '';
  const selectedMatterId = firstSegment && firstSegment !== 'activity'
    ? decodeURIComponent(firstSegment)
    : null;
  const { activePracticeId } = useSessionContext();
  const { showError } = useToastContext();
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

  const [matters, setMatters] = useState<BackendMatter[]>([]);
  const [mattersLoading, setMattersLoading] = useState(false);
  const [mattersError, setMattersError] = useState<string | null>(null);
  const [mattersRefreshKey, setMattersRefreshKey] = useState(0);
  const [mattersPage, setMattersPage] = useState(1);
  const [mattersHasMore, setMattersHasMore] = useState(true);
  const [mattersLoadingMore, setMattersLoadingMore] = useState(false);
  const pageSize = 50;
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [selectedMatterDetail, setSelectedMatterDetail] = useState<MatterDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [activityItems, setActivityItems] = useState<TimelineItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [notes, setNotes] = useState<MatterNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
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

  const [activeTab, setActiveTab] = useState<MatterTabId>('all');
  const [sortOption, setSortOption] = useState<SortOption>('updated');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [modalKey, setModalKey] = useState(0);
  const [detailTab, setDetailTab] = useState<DetailTabId>('overview');
  const [isQuickTimeEntryOpen, setIsQuickTimeEntryOpen] = useState(false);
  const [quickTimeEntryKey, setQuickTimeEntryKey] = useState(0);

  const refreshMatters = useCallback(() => {
    setMattersRefreshKey((prev) => prev + 1);
  }, []);

  const openQuickTimeEntry = () => {
    setQuickTimeEntryKey((prev) => prev + 1);
    setIsQuickTimeEntryOpen(true);
  };

  const handleQuickTimeSubmit = async (values: TimeEntryFormValues) => {
    if (!activePracticeId || !selectedMatterId) return;
    try {
      await createMatterTimeEntry(activePracticeId, selectedMatterId, {
        start_time: values.startTime,
        end_time: values.endTime,
        description: values.description,
        billable: true
      });
      const [entries, stats] = await Promise.all([
        listMatterTimeEntries(activePracticeId, selectedMatterId),
        getMatterTimeEntryStats(activePracticeId, selectedMatterId)
      ]);
      setTimeEntries(entries.map(toTimeEntry));
      setTimeStats(stats);
      setIsQuickTimeEntryOpen(false);
    } catch (error) {
      console.error('[PracticeMattersPage] Failed to save quick time entry', error);
      showError('Could not save time entry', 'Please try again.');
    }
  };

  const clientOptions = useMemo<MatterOption[]>(() => {
    // TODO: Replace with clients API when available.
    return [];
  }, []);
  const practiceAreaOptions = useMemo<MatterOption[]>(() => {
    const services = practiceDetails?.services;
    if (!Array.isArray(services)) return [];
    return services
      .filter((service): service is { id: string; name: string; key?: string } =>
        !!service && typeof service === 'object' && typeof service.id === 'string' && typeof service.name === 'string'
      )
      .map((service) => ({
        id: service.id,
        name: service.name,
        role: service.key
      }));
  }, [practiceDetails?.services]);
  const assigneeOptions = useMemo<MatterOption[]>(() => {
    if (!activePracticeId) return [];
    const members = getMembers(activePracticeId);
    return members.map((member) => ({
      id: member.userId,
      name: member.name ?? member.email,
      email: member.email,
      role: member.role
    }));
  }, [activePracticeId, getMembers]);

  const assigneeNameById = useMemo(() => {
    return new Map(assigneeOptions.map((assignee) => [assignee.id, assignee.name]));
  }, [assigneeOptions]);

  const serviceNameById = useMemo(() => {
    return new Map(practiceAreaOptions.map((service) => [service.id, service.name]));
  }, [practiceAreaOptions]);

  useEffect(() => {
    if (!activePracticeId) return;
    void fetchMembers(activePracticeId, { force: false });
  }, [activePracticeId, fetchMembers]);

  useEffect(() => {
    if (!activePracticeId || hasPracticeDetails) return;
    setServicesLoading(true);
    fetchPracticeDetails()
      .catch((error) => {
        console.warn('[PracticeMattersPage] Failed to load practice services', error);
      })
      .finally(() => {
        setServicesLoading(false);
      });
  }, [activePracticeId, fetchPracticeDetails, hasPracticeDetails]);

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

    listMatters(activePracticeId, { signal: controller.signal, page: 1, limit: pageSize })
      .then((items) => {
        setMatters(items);
        setMattersHasMore(items.length === pageSize);
      })
      .catch((error: unknown) => {
        if ((error as DOMException).name === 'AbortError') return;
        const message = error instanceof Error ? error.message : 'Failed to load matters';
        setMattersError(message);
      })
      .finally(() => {
        setMattersLoading(false);
      });

    return () => controller.abort();
  }, [activePracticeId, mattersRefreshKey, pageSize]);

  const loadMoreMatters = useCallback(async () => {
    if (!activePracticeId || mattersLoadingMore || mattersLoading || !mattersHasMore) {
      return;
    }
    const nextPage = mattersPage + 1;
    setMattersLoadingMore(true);
    try {
      const items = await listMatters(activePracticeId, { page: nextPage, limit: pageSize });
      setMatters((prev) => [...prev, ...items]);
      setMattersPage(nextPage);
      setMattersHasMore(items.length === pageSize);
    } catch (error) {
      console.error('[PracticeMattersPage] Failed to load more matters', error);
      showError('Could not load more matters', 'Please try again.');
    } finally {
      setMattersLoadingMore(false);
    }
  }, [activePracticeId, mattersHasMore, mattersLoading, mattersLoadingMore, mattersPage, pageSize, showError]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target) return;
    if (!mattersHasMore || mattersLoading || mattersLoadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          void loadMoreMatters();
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [loadMoreMatters, mattersHasMore, mattersLoading, mattersLoadingMore]);

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
        const message = error instanceof Error ? error.message : 'Failed to load matter';
        setDetailError(message);
      })
      .finally(() => {
        setDetailLoading(false);
      });

    return () => controller.abort();
  }, [activePracticeId, selectedMatterId]);

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
        setActivityItems(items.map(toActivityTimelineItem));
      })
      .catch((error: unknown) => {
        if ((error as DOMException).name === 'AbortError') return;
        console.warn('[PracticeMattersPage] Failed to load activity', error);
        setActivityItems([]);
      })
      .finally(() => {
        setActivityLoading(false);
      });

    return () => controller.abort();
  }, [activePracticeId, selectedMatterId]);

  useEffect(() => {
    if (!activePracticeId || !selectedMatterId) {
      setNotes([]);
      setNotesError(null);
      setNotesLoading(false);
      return;
    }

    const controller = new AbortController();
    setNotesLoading(true);
    setNotesError(null);

    listMatterNotes(activePracticeId, selectedMatterId, { signal: controller.signal })
      .then((items) => {
        setNotes(items.map(toNote));
      })
      .catch((error: unknown) => {
        if ((error as DOMException).name === 'AbortError') return;
        const message = error instanceof Error ? error.message : 'Failed to load notes';
        setNotesError(message);
      })
      .finally(() => {
        setNotesLoading(false);
      });

    return () => controller.abort();
  }, [activePracticeId, selectedMatterId]);

  useEffect(() => {
    if (!activePracticeId || !selectedMatterId) {
      setTimeEntries([]);
      setTimeEntriesError(null);
      setTimeEntriesLoading(false);
      setTimeStats(null);
      return;
    }

    const controller = new AbortController();
    setTimeEntriesLoading(true);
    setTimeEntriesError(null);

    Promise.all([
      listMatterTimeEntries(activePracticeId, selectedMatterId, { signal: controller.signal }),
      getMatterTimeEntryStats(activePracticeId, selectedMatterId, { signal: controller.signal })
    ])
      .then(([entries, stats]) => {
        setTimeEntries(entries.map(toTimeEntry));
        setTimeStats(stats);
      })
      .catch((error: unknown) => {
        if ((error as DOMException).name === 'AbortError') return;
        const message = error instanceof Error ? error.message : 'Failed to load time entries';
        setTimeEntriesError(message);
      })
      .finally(() => {
        setTimeEntriesLoading(false);
      });

    return () => controller.abort();
  }, [activePracticeId, selectedMatterId]);

  useEffect(() => {
    if (!activePracticeId || !selectedMatterId) {
      setExpenses([]);
      setExpensesError(null);
      setExpensesLoading(false);
      return;
    }

    const controller = new AbortController();
    setExpensesLoading(true);
    setExpensesError(null);

    listMatterExpenses(activePracticeId, selectedMatterId, { signal: controller.signal })
      .then((items) => {
        setExpenses(items.map(toExpense));
      })
      .catch((error: unknown) => {
        if ((error as DOMException).name === 'AbortError') return;
        const message = error instanceof Error ? error.message : 'Failed to load expenses';
        setExpensesError(message);
      })
      .finally(() => {
        setExpensesLoading(false);
      });

    return () => controller.abort();
  }, [activePracticeId, selectedMatterId]);

  useEffect(() => {
    if (!activePracticeId || !selectedMatterId) {
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
        setSelectedMatterDetail((prev) => (prev ? { ...prev, milestones: mapped } : prev));
      })
      .catch((error: unknown) => {
        if ((error as DOMException).name === 'AbortError') return;
        console.warn('[PracticeMattersPage] Failed to load milestones', error);
        const message = error instanceof Error ? error.message : 'Failed to load milestones';
        setMilestonesError(message);
      })
      .finally(() => {
        setMilestonesLoading(false);
      });

    return () => controller.abort();
  }, [activePracticeId, selectedMatterId]);

  const handleCreateMilestone = useCallback(async (values: { description: string; amount: MajorAmount; dueDate: string; status?: string }) => {
    if (!activePracticeId || !selectedMatterId) {
      throw new Error('Practice ID and matter ID are required');
    }

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
      setSelectedMatterDetail((prev) => (prev ? { ...prev, milestones: next } : prev));
    } else {
      const refreshed = await listMatterMilestones(activePracticeId, selectedMatterId);
      const mapped = refreshed.map(toMilestone);
      setMilestones(mapped);
      setSelectedMatterDetail((prev) => (prev ? { ...prev, milestones: mapped } : prev));
    }
  }, [activePracticeId, milestones, selectedMatterId]);

  const handleUpdateMilestone = useCallback(async (
    milestone: MatterDetail['milestones'][number],
    values: { description: string; amount: MajorAmount; dueDate: string; status?: string }
  ) => {
    if (!activePracticeId || !selectedMatterId) {
      throw new Error('Practice ID and matter ID are required');
    }
    if (!milestone.id) {
      throw new Error('Milestone ID is required');
    }
    try {
      const updated = await updateMatterMilestone(activePracticeId, selectedMatterId, milestone.id, {
        description: values.description,
        amount: values.amount,
        due_date: values.dueDate,
        status: values.status ?? 'pending'
      });
      if (updated) {
        const next = milestones.map((item) => (item.id === milestone.id ? toMilestone(updated) : item));
        setMilestones(next);
        setSelectedMatterDetail((prev) => (prev ? { ...prev, milestones: next } : prev));
        return;
      }
      const refreshed = await listMatterMilestones(activePracticeId, selectedMatterId);
      const mapped = refreshed.map(toMilestone);
      setMilestones(mapped);
      setSelectedMatterDetail((prev) => (prev ? { ...prev, milestones: mapped } : prev));
    } catch (error) {
      console.error('[PracticeMattersPage] Failed to update milestone', error);
      showError('Could not update milestone', 'Please try again.');
      setMilestonesError('Unable to update milestone.');
      try {
        const refreshed = await listMatterMilestones(activePracticeId, selectedMatterId);
        const mapped = refreshed.map(toMilestone);
        setMilestones(mapped);
        setSelectedMatterDetail((prev) => (prev ? { ...prev, milestones: mapped } : prev));
      } catch (refreshError) {
        console.error('[PracticeMattersPage] Failed to refresh milestones', refreshError);
      }
    }
  }, [activePracticeId, milestones, selectedMatterId, showError]);

  const handleDeleteMilestone = useCallback(async (milestone: MatterDetail['milestones'][number]) => {
    if (!activePracticeId || !selectedMatterId) {
      throw new Error('Practice ID and matter ID are required');
    }
    if (!milestone.id) {
      throw new Error('Milestone ID is required');
    }
    try {
      await deleteMatterMilestone(activePracticeId, selectedMatterId, milestone.id);
      const next = milestones.filter((item) => item.id !== milestone.id);
      setMilestones(next);
      setSelectedMatterDetail((prev) => (prev ? { ...prev, milestones: next } : prev));
    } catch (error) {
      console.error('[PracticeMattersPage] Failed to delete milestone', error);
      showError('Could not delete milestone', 'Please try again.');
      setMilestonesError('Unable to delete milestone.');
      try {
        const refreshed = await listMatterMilestones(activePracticeId, selectedMatterId);
        const mapped = refreshed.map(toMilestone);
        setMilestones(mapped);
        setSelectedMatterDetail((prev) => (prev ? { ...prev, milestones: mapped } : prev));
      } catch (refreshError) {
        console.error('[PracticeMattersPage] Failed to refresh milestones', refreshError);
      }
    }
  }, [activePracticeId, milestones, selectedMatterId, showError]);

  const handleReorderMilestones = useCallback(async (nextOrder: MatterDetail['milestones']) => {
    if (!activePracticeId || !selectedMatterId) {
      return;
    }

    const previousMilestones = milestones;
    setMilestones(nextOrder);
    setSelectedMatterDetail((prev) => (prev ? { ...prev, milestones: nextOrder } : prev));

    const payload = nextOrder
      .map((milestone, index) => ({
        id: milestone.id ?? '',
        order: index + 1
      }))
      .filter((item) => item.id);

    if (payload.length === 0) {
      return;
    }

    try {
      await reorderMatterMilestones(activePracticeId, selectedMatterId, payload);
    } catch (error) {
      console.error('[PracticeMattersPage] Failed to reorder milestones', error);
      setMilestones(previousMilestones);
      setSelectedMatterDetail((prev) => (prev ? { ...prev, milestones: previousMilestones } : prev));
      showError('Could not reorder milestones', 'Please try again.');
    }
  }, [activePracticeId, milestones, selectedMatterId, showError]);

  const handleCreateNote = useCallback(async (values: { content: string }) => {
    if (!activePracticeId || !selectedMatterId) {
      throw new Error('Practice ID and matter ID are required');
    }
    const created = await createMatterNote(activePracticeId, selectedMatterId, values.content);
    if (created) {
      setNotes((prev) => [toNote(created), ...prev]);
    } else {
      const updated = await listMatterNotes(activePracticeId, selectedMatterId);
      setNotes(updated.map(toNote));
    }
  }, [activePracticeId, selectedMatterId]);

  const handleUpdateNote = useCallback(async (note: MatterNote, values: { content: string }) => {
    if (!activePracticeId || !selectedMatterId) {
      throw new Error('Practice ID and matter ID are required');
    }
    try {
      const updated = await updateMatterNote(activePracticeId, selectedMatterId, note.id, values.content);
      if (updated) {
        setNotes((prev) => prev.map((item) => (item.id === note.id ? toNote(updated) : item)));
        return;
      }
      const refreshed = await listMatterNotes(activePracticeId, selectedMatterId);
      setNotes(refreshed.map(toNote));
    } catch (error) {
      console.error('[PracticeMattersPage] Failed to update note', error);
      showError('Could not update note', 'Please try again.');
      setNotesError('Unable to update note.');
      try {
        const refreshed = await listMatterNotes(activePracticeId, selectedMatterId);
        setNotes(refreshed.map(toNote));
      } catch (refreshError) {
        console.error('[PracticeMattersPage] Failed to refresh notes', refreshError);
      }
    }
  }, [activePracticeId, selectedMatterId, showError]);

  const handleDeleteNote = useCallback(async (note: MatterNote) => {
    if (!activePracticeId || !selectedMatterId) {
      throw new Error('Practice ID and matter ID are required');
    }
    try {
      await deleteMatterNote(activePracticeId, selectedMatterId, note.id);
      setNotes((prev) => prev.filter((item) => item.id !== note.id));
    } catch (error) {
      console.error('[PracticeMattersPage] Failed to delete note', error);
      showError('Could not delete note', 'Please try again.');
      setNotesError('Unable to delete note.');
      try {
        const refreshed = await listMatterNotes(activePracticeId, selectedMatterId);
        setNotes(refreshed.map(toNote));
      } catch (refreshError) {
        console.error('[PracticeMattersPage] Failed to refresh notes', refreshError);
      }
    }
  }, [activePracticeId, selectedMatterId, showError]);

  const handleCreateExpense = useCallback(async (values: { description: string; amount: MajorAmount | undefined; date: string; billable: boolean }) => {
    if (!activePracticeId || !selectedMatterId) {
      throw new Error('Practice ID and matter ID are required');
    }
    if (values.amount === undefined) {
      throw new Error('Amount is required');
    }
    const created = await createMatterExpense(activePracticeId, selectedMatterId, {
      description: values.description,
      amount: values.amount,
      date: values.date,
      billable: values.billable
    });
    if (created) {
      setExpenses((prev) => [toExpense(created), ...prev]);
    } else {
      const updated = await listMatterExpenses(activePracticeId, selectedMatterId);
      setExpenses(updated.map(toExpense));
    }
  }, [activePracticeId, selectedMatterId]);

  const handleUpdateExpense = useCallback(async (expense: MatterExpense, values: { description: string; amount: MajorAmount | undefined; date: string; billable: boolean }) => {
    if (!activePracticeId || !selectedMatterId) {
      throw new Error('Practice ID and matter ID are required');
    }
    if (values.amount === undefined) {
      throw new Error('Amount is required');
    }
    try {
      const updated = await updateMatterExpense(activePracticeId, selectedMatterId, expense.id, {
        description: values.description,
        amount: values.amount,
        date: values.date,
        billable: values.billable
      });
      if (updated) {
        setExpenses((prev) => prev.map((item) => (item.id === expense.id ? toExpense(updated) : item)));
        return;
      }
      const refreshed = await listMatterExpenses(activePracticeId, selectedMatterId);
      setExpenses(refreshed.map(toExpense));
    } catch (error) {
      console.error('[PracticeMattersPage] Failed to update expense', error);
      showError('Could not update expense', 'Please try again.');
      setExpensesError('Unable to update expense.');
      try {
        const refreshed = await listMatterExpenses(activePracticeId, selectedMatterId);
        setExpenses(refreshed.map(toExpense));
      } catch (refreshError) {
        console.error('[PracticeMattersPage] Failed to refresh expenses', refreshError);
      }
    }
  }, [activePracticeId, selectedMatterId, showError]);

  const handleDeleteExpense = useCallback(async (expense: MatterExpense) => {
    if (!activePracticeId || !selectedMatterId) {
      throw new Error('Practice ID and matter ID are required');
    }
    try {
      await deleteMatterExpense(activePracticeId, selectedMatterId, expense.id);
      setExpenses((prev) => prev.filter((item) => item.id !== expense.id));
    } catch (error) {
      console.error('[PracticeMattersPage] Failed to delete expense', error);
      showError('Could not delete expense', 'Please try again.');
      setExpensesError('Unable to delete expense.');
      try {
        const refreshed = await listMatterExpenses(activePracticeId, selectedMatterId);
        setExpenses(refreshed.map(toExpense));
      } catch (refreshError) {
        console.error('[PracticeMattersPage] Failed to refresh expenses', refreshError);
      }
    }
  }, [activePracticeId, selectedMatterId, showError]);

  const handleSaveTimeEntry = useCallback(async (values: TimeEntryFormValues, existing?: TimeEntry | null) => {
    if (!activePracticeId || !selectedMatterId) return;
    try {
      if (existing?.id) {
        await updateMatterTimeEntry(activePracticeId, selectedMatterId, existing.id, {
          start_time: values.startTime,
          end_time: values.endTime,
          description: values.description,
          billable: true
        });
      } else {
        await createMatterTimeEntry(activePracticeId, selectedMatterId, {
          start_time: values.startTime,
          end_time: values.endTime,
          description: values.description,
          billable: true
        });
      }
      const [entries, stats] = await Promise.all([
        listMatterTimeEntries(activePracticeId, selectedMatterId),
        getMatterTimeEntryStats(activePracticeId, selectedMatterId)
      ]);
      setTimeEntries(entries.map(toTimeEntry));
      setTimeStats(stats);
    } catch (error) {
      console.error('[PracticeMattersPage] Failed to save time entry', error);
      showError('Could not save time entry', 'Please try again.');
    }
  }, [activePracticeId, selectedMatterId, showError]);

  const handleDeleteTimeEntry = useCallback(async (entry: TimeEntry) => {
    if (!activePracticeId || !selectedMatterId) {
      throw new Error('Practice ID and matter ID are required');
    }
    try {
      await deleteMatterTimeEntry(activePracticeId, selectedMatterId, entry.id);
      const [entries, stats] = await Promise.all([
        listMatterTimeEntries(activePracticeId, selectedMatterId),
        getMatterTimeEntryStats(activePracticeId, selectedMatterId)
      ]);
      setTimeEntries(entries.map(toTimeEntry));
      setTimeStats(stats);
    } catch (error) {
      console.error('[PracticeMattersPage] Failed to delete time entry', error);
      showError('Could not delete time entry', 'Please try again.');
    }
  }, [activePracticeId, selectedMatterId, showError]);

  const handleCreateMatter = useCallback(async (values: MatterFormState) => {
    if (!activePracticeId) {
      throw new Error('Practice ID is required to create a matter.');
    }

    const isUuid = (value: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

    const payload: Record<string, unknown> = {
      title: values.title.trim(),
      client_id: values.clientId && isUuid(values.clientId) ? values.clientId : null,
      description: values.description || null,
      billing_type: values.billingType,
      total_fixed_price: values.totalFixedPrice ?? null,
      contingency_percentage: values.contingencyPercent ?? null,
      settlement_amount: null,
      practice_service_id: values.practiceAreaId && isUuid(values.practiceAreaId) ? values.practiceAreaId : null,
      admin_hourly_rate: values.adminHourlyRate ?? null,
      attorney_hourly_rate: values.attorneyHourlyRate ?? null,
      payment_frequency: values.paymentFrequency ?? null,
      status: mapStatusToBackend(values.status),
      assignee_ids: values.assigneeIds,
      milestones: values.milestones.map((milestone, index) => ({
        description: milestone.description,
        amount: milestone.amount ?? 0,
        due_date: milestone.dueDate,
        order: index + 1
      }))
    };

    const created = await createMatter(activePracticeId, payload);
    refreshMatters();
    if (created?.id) {
      location.route(`${basePath}/${encodeURIComponent(created.id)}`);
    }
  }, [activePracticeId, basePath, location, refreshMatters]);

  const handleUpdateMatter = useCallback(async (values: MatterFormState) => {
    if (!activePracticeId || !selectedMatterId) {
      throw new Error('Matter ID is required to update.');
    }

    const payload: Record<string, unknown> = {
      title: values.title.trim(),
      client_id: values.clientId || null,
      description: values.description || null,
      billing_type: values.billingType,
      total_fixed_price: values.totalFixedPrice ?? null,
      contingency_percentage: values.contingencyPercent ?? null,
      settlement_amount: null,
      practice_service_id: values.practiceAreaId || null,
      admin_hourly_rate: values.adminHourlyRate ?? null,
      attorney_hourly_rate: values.attorneyHourlyRate ?? null,
      payment_frequency: values.paymentFrequency ?? null,
      status: mapStatusToBackend(values.status),
      assignee_ids: values.assigneeIds
    };

    await updateMatter(activePracticeId, selectedMatterId, payload);
    refreshMatters();
  }, [activePracticeId, selectedMatterId, refreshMatters]);

  const matterEntries = useMemo(() => {
    return matters.map((matter) => {
      const summary = toMatterSummary(matter);
      const serviceName = matter.practice_service_id
        ? serviceNameById.get(matter.practice_service_id) ?? summary.practiceArea
        : summary.practiceArea;
      return {
        summary: {
          ...summary,
          practiceArea: serviceName ?? summary.practiceArea
        },
        assigneeIds: extractAssigneeIds(matter)
      };
    });
  }, [matters, serviceNameById]);

  const matterSummaries = useMemo(() => matterEntries.map((entry) => entry.summary), [matterEntries]);

  const counts = useMemo(() => {
    return matterSummaries.reduce<Record<MattersSidebarStatus, number>>(
      (acc, matter) => {
        acc[matter.status] = (acc[matter.status] ?? 0) + 1;
        return acc;
      },
      {
        lead: 0,
        open: 0,
        in_progress: 0,
        completed: 0,
        archived: 0
      }
    );
  }, [matterSummaries]);

  const tabs = useMemo(() => buildTabs(counts), [counts]);

  const filteredMatters = useMemo(() => {
    if (activeTab === 'all') return matterEntries;
    return matterEntries.filter((entry) => entry.summary.status === activeTab);
  }, [activeTab, matterEntries]);

  const sortedMatters = useMemo(() => {
    const matters = [...filteredMatters];
    if (sortOption === 'title') {
      return matters.sort((a, b) => a.summary.title.localeCompare(b.summary.title));
    }
    if (sortOption === 'status') {
      return matters.sort((a, b) => statusOrder[a.summary.status] - statusOrder[b.summary.status]);
    }
    if (sortOption === 'client') {
      return matters.sort((a, b) => a.summary.clientName.localeCompare(b.summary.clientName));
    }
    if (sortOption === 'practice_area') {
      return matters.sort((a, b) => (a.summary.practiceArea ?? '').localeCompare(b.summary.practiceArea ?? ''));
    }
    if (sortOption === 'assigned') {
      return matters.sort((a, b) => {
        const aAssigneeId = a.assigneeIds?.[0] ?? '';
        const bAssigneeId = b.assigneeIds?.[0] ?? '';
        const aAssignee = aAssigneeId ? assigneeNameById.get(aAssigneeId) ?? '' : '';
        const bAssignee = bAssigneeId ? assigneeNameById.get(bAssigneeId) ?? '' : '';
        return aAssignee.localeCompare(bAssignee);
      });
    }
    return matters.sort((a, b) => new Date(b.summary.updatedAt).getTime() - new Date(a.summary.updatedAt).getTime());
  }, [assigneeNameById, filteredMatters, sortOption]);

  const sortedMatterSummaries = useMemo(() => sortedMatters.map((entry) => entry.summary), [sortedMatters]);

  const selectedMatterSummary = useMemo(() => (
    selectedMatterId ? matterSummaries.find((matter) => matter.id === selectedMatterId) ?? null : null
  ), [matterSummaries, selectedMatterId]);
  const resolvedSelectedMatter = selectedMatterDetail ?? selectedMatterSummary;

  const activeTabLabel = TAB_HEADINGS[activeTab] ?? 'All';
  const overviewDetails = useMemo(() => {
    if (!selectedMatterDetail || !resolvedSelectedMatter) return [];

    const resolveOptionLabel = (options: MatterOption[], id: string, fallback: string) =>
      options.find((option) => option.id === id)?.name ?? fallback;

    const clientIds = [
      selectedMatterDetail.clientId,
      ...((selectedMatterDetail as { clientIds?: string[] }).clientIds ?? [])
    ].filter(Boolean) as string[];
    const clientNames = clientIds.map((id) => resolveOptionLabel(clientOptions, id, resolveClientLabel(id)));
    if (clientNames.length === 0 && resolvedSelectedMatter.clientName) {
      clientNames.push(resolvedSelectedMatter.clientName);
    }

    const assigneeNames = selectedMatterDetail.assigneeIds
      .map((id) => resolveOptionLabel(assigneeOptions, id, `User ${id.slice(0, 6)}`))
      .filter(Boolean);

    const practiceAreaLabel = selectedMatterDetail.practiceArea
      ?? resolveOptionLabel(
        practiceAreaOptions,
        selectedMatterDetail.practiceAreaId,
        servicesLoading ? 'Loading services...' : resolvePracticeServiceLabel(selectedMatterDetail.practiceAreaId)
      );
    const billingLabel = selectedMatterDetail.billingType
      ? selectedMatterDetail.billingType.replace(/_/g, ' ').replace(/^\w/, (char) => char.toUpperCase())
      : 'Not specified';
    const statusLabel = resolvedSelectedMatter.status.replace(/_/g, ' ');
    const createdLabel = formatLongDate(resolvedSelectedMatter.updatedAt);

    return [
      { label: 'Description', value: selectedMatterDetail.description || 'No description provided' },
      { label: 'Practice Area', value: practiceAreaLabel },
      { label: 'Billing Type', value: billingLabel },
      {
        label: 'Client',
        value: clientNames.length > 0 ? clientNames.join(', ') : 'No client assigned',
        render: () => (
          clientNames.length > 0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {clientNames.map((name) => (
                <div key={name} className="flex items-center gap-2 rounded-full border border-gray-200 dark:border-white/10 px-2 py-1">
                  <Avatar name={name} size="xs" className="bg-gray-100 dark:bg-white/10" />
                  <span className="text-sm text-gray-700 dark:text-gray-200">{name}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">No client assigned</p>
          )
        )
      },
      {
        label: 'Assigned',
        value: assigneeNames.length > 0 ? assigneeNames.join(', ') : 'No assignee',
        render: () => (
          assigneeNames.length > 0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {assigneeNames.map((name) => (
                <div key={name} className="flex items-center gap-2 rounded-full border border-gray-200 dark:border-white/10 px-2 py-1">
                  <Avatar name={name} size="xs" className="bg-gray-100 dark:bg-white/10" />
                  <span className="text-sm text-gray-700 dark:text-gray-200">{name}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">No assignee</p>
          )
        )
      },
      { label: 'Status', value: statusLabel },
      { label: 'Created', value: createdLabel }
    ];
  }, [assigneeOptions, clientOptions, practiceAreaOptions, resolvedSelectedMatter, selectedMatterDetail, servicesLoading]);

  if (selectedMatterId) {
    if (detailLoading && !resolvedSelectedMatter) {
      return (
        <div className="h-full p-6">
          <LoadingState message="Loading matter details..." />
        </div>
      );
    }

    if (detailError && !resolvedSelectedMatter) {
      return (
        <div className="h-full p-6">
          <div className="max-w-5xl mx-auto space-y-6">
            <PageHeader
              title="Unable to load matter"
              subtitle={detailError}
              actions={(
                <Button size="sm" variant="secondary" onClick={() => location.route(basePath)}>
                  Back to matters
                </Button>
              )}
            />
          </div>
        </div>
      );
    }

    if (!resolvedSelectedMatter) {
      return (
        <div className="h-full p-6">
          <div className="max-w-5xl mx-auto space-y-6">
            <PageHeader
              title="Matter not found"
              subtitle="This matter may have been removed or is no longer available."
              actions={(
                <Button size="sm" variant="secondary" onClick={() => location.route(basePath)}>
                  Back to matters
                </Button>
              )}
            />
            <section className="rounded-2xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card-bg p-6">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                We could not find a matter with the ID{' '}
                <span className="font-mono text-gray-700 dark:text-gray-300">{selectedMatterId}</span>
                {' '}in this workspace.
              </p>
            </section>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-full p-6">
        <div className="max-w-6xl mx-auto flex flex-col gap-6">
          <div className="space-y-4">
            <Breadcrumbs
              items={[
                { label: 'Matters', href: basePath },
                { label: resolvedSelectedMatter.title }
              ]}
              onNavigate={(href) => location.route(href)}
            />
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <MatterStatusDot status={resolvedSelectedMatter.status} className="mt-1" />
                <div>
                  <h1 className="flex flex-wrap items-center gap-x-2 text-base font-semibold leading-7 text-gray-900 dark:text-white">
                    <span>{resolvedSelectedMatter.title}</span>
                    <span className="text-gray-400">/</span>
                    <span className="flex items-center gap-x-2 font-semibold text-gray-900 dark:text-white">
                      <Avatar
                        name={resolvedSelectedMatter.clientName}
                        size="xs"
                        className="bg-gray-200 text-gray-700 dark:bg-gray-700"
                      />
                      {resolvedSelectedMatter.clientName}
                    </span>
                  </h1>
                  <div className="mt-2 flex items-center gap-x-2.5 text-xs leading-5 text-gray-500 dark:text-gray-400">
                    <p className="truncate">Practice Area: {resolvedSelectedMatter.practiceArea || 'Not Assigned'}</p>
                    <svg viewBox="0 0 2 2" className="h-0.5 w-0.5 flex-none fill-gray-300 dark:fill-white/30">
                      <circle cx="1" cy="1" r="1" />
                    </svg>
                    <p className="whitespace-nowrap">Updated {formatRelativeTime(resolvedSelectedMatter.updatedAt)}</p>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <MatterStatusPill status={resolvedSelectedMatter.status} />
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!selectedMatterDetail}
                  onClick={() => {
                    setModalKey((prev) => prev + 1);
                    setIsEditOpen(true);
                  }}
                >
                  Edit Matter
                </Button>
              </div>
            </div>
          </div>

          <div className="border-b border-gray-200 dark:border-white/10">
            <nav className="-mb-px flex flex-wrap items-center gap-6" aria-label="Tabs">
              {DETAIL_TABS.map((tab) => {
                const isActive = detailTab === tab.id;
                return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setDetailTab(tab.id)}
                  className={[
                    'whitespace-nowrap border-b-2 py-3 text-sm font-medium transition-colors rounded-none',
                    isActive
                      ? 'border-gray-900 text-gray-900 dark:border-white dark:text-white'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                  ].join(' ')}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>
          </div>

          <MatterSummaryCards
            activeTab={detailTab}
            onAddTime={() => {
              if (detailTab !== 'overview') return;
              openQuickTimeEntry();
            }}
            onViewTimesheet={() => setDetailTab('time')}
            onChangeRate={() => {}}
            timeStats={timeStats}
          />

          <section>
            {detailTab === 'overview' ? (
              <div className="px-0 space-y-6">
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="rounded-2xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card-bg p-6">
                    <div className="space-y-5">
                      {overviewDetails.map((detail) => (
                        <div key={detail.label}>
                          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{detail.label}</h3>
                          {detail.label === 'Status' ? (
                            <p className="mt-2">
                              <MatterStatusPill status={resolvedSelectedMatter.status} />
                            </p>
                          ) : detail.render ? (
                            detail.render()
                          ) : (
                            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{detail.value}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Recent activity</h3>
                    <div className="mt-4 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card-bg p-4">
                      {activityLoading && activityItems.length === 0 ? (
                        <LoadingState message="Loading activity..." />
                      ) : (
                        <ActivityTimeline items={activityItems} showComposer composerDisabled />
                      )}
                    </div>
                  </div>
                </div>
                {selectedMatterDetail && (
                  <MatterMilestonesPanel
                    key={`milestones-overview-${selectedMatterDetail.id}`}
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
                {selectedMatterDetail && (
                  <MatterNotesPanel
                    key={`notes-${selectedMatterDetail.id}`}
                    matter={selectedMatterDetail}
                    notes={notes}
                    loading={notesLoading}
                    error={notesError}
                    onCreateNote={handleCreateNote}
                    onUpdateNote={handleUpdateNote}
                    onDeleteNote={handleDeleteNote}
                  />
                )}
              </div>
            ) : detailTab === 'time' && selectedMatterDetail ? (
              <div className="px-0 space-y-6">
                <TimeEntriesPanel
                  key={`time-${selectedMatterDetail.id}`}
                  entries={timeEntries}
                  onSaveEntry={(values, existing) => {
                    void handleSaveTimeEntry(values, existing);
                  }}
                  onDeleteEntry={(entry) => {
                    void handleDeleteTimeEntry(entry);
                  }}
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
                <section className="rounded-2xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card-bg">
                  <header className="flex items-center justify-between border-b border-gray-200 dark:border-white/10 px-6 py-4">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Recent transactions</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Summary of billed time across recent periods.
                      </p>
                    </div>
                  </header>
                  <div className="grid gap-4 p-6 sm:grid-cols-3">
                    {[
                      { label: 'Last 7 days', value: '$0.00' },
                      { label: 'Last 30 days', value: '$0.00' },
                      { label: 'Since start', value: '$1,237.50' }
                    ].map((card) => (
                      <div
                        key={card.label}
                        className="rounded-2xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card-bg p-4"
                      >
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{card.label}</p>
                        <p className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">{card.value}</p>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            ) : detailTab === 'messages' && selectedMatterDetail ? (
              <div className="px-0">
                <MatterMessagesPanel key={`messages-${selectedMatterDetail.id}`} matter={selectedMatterDetail} />
              </div>
            ) : (
              <div className="px-0 text-sm text-gray-500 dark:text-gray-400">
                We will add the {DETAIL_TABS.find((tab) => tab.id === detailTab)?.label ?? 'tab'} details next.
              </div>
            )}
          </section>
        </div>

        {isEditOpen && selectedMatterDetail && (
          <MatterEditModal
            key={modalKey}
            isOpen={isEditOpen}
            onClose={() => setIsEditOpen(false)}
            onSubmit={handleUpdateMatter}
            clients={clientOptions}
            practiceAreas={practiceAreaOptions}
            practiceAreasLoading={servicesLoading}
            assignees={assigneeOptions}
            initialValues={{
              title: selectedMatterDetail.title,
              clientId: selectedMatterDetail.clientId,
              practiceAreaId: selectedMatterDetail.practiceAreaId,
              assigneeIds: selectedMatterDetail.assigneeIds,
              status: selectedMatterDetail.status,
              billingType: selectedMatterDetail.billingType,
              attorneyHourlyRate: selectedMatterDetail.attorneyHourlyRate,
              adminHourlyRate: selectedMatterDetail.adminHourlyRate,
              paymentFrequency: selectedMatterDetail.paymentFrequency,
              totalFixedPrice: selectedMatterDetail.totalFixedPrice,
              milestones: selectedMatterDetail.milestones ?? [],
              contingencyPercent: selectedMatterDetail.contingencyPercent,
              description: selectedMatterDetail.description
            }}
          />
        )}

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
      </div>
    );
  }

  return (
    <div className="min-h-full p-6">
      <div className="max-w-6xl mx-auto flex flex-col gap-6">
        <PageHeader
          title="Matters"
          subtitle="Track matter progress, client updates, and case milestones."
          actions={(
            <div className="flex items-center gap-2">
              <Button size="sm" icon={<PlusIcon className="h-4 w-4" />} onClick={() => {
                setModalKey((prev) => prev + 1);
                setIsCreateOpen(true);
              }} disabled={!activePracticeId}>
                Create Matter
              </Button>
            </div>
          )}
        />

        <Tabs
          items={tabs}
          activeId={activeTab}
          onChange={(id) => setActiveTab(id as MatterTabId)}
          actions={(
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<ChevronUpDownIcon className="h-4 w-4" />}
                  iconPosition="right"
                >
                  Sort by {SORT_LABELS[sortOption]}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <div className="py-1">
                  {(Object.keys(SORT_LABELS) as SortOption[]).map((option) => (
                    <DropdownMenuItem
                      key={option}
                      onSelect={() => setSortOption(option)}
                      className={option === sortOption ? 'font-semibold text-gray-900 dark:text-white' : ''}
                    >
                      {SORT_LABELS[option]}
                    </DropdownMenuItem>
                  ))}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        />

        {mattersError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
            {mattersError}
          </div>
        )}

        <div className="flex flex-col gap-6">
          <section className="rounded-2xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card-bg overflow-hidden">
            <header className="flex items-center justify-between border-b border-gray-200 dark:border-white/10 px-4 py-4 sm:px-6 lg:px-8">
              <div>
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{activeTabLabel} Matters</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {sortedMatterSummaries.length} showing
                </p>
              </div>
            </header>
            {mattersLoading ? (
              <LoadingState message="Loading matters..." />
            ) : sortedMatterSummaries.length === 0 ? (
              <EmptyState
                onCreate={() => {
                  setModalKey((prev) => prev + 1);
                  setIsCreateOpen(true);
                }}
                disableCreate={!activePracticeId}
              />
            ) : (
              <ul className="divide-y divide-gray-200 dark:divide-white/10">
                {sortedMatterSummaries.map((matter) => (
                  <MatterListItem
                    key={matter.id}
                    matter={matter}
                    onSelect={(selected) => location.route(`${basePath}/${encodeURIComponent(selected.id)}`)}
                  />
                ))}
              </ul>
            )}
            {mattersHasMore && !mattersLoading && (
              <div ref={loadMoreRef} className="h-10" />
            )}
            {mattersLoadingMore && (
              <div className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                Loading more matters...
              </div>
            )}
          </section>

        </div>
      </div>

      {isCreateOpen && (
        <MatterCreateModal
          key={modalKey}
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          onSubmit={handleCreateMatter}
          clients={clientOptions}
          practiceAreas={practiceAreaOptions}
          practiceAreasLoading={servicesLoading}
          assignees={assigneeOptions}
        />
      )}
    </div>
  );
};
