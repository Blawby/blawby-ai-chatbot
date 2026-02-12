import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { PageHeader } from '@/shared/ui/layout/PageHeader';
import { Page } from '@/shared/ui/layout/Page';
import { Panel } from '@/shared/ui/layout/Panel';
import { Tabs, type TabItem } from '@/shared/ui/tabs/Tabs';
import { Button } from '@/shared/ui/Button';
import { Breadcrumbs } from '@/shared/ui/navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/shared/ui/dropdown';
import { ActivityTimeline, type TimelineItem, type TimelinePerson } from '@/shared/ui/activity/ActivityTimeline';
import Modal from '@/shared/components/Modal';
import { ChevronUpDownIcon, FolderIcon, PlusIcon } from '@heroicons/react/24/outline';
import type { MattersSidebarStatus } from '@/shared/hooks/useMattersSidebar';
import {
  type MatterDetail,
  type MatterExpense,
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

const statusOrder: Record<MattersSidebarStatus, number> = {
  active: 0,
  draft: 1
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
  { id: 'active', label: 'Active', count: counts.active },
  { id: 'draft', label: 'Drafts', count: counts.draft }
];

const TAB_HEADINGS: Record<MatterTabId, string> = {
  all: 'All',
  active: 'Active',
  draft: 'Draft'
};

const DETAIL_TABS: Array<{ id: DetailTabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'time', label: 'Billing' },
  { id: 'messages', label: 'Messages' }
];

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

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

const resolveClientLabel = (clientId?: string | null, fallback?: string) => {
  if (fallback) return fallback;
  return clientId ? `Client ${clientId.slice(0, 8)}` : 'Unassigned client';
};

const resolvePracticeServiceLabel = (serviceId?: string | null, fallback?: string) => {
  if (fallback) return fallback;
  return serviceId ? `Service ${serviceId.slice(0, 8)}` : 'Not specified';
};

const normalizeMatterStatus = (status?: string | null): MattersSidebarStatus => {
  const normalized = status?.toLowerCase().replace(/\s+/g, '_');
  if (normalized === 'draft') return 'draft';
  if (normalized === 'active') return 'active';
  // Fallback for any legacy statuses if they persist
  if (normalized === 'lead') return 'draft';
  return 'active';
};

const mapStatusToBackend = (status: MattersSidebarStatus): 'draft' | 'active' => status;

const prunePayload = (payload: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  );

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

const toMatterSummary = (
  matter: BackendMatter,
  options?: {
    clientNameById?: Map<string, string>;
    serviceNameById?: Map<string, string>;
  }
): MatterSummary => {
  const updatedAt = matter.updated_at || matter.created_at || new Date().toISOString();
  const clientName = matter.client_id
    ? options?.clientNameById?.get(matter.client_id)
    : undefined;
  const serviceName = matter.practice_service_id
    ? options?.serviceNameById?.get(matter.practice_service_id)
    : undefined;
  return {
    id: matter.id,
    title: matter.title || 'Untitled matter',
    clientName: resolveClientLabel(matter.client_id, clientName),
    practiceArea: matter.practice_service_id
      ? resolvePracticeServiceLabel(matter.practice_service_id, serviceName)
      : null,
    status: normalizeMatterStatus(matter.status),
    updatedAt,
    createdAt: matter.created_at || matter.updated_at || new Date().toISOString()
  };
};

const toMatterDetail = (
  matter: BackendMatter,
  options?: {
    clientNameById?: Map<string, string>;
    serviceNameById?: Map<string, string>;
  }
): MatterDetail => ({
  ...toMatterSummary(matter, options),
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

const activityActionMap: Record<string, { type: TimelineItem['type']; label: string }> = {
  matter_created: { type: 'created', label: 'created the matter.' },
  matter_updated: { type: 'edited', label: 'updated matter details.' },
  matter_deleted: { type: 'edited', label: 'deleted the matter.' },
  matter_status_changed: { type: 'edited', label: 'updated the status.' },
  note_added: { type: 'commented', label: 'added a note.' },
  note_updated: { type: 'commented', label: 'updated a note.' },
  note_deleted: { type: 'commented', label: 'deleted a note.' },
  time_entry_added: { type: 'edited', label: 'added a time entry.' },
  time_entry_updated: { type: 'edited', label: 'updated a time entry.' },
  time_entry_deleted: { type: 'edited', label: 'deleted a time entry.' },
  expense_added: { type: 'edited', label: 'added an expense.' },
  expense_updated: { type: 'edited', label: 'updated an expense.' },
  expense_deleted: { type: 'edited', label: 'deleted an expense.' },
  milestone_created: { type: 'edited', label: 'added a milestone.' },
  milestone_updated: { type: 'edited', label: 'updated a milestone.' },
  milestone_deleted: { type: 'edited', label: 'deleted a milestone.' },
  milestone_completed: { type: 'edited', label: 'completed a milestone.' },
  assignee_added: { type: 'edited', label: 'assigned a team member.' },
  assignee_removed: { type: 'edited', label: 'removed an assignee.' }
};

const humanizeAction = (value?: string | null): string | undefined => {
  if (!value) return undefined;
  return value
    .trim()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
};

const FIELD_LABELS: Record<string, string> = {
  title: 'title',
  description: 'description',
  client_id: 'client',
  practice_service_id: 'practice area',
  billing_type: 'billing type',
  admin_hourly_rate: 'admin rate',
  attorney_hourly_rate: 'attorney rate',
  status: 'status',
  payment_frequency: 'payment schedule',
  total_fixed_price: 'fixed fee',
  contingency_percentage: 'contingency percentage',
  settlement_amount: 'settlement amount',
  assignee_ids: 'team members',
  assignees: 'team members'
};

const normalizeFieldLabel = (field: string): string => {
  const trimmed = field.trim();
  if (!trimmed) return '';
  return FIELD_LABELS[trimmed] ?? trimmed.replace(/_/g, ' ');
};

const isEmailLike = (value: string): boolean => value.includes('@');

const isDifferentValue = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return false;
  const leftType = typeof left;
  const rightType = typeof right;
  if (leftType !== rightType) return true;
  if (leftType === 'function' || rightType === 'function') {
    return left !== right;
  }
  if (left && right && leftType === 'object') {
    try {
      return JSON.stringify(left) !== JSON.stringify(right);
    } catch {
      return true;
    }
  }
  return true;
};

const extractChangedFields = (metadata: Record<string, unknown>): string[] => {
  const detailed: string[] = [];
  const pushIfChanged = (field: string, fromValue: unknown, toValue: unknown) => {
    if (!field) return;
    if (isDifferentValue(fromValue, toValue)) {
      detailed.push(field);
    }
  };

  const changes = metadata.changes;
  if (Array.isArray(changes)) {
    changes.forEach((item) => {
      if (item && typeof item === 'object') {
        const field = (item as { field?: unknown; key?: unknown; name?: unknown }).field
          ?? (item as { key?: unknown }).key
          ?? (item as { name?: unknown }).name;
        const fromValue = (item as { from?: unknown; old?: unknown; previous?: unknown }).from
          ?? (item as { old?: unknown }).old
          ?? (item as { previous?: unknown }).previous;
        const toValue = (item as { to?: unknown; new?: unknown; current?: unknown }).to
          ?? (item as { new?: unknown }).new
          ?? (item as { current?: unknown }).current;
        if (typeof field === 'string') {
          if (fromValue !== undefined || toValue !== undefined) {
            pushIfChanged(field, fromValue, toValue);
          } else {
            detailed.push(field);
          }
        }
      } else if (typeof item === 'string') {
        detailed.push(item);
      }
    });
  } else if (changes && typeof changes === 'object') {
    Object.entries(changes).forEach(([field, payload]) => {
      if (payload && typeof payload === 'object') {
        const fromValue = (payload as { from?: unknown; old?: unknown; previous?: unknown }).from
          ?? (payload as { old?: unknown }).old
          ?? (payload as { previous?: unknown }).previous;
        const toValue = (payload as { to?: unknown; new?: unknown; current?: unknown }).to
          ?? (payload as { new?: unknown }).new
          ?? (payload as { current?: unknown }).current;
        if (fromValue !== undefined || toValue !== undefined) {
          pushIfChanged(field, fromValue, toValue);
        } else {
          detailed.push(field);
        }
      } else {
        detailed.push(field);
      }
    });
  }

  const diff = metadata.diff;
  if (diff && typeof diff === 'object' && !Array.isArray(diff)) {
    Object.entries(diff).forEach(([field, payload]) => {
      if (payload && typeof payload === 'object') {
        const fromValue = (payload as { from?: unknown; old?: unknown; previous?: unknown }).from
          ?? (payload as { old?: unknown }).old
          ?? (payload as { previous?: unknown }).previous;
        const toValue = (payload as { to?: unknown; new?: unknown; current?: unknown }).to
          ?? (payload as { new?: unknown }).new
          ?? (payload as { current?: unknown }).current;
        if (fromValue !== undefined || toValue !== undefined) {
          pushIfChanged(field, fromValue, toValue);
        } else {
          detailed.push(field);
        }
      } else {
        detailed.push(field);
      }
    });
  }

  if (detailed.length === 0) {
    const candidates = [
      metadata.changed_fields,
      metadata.changedFields,
      metadata.updated_fields,
      metadata.updatedFields,
      metadata.fields
    ];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        candidate.forEach((item) => {
          if (typeof item === 'string') detailed.push(item);
          if (item && typeof item === 'object') {
            const field = (item as { field?: unknown; key?: unknown; name?: unknown }).field
              ?? (item as { key?: unknown }).key
              ?? (item as { name?: unknown }).name;
            if (typeof field === 'string') detailed.push(field);
          }
        });
      }
    }
  }

  const normalized = detailed
    .map(normalizeFieldLabel)
    .filter((value) => value && value.length > 0);
  return Array.from(new Set(normalized));
};

const formatFieldList = (fields: string[]): string | null => {
  if (fields.length === 0) return null;
  if (fields.length === 1) return fields[0];
  if (fields.length === 2) return `${fields[0]} and ${fields[1]}`;
  return `${fields.slice(0, -1).join(', ')}, and ${fields[fields.length - 1]}`;
};

const resolveStatusLabel = (value: string): string => value.replace(/_/g, ' ');

const buildMatterCreatedLabel = (context: {
  title?: string | null;
  clientName?: string | null;
  practiceArea?: string | null;
}): string => {
  const title = context.title?.trim();
  const clientName = context.clientName?.trim();
  const practiceArea = context.practiceArea?.trim();
  if (title) {
    const clientSuffix = clientName ? ` for ${clientName}` : '';
    const practiceSuffix = practiceArea ? ` (${practiceArea})` : '';
    return `created matter “${title}”${clientSuffix}${practiceSuffix}.`;
  }
  if (clientName || practiceArea) {
    const clientSuffix = clientName ? ` for ${clientName}` : '';
    const practiceSuffix = practiceArea ? ` (${practiceArea})` : '';
    return `created a matter${clientSuffix}${practiceSuffix}.`;
  }
  return 'created the matter.';
};

const resolveStatusChangeLabel = (metadata: Record<string, unknown>): string | null => {
  const candidate = metadata.status ?? metadata.new_status ?? metadata.to_status ?? metadata.to;
  if (typeof candidate === 'string' && candidate.trim()) {
    return `updated the status to ${resolveStatusLabel(candidate)}.`;
  }
  return null;
};

const formatDuration = (seconds?: number | null): string | null => {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) {
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  }
  if (hours > 0) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
};

const stripActorPrefix = (description: string, actorName: string): string => {
  const trimmed = description.trim();
  if (!actorName) return trimmed;
  const prefix = `${actorName} `;
  if (trimmed.toLowerCase().startsWith(prefix.toLowerCase())) {
    return trimmed.slice(prefix.length).trim();
  }
  return trimmed;
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
  const conversationBasePath = basePath.endsWith('/matters')
    ? basePath.replace(/\/matters$/, '/conversations')
    : '/practice/conversations';
  const { activePracticeId, session } = useSessionContext();
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
  const practiceDetailsRequestedRef = useRef<string | null>(null);
  const [selectedMatterDetail, setSelectedMatterDetail] = useState<MatterDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [activityItems, setActivityItems] = useState<TimelineItem[]>([]);
  const [noteItems, setNoteItems] = useState<TimelineItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [servicesLoading, setServicesLoading] = useState(false);
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
  const [clientOptions, setClientOptions] = useState<MatterOption[]>([]);
  const [isClientListTruncated, setIsClientListTruncated] = useState(false);
  const matterContext = useMemo(
    () => ({
      title: selectedMatterDetail?.title ?? null,
      clientName: selectedMatterDetail?.clientName ?? null,
      practiceArea: selectedMatterDetail?.practiceArea ?? null
    }),
    [selectedMatterDetail?.clientName, selectedMatterDetail?.practiceArea, selectedMatterDetail?.title]
  );

  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const [activeTab, setActiveTab] = useState<MatterTabId>('all');
  const [sortOption, setSortOption] = useState<SortOption>('updated');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [modalKey, setModalKey] = useState(0);
  const [detailTab, setDetailTab] = useState<DetailTabId>('overview');
  const [isQuickTimeEntryOpen, setIsQuickTimeEntryOpen] = useState(false);
  const [quickTimeEntryKey, setQuickTimeEntryKey] = useState(0);
  const refreshRequestIdRef = useRef(0);

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

  const buildClientOption = useCallback((detail: UserDetailRecord): MatterOption => {
    const name =
      detail.user?.name?.trim() ||
      detail.user?.email?.trim() ||
      detail.user?.phone?.trim() ||
      'Unknown Client';
    return {
      id: detail.id,
      name,
      email: detail.user?.email ?? undefined,
      role: 'client'
    };
  }, []);
  const clientNameById = useMemo(
    () => new Map(clientOptions.map((client) => [client.id, client.name])),
    [clientOptions]
  );
  const practiceAreaOptions = useMemo<MatterOption[]>(() => {
    const services = practiceDetails?.services;
    if (!Array.isArray(services)) return [];
    return services
      .filter((service): service is { id: string; name: string; key?: string } => {
        if (!service || typeof service !== 'object') return false;
        if (typeof service.id !== 'string' || !isUuid(service.id)) return false;
        if (typeof service.name !== 'string' || !service.name.trim()) return false;
        return true;
      })
      .map((service) => ({
        id: service.id,
        name: service.name,
        role: service.key
      }));
  }, [practiceDetails?.services]);
  const assigneeOptions = useMemo<MatterOption[]>(() => {
    if (!activePracticeId) return [];
    const members = getMembers(activePracticeId);
    return members
      .filter((member) => member.role !== 'member' && member.role !== 'client')
      .map((member) => ({
        id: member.userId,
        name: member.name ?? member.email,
        email: member.email,
        image: member.image ?? undefined,
        role: member.role
      }));
  }, [activePracticeId, getMembers]);

  const assigneeNameById = useMemo(() => {
    return new Map(assigneeOptions.map((assignee) => [assignee.id, assignee.name]));
  }, [assigneeOptions]);

  const membersById = useMemo(() => {
    if (!activePracticeId) return new Map<string, { name: string; email?: string | null; image?: string | null }>();
    const members = getMembers(activePracticeId);
    return new Map(
      members.map((member) => [
        member.userId,
        { name: member.name ?? '', email: member.email ?? null, image: member.image }
      ])
    );
  }, [activePracticeId, getMembers]);

  const serviceNameById = useMemo(() => {
    return new Map(practiceAreaOptions.map((service) => [service.id, service.name]));
  }, [practiceAreaOptions]);

  const resolveTimelinePerson = useCallback(
    (userId?: string | null): TimelinePerson => {
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
    },
    [membersById, session?.user?.id, session?.user?.image, session?.user?.name]
  );

  const toActivityTimelineItem = useCallback(
    (activity: BackendMatterActivity): TimelineItem => {
      const createdAt = activity.created_at ?? new Date().toISOString();
      const actionKey = activity.action ?? '';
      const mapped = activityActionMap[actionKey];
      const type = mapped?.type ?? 'edited';
      const date = formatRelativeTime(createdAt);
      const description = activity.description ?? undefined;
      const person = resolveTimelinePerson(activity.user_id);
      const metadata = activity.metadata ?? {};
      const timeEntryDuration = formatDuration(
        typeof (metadata as Record<string, unknown>).duration === 'number'
          ? (metadata as Record<string, unknown>).duration as number
          : null
      );
      const timeEntryDescription = typeof (metadata as Record<string, unknown>).description === 'string'
        ? (metadata as Record<string, unknown>).description as string
        : undefined;
      const cleanedDescription = description ? stripActorPrefix(description, person.name) : undefined;
      const action = (() => {
        if (type === 'commented') return undefined;
        if (actionKey === 'matter_created') {
          return buildMatterCreatedLabel(matterContext);
        }
        if (actionKey === 'matter_updated') {
          const fields = extractChangedFields(metadata as Record<string, unknown>);
          const formatted = formatFieldList(fields);
          if (formatted) return `updated ${formatted}.`;
          return cleanedDescription ?? 'updated matter details.';
        }
        if (actionKey === 'matter_status_changed') {
          return resolveStatusChangeLabel(metadata as Record<string, unknown>) ?? 'updated the status.';
        }
        if (actionKey.startsWith('time_entry_')) {
          if (actionKey === 'time_entry_deleted') {
            return cleanedDescription ?? 'deleted a time entry.';
          }
          if (timeEntryDuration) {
            const verb = actionKey === 'time_entry_updated' ? 'updated' : 'logged';
            return timeEntryDescription
              ? `${verb} ${timeEntryDuration} for ${timeEntryDescription}.`
              : `${verb} ${timeEntryDuration}.`;
          }
          return cleanedDescription ?? 'logged time entry.';
        }
        if (actionKey.startsWith('milestone_')) {
          if (cleanedDescription) {
            return cleanedDescription;
          }
          return actionKey === 'milestone_completed'
            ? 'completed a milestone.'
            : actionKey === 'milestone_deleted'
              ? 'deleted a milestone.'
              : actionKey === 'milestone_updated'
                ? 'updated a milestone.'
                : 'added a milestone.';
        }
        return mapped?.label ?? cleanedDescription ?? humanizeAction(actionKey);
      })();
      return {
        id: activity.id,
        type,
        person,
        date: date || 'Just now',
        dateTime: createdAt,
        comment: type === 'commented' ? description : undefined,
        action
      };
    },
    [matterContext, resolveTimelinePerson]
  );

  const toNoteTimelineItem = useCallback(
    (note: BackendMatterNote): TimelineItem => {
      const createdAt = note.created_at ?? new Date().toISOString();
      const person = resolveTimelinePerson(note.user_id);
      const date = formatRelativeTime(createdAt);
      return {
        id: `note-${note.id}`,
        type: 'commented',
        person,
        date: date || 'Just now',
        dateTime: createdAt,
        comment: note.content ?? ''
      };
    },
    [resolveTimelinePerson]
  );

  useEffect(() => {
    if (!activePracticeId) return;
    void fetchMembers(activePracticeId, { force: false });
  }, [activePracticeId, fetchMembers]);

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
      try {
        const MAX_PAGES = 100;
        let iterations = 0;
        while (hasMore && !cancelled && !controller.signal.aborted && iterations < MAX_PAGES) {
          iterations++;
          const response = await listUserDetails(activePracticeId, {
            limit,
            offset,
            signal: controller.signal
          });
          if (cancelled || controller.signal.aborted) break;

          const options = response.data.map(buildClientOption);
          allClients.push(...options);

          // Determine if we should fetch more
          const count = response.data.length;
          lastTotal = response.total ?? 0;

          if (lastTotal > 0) {
            hasMore = allClients.length < lastTotal;
          } else {
            hasMore = count === limit;
          }

          if (hasMore) {
            offset += limit;
          }
        }

        if (!cancelled && !controller.signal.aborted) {
          setClientOptions(allClients);
          // Detect truncation if we broke loop prematurely or if total exceeds the amount we fetched
          const isTruncated = iterations >= MAX_PAGES || (lastTotal > allClients.length);
          setIsClientListTruncated(isTruncated);
        }
      } catch (error) {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
          return;
        }
        if (!cancelled) {
          console.error('[PracticeMattersPage] Failed to load clients', error);
          setClientOptions(allClients); // Show what we have
          setIsClientListTruncated(true);
          showError('Failed to load full client list', 'Some clients may be missing.');
        }
      }
    };

    void fetchAllClients();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activePracticeId, buildClientOption, showError]);

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
      .catch((error) => {
        console.warn('[PracticeMattersPage] Failed to load practice services', error);
      })
      .finally(() => {
        setServicesLoading(false);
      });
  }, [activePracticeId, fetchPracticeDetails, hasPracticeDetails, practiceDetails]);

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
        setSelectedMatterDetail(
          matter ? toMatterDetail(matter, { clientNameById, serviceNameById }) : null
        );
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
  }, [activePracticeId, clientNameById, selectedMatterId, serviceNameById]);

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
        const nextItems = items
          .filter((item) => !String(item.action ?? '').startsWith('note_'))
          .slice()
          .sort((a, b) => {
            const getTimestamp = (item: typeof a) => {
              if (!item.created_at) {
                console.warn('[PracticeMattersPage] Item missing created_at', { id: item.id, action: item.action });
                return 0;
              }
              const time = new Date(item.created_at).getTime();
              if (Number.isNaN(time)) {
                console.warn('[PracticeMattersPage] Item has invalid created_at', { id: item.id, action: item.action, value: item.created_at });
                return 0;
              }
              return time;
            };

            const aTime = getTimestamp(a);
            const bTime = getTimestamp(b);
            return aTime - bTime;
          })
          .map(toActivityTimelineItem);
        setActivityItems(nextItems);
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
  }, [activePracticeId, selectedMatterId, toActivityTimelineItem]);

  useEffect(() => {
    if (!activePracticeId || !selectedMatterId) {
      setNoteItems([]);
      return;
    }

    const controller = new AbortController();
    listMatterNotes(activePracticeId, selectedMatterId, { signal: controller.signal })
      .then((items) => {
        const nextNotes = items
          .slice()
          .sort((a, b) => {
            const getTimestamp = (item: typeof a) => {
              if (!item.created_at) return 0;
              const time = new Date(item.created_at).getTime();
              return Number.isNaN(time) ? 0 : time;
            };
            return getTimestamp(a) - getTimestamp(b);
          })
          .map(toNoteTimelineItem);
        setNoteItems(nextNotes);
      })
      .catch((error: unknown) => {
        if ((error as DOMException).name === 'AbortError') return;
        console.warn('[PracticeMattersPage] Failed to load notes for timeline', error);
        setNoteItems([]);
      });

    return () => controller.abort();
  }, [activePracticeId, selectedMatterId, toNoteTimelineItem]);

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
        setMilestonesError(null);
        return;
      }
      const refreshed = await listMatterMilestones(activePracticeId, selectedMatterId);
      const mapped = refreshed.map(toMilestone);
      setMilestones(mapped);
      setSelectedMatterDetail((prev) => (prev ? { ...prev, milestones: mapped } : prev));
      setMilestonesError(null);
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
      throw error;
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
      setMilestonesError(null);
    } catch (error) {
      console.error('[PracticeMattersPage] Failed to delete milestone', error);
      showError('Could not delete milestone', 'Please try again.');
      setMilestonesError('Unable to delete milestone.');
      try {
        const refreshed = await listMatterMilestones(activePracticeId, selectedMatterId);
        const mapped = refreshed.map(toMilestone);
        setMilestones(mapped);
        setSelectedMatterDetail((prev) => (prev ? { ...prev, milestones: mapped } : prev));
        setMilestonesError(null);
      } catch (refreshError) {
        console.error('[PracticeMattersPage] Failed to refresh milestones', refreshError);
      }
      throw error;
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
      const newItem = toNoteTimelineItem(created);
      setNoteItems((prev) => [...prev, newItem]);
    }
  }, [activePracticeId, selectedMatterId, toNoteTimelineItem]);

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
        setExpensesError(null);
        return;
      }
      const refreshed = await listMatterExpenses(activePracticeId, selectedMatterId);
      setExpenses(refreshed.map(toExpense));
      setExpensesError(null);
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
      throw error;
    }
  }, [activePracticeId, selectedMatterId, showError]);

  const handleDeleteExpense = useCallback(async (expense: MatterExpense) => {
    if (!activePracticeId || !selectedMatterId) {
      throw new Error('Practice ID and matter ID are required');
    }
    try {
      await deleteMatterExpense(activePracticeId, selectedMatterId, expense.id);
      setExpenses((prev) => prev.filter((item) => item.id !== expense.id));
      setExpensesError(null);
    } catch (error) {
      console.error('[PracticeMattersPage] Failed to delete expense', error);
      showError('Could not delete expense', 'Please try again.');
      setExpensesError('Unable to delete expense.');
      try {
        const refreshed = await listMatterExpenses(activePracticeId, selectedMatterId);
        setExpenses(refreshed.map(toExpense));
        setExpensesError(null);
      } catch (refreshError) {
        console.error('[PracticeMattersPage] Failed to refresh expenses', refreshError);
      }
      throw error;
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

    if (values.clientId && !isUuid(values.clientId)) {
      throw new Error(`Invalid client_id UUID: "${values.clientId}"`);
    }
    if (values.practiceAreaId && !isUuid(values.practiceAreaId)) {
      throw new Error(`Invalid practice_service_id UUID: "${values.practiceAreaId}"`);
    }

    const payload: Record<string, unknown> = {
      title: values.title.trim(),
      client_id: values.clientId || undefined,
      description: values.description || undefined,
      billing_type: values.billingType,
      total_fixed_price: values.totalFixedPrice ?? undefined,
      contingency_percentage: values.contingencyPercent ?? undefined,
      practice_service_id: values.practiceAreaId || undefined,
      admin_hourly_rate: values.adminHourlyRate ?? undefined,
      attorney_hourly_rate: values.attorneyHourlyRate ?? undefined,
      payment_frequency: values.paymentFrequency ?? undefined,
      status: mapStatusToBackend(values.status),
      assignee_ids: values.assigneeIds.length > 0 ? values.assigneeIds : undefined,
      milestones: values.milestones.map((milestone, index) => ({
        description: milestone.description,
        amount: milestone.amount ?? 0,
        due_date: milestone.dueDate,
        order: index + 1
      }))
    };

    const created = await createMatter(activePracticeId, prunePayload(payload));
    refreshMatters();
    if (created?.id) {
      location.route(`${basePath}/${encodeURIComponent(created.id)}`);
    }
  }, [activePracticeId, basePath, location, refreshMatters]);

  const refreshSelectedMatter = useCallback(async () => {
    if (!activePracticeId || !selectedMatterId) return;
    const requestId = ++refreshRequestIdRef.current;
    
    try {
      const activities = await getMatterActivity(activePracticeId, selectedMatterId);
      if (requestId !== refreshRequestIdRef.current || !isMounted.current) return;
      
      const nextItems = (activities ?? [])
        .filter((item) => !String(item.action ?? '').startsWith('note_'))
        .slice()
        .sort((a, b) => {
          const getTimestamp = (d?: string | null) => {
             const t = d ? new Date(d).getTime() : 0;
             return Number.isNaN(t) ? 0 : t;
          };
          return getTimestamp(a.created_at) - getTimestamp(b.created_at);
        })
        .map(toActivityTimelineItem);
      
      setActivityItems(nextItems);
    } catch (error) {
      console.warn('[PracticeMattersPage] Failed to refresh activity', error);
    }

    try {
      const refreshed = await getMatter(activePracticeId, selectedMatterId);
      if (requestId !== refreshRequestIdRef.current || !isMounted.current) return;

      if (refreshed) {
        setSelectedMatterDetail(
          toMatterDetail(refreshed, { clientNameById, serviceNameById })
        );
      }
    } catch (error) {
      console.warn('[PracticeMattersPage] Failed to refresh matter detail', error);
    }
  }, [activePracticeId, selectedMatterId, clientNameById, serviceNameById, toActivityTimelineItem]);

  const handleUpdateMatter = useCallback(async (values: MatterFormState) => {
    if (!activePracticeId || !selectedMatterId) return;

    if (values.clientId && !isUuid(values.clientId)) {
      throw new Error(`Invalid client_id UUID: "${values.clientId}"`);
    }
    if (values.practiceAreaId && !isUuid(values.practiceAreaId)) {
      throw new Error(`Invalid practice_service_id UUID: "${values.practiceAreaId}"`);
    }

    const payload: Partial<BackendMatter> = {
      title: values.title.trim(),
      description: values.description !== undefined ? values.description.trim() : undefined,
      client_id: values.clientId || (values.clientId === '' ? null : undefined),
      practice_service_id: values.practiceAreaId || (values.practiceAreaId === '' ? null : undefined),
      admin_hourly_rate: values.adminHourlyRate ?? undefined,
      attorney_hourly_rate: values.attorneyHourlyRate ?? undefined,
      payment_frequency: values.paymentFrequency ?? undefined,
      status: mapStatusToBackend(values.status),
      assignee_ids: values.assigneeIds.length > 0 ? values.assigneeIds : null
    };

    await updateMatter(activePracticeId, selectedMatterId, prunePayload(payload));
    refreshMatters();
    await refreshSelectedMatter();
  }, [
    activePracticeId,
    refreshMatters,
    selectedMatterId,
    refreshSelectedMatter
  ]);

  const matterEntries = useMemo(() => {
    return matters.map((matter) => {
      const summary = toMatterSummary(matter, { clientNameById, serviceNameById });
      return {
        summary: {
          ...summary
        },
        assigneeIds: extractAssigneeIds(matter)
      };
    });
  }, [clientNameById, matters, serviceNameById]);

  const matterSummaries = useMemo(() => matterEntries.map((entry) => entry.summary), [matterEntries]);

  const counts = useMemo(() => {
    return matterSummaries.reduce<Record<MattersSidebarStatus, number>>(
      (acc, matter) => {
        acc[matter.status] = (acc[matter.status] ?? 0) + 1;
        return acc;
      },
      {
        draft: 0,
        active: 0
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
  const timelineItems = useMemo(() => {
    const combined = [...activityItems, ...noteItems];
    return combined.sort((a, b) => {
      const getTimestamp = (d?: string | null) => {
        const t = d ? new Date(d).getTime() : 0;
        return Number.isFinite(t) ? t : 0;
      };
      const aTime = getTimestamp(a.dateTime);
      const bTime = getTimestamp(b.dateTime);
      return bTime - aTime;
    });
  }, [activityItems, noteItems]);

  const activeTabLabel = TAB_HEADINGS[activeTab] ?? 'All';
  const headerMeta = useMemo(() => {
    if (!selectedMatterDetail || !resolvedSelectedMatter) return null;

    const resolveOptionLabel = (options: MatterOption[], id: string, fallback: string) =>
      options.find((option) => option.id === id)?.name ?? fallback;

    const clientIds = [
      selectedMatterDetail.clientId,
      ...((selectedMatterDetail as { clientIds?: string[] }).clientIds ?? [])
    ].filter(Boolean) as string[];
    const clientEntries = clientIds.map((id) => ({
      id,
      name: resolveOptionLabel(clientOptions, id, resolveClientLabel(id))
    }));
    if (clientEntries.length === 0 && resolvedSelectedMatter.clientName) {
      clientEntries.push({ id: 'client-name-fallback', name: resolvedSelectedMatter.clientName });
    }

    const assigneeNames = selectedMatterDetail.assigneeIds
      .map((id) => resolveOptionLabel(assigneeOptions, id, `User ${id.slice(0, 6)}`))
      .filter(Boolean);

    const billingLabel = selectedMatterDetail.billingType
      ? selectedMatterDetail.billingType.replace(/_/g, ' ').replace(/^\w/, (char) => char.toUpperCase())
      : 'Not specified';
    const createdLabel = formatLongDate(resolvedSelectedMatter.createdAt);

    return {
      description: selectedMatterDetail.description || '',
      billingLabel,
      createdLabel,
      clientEntries,
      assigneeNames
    };
  }, [assigneeOptions, clientOptions, resolvedSelectedMatter, selectedMatterDetail]);

  if (selectedMatterId) {
    if (detailLoading && !resolvedSelectedMatter) {
      return (
        <Page className="h-full">
          <LoadingState message="Loading matter details..." />
        </Page>
      );
    }

    if (detailError && !resolvedSelectedMatter) {
      return (
        <Page className="h-full">
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
        </Page>
      );
    }

    if (!resolvedSelectedMatter) {
      return (
        <Page className="h-full">
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
            <section className="rounded-2xl border border-line-default bg-surface-card p-6 shadow-card">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                We could not find a matter with the ID{' '}
                <span className="font-mono text-gray-700 dark:text-gray-300">{selectedMatterId}</span>
                {' '}in this workspace.
              </p>
            </section>
          </div>
        </Page>
      );
    }

    return (
      <Page className="min-h-full">
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
                  <h1 className="flex flex-wrap items-center gap-x-2 text-base font-semibold leading-7 text-input-text">
                    <span>{resolvedSelectedMatter.title}</span>
                    <span className="text-gray-400">/</span>
                    <span className="flex items-center gap-x-2 font-semibold text-input-text">
                      <Avatar
                        name={resolvedSelectedMatter.clientName}
                        size="xs"
                        className="bg-surface-card text-gray-700 dark:text-gray-200"
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

            {isClientListTruncated && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                <strong>Warning:</strong> The client list is incomplete. Some names or options may be missing.
              </div>
            )}

            {headerMeta && (
              <div className="rounded-2xl border border-line-default bg-surface-card/80 p-4">
                <p className="text-sm leading-6 text-gray-700 dark:text-gray-200">
                  {headerMeta.description ? headerMeta.description : 'No description provided.'}
                </p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">Client</p>
                    {headerMeta.clientEntries.length > 0 ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {headerMeta.clientEntries.map((entry) => (
                          <div key={entry.id} className="flex items-center gap-2 rounded-full border border-line-default px-2 py-1">
                            <Avatar name={entry.name} size="xs" className="bg-surface-card" />
                            <span className="text-sm text-gray-700 dark:text-gray-200">{entry.name}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">No client assigned</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">Assigned</p>
                    {headerMeta.assigneeNames.length > 0 ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {headerMeta.assigneeNames.map((name, i) => (
                          <div key={`${name}-${i}`} className="flex items-center gap-2 rounded-full border border-line-default px-2 py-1">
                            <Avatar name={name} size="xs" className="bg-surface-card" />
                            <span className="text-sm text-gray-700 dark:text-gray-200">{name}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">No assignee</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">Billing</p>
                    <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">{headerMeta.billingLabel}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">Created</p>
                    <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">{headerMeta.createdLabel}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="border-b border-line-default">
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
                      ? 'border-input-text text-input-text'
                      : 'border-transparent text-gray-500 hover:border-line-default hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
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
                {/* Notes are handled via the activity timeline composer */}
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
                <Panel>
                  <header className="flex items-center justify-between border-b border-line-default px-6 py-4">
                    <div>
                      <h3 className="text-sm font-semibold text-input-text">Recent transactions</h3>
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
                        className="rounded-2xl border border-line-default bg-surface-card p-4 shadow-card"
                      >
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{card.label}</p>
                        <p className="mt-2 text-lg font-semibold text-input-text">{card.value}</p>
                      </div>
                    ))}
                  </div>
                </Panel>
              </div>
            ) : detailTab === 'messages' && selectedMatterDetail ? (
              <div className="px-0">
                <MatterMessagesPanel
                  key={`messages-${selectedMatterDetail.id}`}
                  matter={selectedMatterDetail}
                  conversationBasePath={conversationBasePath}
                />
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
      </Page>
    );
  }

  return (
    <Page className="min-h-full">
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

        {isClientListTruncated && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
            <strong>Warning:</strong> The client list is incomplete. Some names or options may be missing.
          </div>
        )}


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
          <Panel className="overflow-hidden">
            <header className="flex items-center justify-between border-b border-line-default px-4 py-4 sm:px-6 lg:px-8">
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
          </Panel>

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
    </Page>
  );
};
