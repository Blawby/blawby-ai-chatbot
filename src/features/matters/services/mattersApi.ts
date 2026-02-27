import axios from 'axios';
import { apiClient } from '@/shared/lib/apiClient';
import {
  toMajorUnits,
  toMinorUnitsValue,
  assertMajorUnits,
  assertMinorUnits,
  type MajorAmount,
  type MinorAmount
} from '@/shared/utils/money';

export type BackendMatter = {
  id: string;
  organization_id?: string | null;
  client_id?: string | null;
  title?: string | null;
  description?: string | null;
  billing_type?: 'hourly' | 'fixed' | 'contingency' | 'pro_bono' | string | null;
  total_fixed_price?: MajorAmount | null;
  contingency_percentage?: number | null;
  settlement_amount?: MajorAmount | null;
  practice_service_id?: string | null;
  admin_hourly_rate?: MajorAmount | null;
  attorney_hourly_rate?: MajorAmount | null;
  payment_frequency?: 'project' | 'milestone' | string | null;
  case_number?: string | null;
  matter_type?: string | null;
  urgency?: 'routine' | 'time_sensitive' | 'emergency' | string | null;
  responsible_attorney_id?: string | null;
  originating_attorney_id?: string | null;
  court?: string | null;
  judge?: string | null;
  opposing_party?: string | null;
  opposing_counsel?: string | null;
  open_date?: string | null;
  close_date?: string | null;
  status?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  assignee_ids?: string[] | null;
  assignees?: Array<Record<string, unknown>> | string[] | null;
  milestones?: Array<Record<string, unknown>> | null;
};

export type BackendMatterActivity = {
  id: string;
  matter_id: string;
  user_id?: string | null;
  action?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
};

export type BackendMatterNote = {
  id: string;
  matter_id: string;
  user_id?: string | null;
  content?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type BackendMatterTimeEntry = {
  id: string;
  matter_id: string;
  user_id?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  duration?: number | null;
  description?: string | null;
  billable?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type BackendMatterTimeStats = {
  totalBillableSeconds?: number | null;
  totalSeconds?: number | null;
  totalBillableHours?: number | null;
  totalHours?: number | null;
};

export type BackendMatterExpense = {
  id: string;
  matter_id: string;
  description?: string | null;
  amount?: MajorAmount | null;
  date?: string | null;
  billable?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type BackendMatterMilestone = {
  id: string;
  matter_id: string;
  description?: string | null;
  amount?: MajorAmount | null;
  due_date?: string | null;
  status?: string | null;
  order?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'blocked';
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';

export type BackendMatterTask = {
  id: string;
  matter_id: string;
  name: string;
  description?: string | null;
  assignee_id?: string | null;
  due_date?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  stage: string;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ListMatterTaskFilters = {
  task_id?: string;
  assignee_id?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  stage?: string;
};

export type CreateMatterTaskPayload = {
  name: string;
  description?: string;
  assignee_id?: string | null;
  due_date?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  stage: string;
};

export type UpdateMatterTaskPayload = Partial<{
  name: string;
  description: string | null;
  assignee_id: string | null;
  due_date: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  stage: string;
}>;

export type GenerateMatterTasksPayload = {
  template_name?: string;
  tasks: CreateMatterTaskPayload[];
};

type FetchOptions = {
  signal?: AbortSignal;
};

const normalizeMatter = (matter: BackendMatter): BackendMatter => ({
  ...matter,
  total_fixed_price: (() => {
    if (typeof matter.total_fixed_price === 'number') {
      assertMinorUnits(matter.total_fixed_price, 'matter.total_fixed_price');
    }
    return toMajorUnits(matter.total_fixed_price ?? null);
  })(),
  settlement_amount: (() => {
    if (typeof matter.settlement_amount === 'number') {
      assertMinorUnits(matter.settlement_amount, 'matter.settlement_amount');
    }
    return toMajorUnits(matter.settlement_amount ?? null);
  })(),
  admin_hourly_rate: (() => {
    if (typeof matter.admin_hourly_rate === 'number') {
      assertMinorUnits(matter.admin_hourly_rate, 'matter.admin_hourly_rate');
    }
    return toMajorUnits(matter.admin_hourly_rate ?? null);
  })(),
  attorney_hourly_rate: (() => {
    if (typeof matter.attorney_hourly_rate === 'number') {
      assertMinorUnits(matter.attorney_hourly_rate, 'matter.attorney_hourly_rate');
    }
    return toMajorUnits(matter.attorney_hourly_rate ?? null);
  })(),
  milestones: Array.isArray(matter.milestones)
    ? matter.milestones.map((item) => {
      if (!item || typeof item !== 'object') return item;
      const record = item as Record<string, unknown>;
      return {
        ...record,
        amount: (() => {
          if (typeof record.amount === 'number') {
            assertMinorUnits(record.amount, 'matter.milestone.amount');
            return toMajorUnits(record.amount);
          }
          return record.amount;
        })()
      };
    })
    : matter.milestones
});

const normalizeMatterPayload = (payload: Record<string, unknown>) => {
  const normalized = { ...payload };
  (['total_fixed_price', 'settlement_amount', 'admin_hourly_rate', 'attorney_hourly_rate'] as const).forEach((key) => {
    const value = normalized[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      assertMajorUnits(value, `matter.${key}`);
      normalized[key] = toMinorUnitsValue(value);
    }
  });
  if (Array.isArray(normalized.milestones)) {
    normalized.milestones = normalized.milestones.map((milestone) => {
      if (!milestone || typeof milestone !== 'object') return milestone;
      const record = milestone as Record<string, unknown>;
      const amount = record.amount;
      if (typeof amount === 'number' && Number.isFinite(amount)) {
        assertMajorUnits(amount, 'matter.milestones.amount');
        return { ...record, amount: toMinorUnitsValue(amount) };
      }
      return record;
    });
  }
  return normalized;
};

const normalizeExpense = (expense: BackendMatterExpense): BackendMatterExpense => ({
  ...expense,
  amount: (() => {
    if (typeof expense.amount === 'number') {
      assertMinorUnits(expense.amount, 'matter.expense.amount');
    }
    return toMajorUnits(expense.amount ?? null);
  })()
});

const normalizeExpensePayload = (payload: {
  description: string;
  amount: MajorAmount;
  date: string;
  billable?: boolean;
}) => {
  assertMajorUnits(payload.amount, 'expense.amount');
  return {
    ...payload,
    amount: toMinorUnitsValue(payload.amount) as MinorAmount
  };
};

const normalizeMilestone = (milestone: BackendMatterMilestone): BackendMatterMilestone => ({
  ...milestone,
  amount: (() => {
    if (typeof milestone.amount === 'number') {
      assertMinorUnits(milestone.amount, 'matter.milestone.amount');
    }
    return toMajorUnits(milestone.amount ?? null);
  })()
});

const normalizeMilestonePayload = (payload: {
  description: string;
  amount: MajorAmount;
  due_date: string;
  status?: string;
  order?: number;
}) => {
  assertMajorUnits(payload.amount, 'milestone.amount');
  return {
    ...payload,
    amount: toMinorUnitsValue(payload.amount) as MinorAmount
  };
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    if (typeof data === 'string' && data.trim().length > 0) {
      return data;
    }
    if (data && typeof data === 'object') {
      const record = data as Record<string, unknown>;
      const err = typeof record.error === 'string' ? record.error : null;
      const message = typeof record.message === 'string' ? record.message : null;
      return err || message || error.message || fallback;
    }
    return error.message || fallback;
  }
  if (error instanceof Error) {
    return error.message || fallback;
  }
  return fallback;
};

const requestData = async <T>(promise: Promise<{ data: T }>, fallbackMessage: string): Promise<T> => {
  try {
    const response = await promise;
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error, fallbackMessage));
  }
};

const extractMatterArray = (payload: unknown): BackendMatter[] => {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is BackendMatter => !!item && typeof item === 'object');
  }
  if (!payload || typeof payload !== 'object') return [];

  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.matters)) {
    return record.matters.filter((item): item is BackendMatter => !!item && typeof item === 'object');
  }
  if (Array.isArray(record.items)) {
    return record.items.filter((item): item is BackendMatter => !!item && typeof item === 'object');
  }
  if (record.data) {
    return extractMatterArray(record.data);
  }
  if (record.matter && typeof record.matter === 'object') {
    return [record.matter as BackendMatter];
  }
  return [];
};

const extractMatter = (payload: unknown): BackendMatter | null => {
  if (!payload || typeof payload !== 'object') return null;
  if (Array.isArray(payload)) {
    return (payload.find((item) => item && typeof item === 'object') ?? null) as BackendMatter | null;
  }
  const record = payload as Record<string, unknown>;
  if (record.matter && typeof record.matter === 'object') {
    return record.matter as BackendMatter;
  }
  if (record.data) {
    return extractMatter(record.data);
  }
  return record as BackendMatter;
};

const extractActivityArray = (payload: unknown): BackendMatterActivity[] => {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is BackendMatterActivity => !!item && typeof item === 'object');
  }
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  // New: backend now wraps activity in 'activities' key
  if (Array.isArray(record.activities)) {
    return record.activities.filter((item): item is BackendMatterActivity => !!item && typeof item === 'object');
  }
  if (Array.isArray(record.activity)) {
    return record.activity.filter((item): item is BackendMatterActivity => !!item && typeof item === 'object');
  }
  if (record.data) {
    return extractActivityArray(record.data);
  }
  return [];
};

const extractNotesArray = (payload: unknown): BackendMatterNote[] => {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is BackendMatterNote => !!item && typeof item === 'object');
  }
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.notes)) {
    return record.notes.filter((item): item is BackendMatterNote => !!item && typeof item === 'object');
  }
  if (record.data) {
    return extractNotesArray(record.data);
  }
  return [];
};

const extractTimeEntriesArray = (payload: unknown): BackendMatterTimeEntry[] => {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is BackendMatterTimeEntry => !!item && typeof item === 'object');
  }
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.timeEntries)) {
    return record.timeEntries.filter((item): item is BackendMatterTimeEntry => !!item && typeof item === 'object');
  }
  if (record.data) {
    return extractTimeEntriesArray(record.data);
  }
  return [];
};

const extractExpensesArray = (payload: unknown): BackendMatterExpense[] => {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is BackendMatterExpense => !!item && typeof item === 'object');
  }
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.expenses)) {
    return record.expenses.filter((item): item is BackendMatterExpense => !!item && typeof item === 'object');
  }
  if (record.data) {
    return extractExpensesArray(record.data);
  }
  return [];
};

const extractMilestonesArray = (payload: unknown): BackendMatterMilestone[] => {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is BackendMatterMilestone => !!item && typeof item === 'object');
  }
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.milestones)) {
    return record.milestones.filter((item): item is BackendMatterMilestone => !!item && typeof item === 'object');
  }
  if (record.data) {
    return extractMilestonesArray(record.data);
  }
  return [];
};

const extractTasksArray = (payload: unknown): BackendMatterTask[] => {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is BackendMatterTask => !!item && typeof item === 'object');
  }
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.tasks)) {
    return record.tasks.filter((item): item is BackendMatterTask => !!item && typeof item === 'object');
  }
  if (record.data) {
    return extractTasksArray(record.data);
  }
  return [];
};

const extractTask = (payload: unknown): BackendMatterTask | null => {
  if (!payload || typeof payload !== 'object') return null;
  if (Array.isArray(payload)) {
    return (payload.find((item) => item && typeof item === 'object') ?? null) as BackendMatterTask | null;
  }
  const record = payload as Record<string, unknown>;
  if (record.task && typeof record.task === 'object') {
    return record.task as BackendMatterTask;
  }
  if (record.data) {
    return extractTask(record.data);
  }
  return record as BackendMatterTask;
};


export const listMatters = async (
  practiceId: string,
  options: FetchOptions & { page?: number; limit?: number } = {}
): Promise<BackendMatter[]> => {
  if (!practiceId) {
    return [];
  }

  const params = new URLSearchParams();
  params.set('page', String(options.page ?? 1));
  params.set('limit', String(options.limit ?? 100));

  const payload = await requestData(
    apiClient.get(`/api/matters/${encodeURIComponent(practiceId)}`, {
      params: Object.fromEntries(params.entries()),
      signal: options.signal
    }),
    'Failed to load matters'
  );
  return extractMatterArray(payload).map(normalizeMatter);
};

export const getMatter = async (
  practiceId: string,
  matterId: string,
  options: FetchOptions = {}
): Promise<BackendMatter | null> => {
  if (!practiceId || !matterId) {
    return null;
  }

  const params = new URLSearchParams();
  params.set('matter_uuid', matterId);
  const payload = await requestData(
    apiClient.get(`/api/matters/${encodeURIComponent(practiceId)}`, {
      params: Object.fromEntries(params.entries()),
      signal: options.signal
    }),
    'Failed to load matter'
  );
  
  // Extract matters array - backend should return single matter but may return array until PR #85 is deployed
  const matters = extractMatterArray(payload);
  
  // If backend filtered correctly, we'll get one matter. If not, filter client-side.
  const matter = matters.length === 1 
    ? matters[0] 
    : matters.find(m => m.id === matterId) ?? null;
    
  return matter ? normalizeMatter(matter) : null;
};

export const createMatter = async (
  practiceId: string,
  payload: Record<string, unknown>,
  options: FetchOptions = {}
): Promise<BackendMatter | null> => {
  if (!practiceId) {
    throw new Error('practiceId is required');
  }
  const json = await requestData(
    apiClient.post(
      `/api/matters/${encodeURIComponent(practiceId)}/create`,
      normalizeMatterPayload(payload),
      { signal: options.signal }
    ),
    'Failed to create matter'
  );
  const matter = extractMatter(json);
  return matter ? normalizeMatter(matter) : null;
};

export const updateMatter = async (
  practiceId: string,
  matterId: string,
  payload: Record<string, unknown>,
  options: FetchOptions = {}
): Promise<BackendMatter | null> => {
  if (!practiceId || !matterId) {
    throw new Error('practiceId and matterId are required');
  }
  const json = await requestData(
    apiClient.put(
      `/api/matters/${encodeURIComponent(practiceId)}/update/${encodeURIComponent(matterId)}`,
      normalizeMatterPayload(payload),
      { signal: options.signal }
    ),
    'Failed to update matter'
  );
  const matter = extractMatter(json);
  return matter ? normalizeMatter(matter) : null;
};

export const deleteMatter = async (
  practiceId: string,
  matterId: string,
  options: FetchOptions = {}
): Promise<void> => {
  if (!practiceId || !matterId) {
    throw new Error('practiceId and matterId are required');
  }
  await requestData(
    apiClient.delete(`/api/matters/${encodeURIComponent(practiceId)}/delete/${encodeURIComponent(matterId)}`, {
      signal: options.signal
    }),
    'Failed to delete matter'
  );
};

export const getMatterActivity = async (
  practiceId: string,
  matterId: string,
  options: FetchOptions = {}
): Promise<BackendMatterActivity[]> => {
  if (!practiceId || !matterId) {
    return [];
  }

  const payload = await requestData(
    apiClient.get(
      `/api/matters/${encodeURIComponent(practiceId)}/${encodeURIComponent(matterId)}/activity`,
      { signal: options.signal }
    ),
    'Failed to load activity'
  );
  return extractActivityArray(payload);
};

export const listMatterNotes = async (
  practiceId: string,
  matterId: string,
  options: FetchOptions = {}
): Promise<BackendMatterNote[]> => {
  if (!practiceId || !matterId) {
    return [];
  }

  const payload = await requestData(
    apiClient.get(
      `/api/matters/${encodeURIComponent(practiceId)}/${encodeURIComponent(matterId)}/notes`,
      { signal: options.signal }
    ),
    'Failed to load notes'
  );
  return extractNotesArray(payload);
};

export const createMatterNote = async (
  practiceId: string,
  matterId: string,
  content: string,
  options: FetchOptions = {}
): Promise<BackendMatterNote | null> => {
  if (!practiceId || !matterId) {
    throw new Error('practiceId and matterId are required');
  }
  if (!content || !content.trim()) {
    throw new Error('content is required');
  }
  const payload = await requestData(
    apiClient.post(
      `/api/matters/${encodeURIComponent(practiceId)}/${encodeURIComponent(matterId)}/notes`,
      { content },
      { signal: options.signal }
    ),
    'Failed to create note'
  );
  if (payload && typeof payload === 'object' && 'note' in payload) {
    const record = payload as Record<string, unknown>;
    if (record.note && typeof record.note === 'object') {
      return record.note as BackendMatterNote;
    }
  }
  return extractNotesArray(payload)[0] ?? null;
};

export const updateMatterNote = async (
  practiceId: string,
  matterId: string,
  noteId: string,
  content: string,
  options: FetchOptions = {}
): Promise<BackendMatterNote | null> => {
  if (!practiceId || !matterId || !noteId) {
    throw new Error('practiceId, matterId, and noteId are required');
  }
  if (!content || !content.trim()) {
    throw new Error('content is required');
  }
  const payload = await requestData(
    apiClient.patch(
      `/api/matters/${encodeURIComponent(practiceId)}/${encodeURIComponent(matterId)}/notes/update/${encodeURIComponent(noteId)}`,
      { content },
      { signal: options.signal }
    ),
    'Failed to update note'
  );
  if (payload && typeof payload === 'object' && 'note' in payload) {
    const record = payload as Record<string, unknown>;
    if (record.note && typeof record.note === 'object') {
      return record.note as BackendMatterNote;
    }
  }
  return extractNotesArray(payload)[0] ?? null;
};

export const deleteMatterNote = async (
  practiceId: string,
  matterId: string,
  noteId: string,
  options: FetchOptions = {}
): Promise<void> => {
  if (!practiceId || !matterId || !noteId) {
    throw new Error('practiceId, matterId, and noteId are required');
  }
  await requestData(
    apiClient.delete(
      `/api/matters/${encodeURIComponent(practiceId)}/${encodeURIComponent(matterId)}/notes/delete/${encodeURIComponent(noteId)}`,
      { signal: options.signal }
    ),
    'Failed to delete note'
  );
};

export const listMatterTimeEntries = async (
  practiceId: string,
  matterId: string,
  options: FetchOptions = {}
): Promise<BackendMatterTimeEntry[]> => {
  if (!practiceId || !matterId) {
    return [];
  }

  const payload = await requestData(
    apiClient.get(
      `/api/matters/${encodeURIComponent(practiceId)}/${encodeURIComponent(matterId)}/time-entries`,
      { signal: options.signal }
    ),
    'Failed to load time entries'
  );
  return extractTimeEntriesArray(payload);
};

export const createMatterTimeEntry = async (
  practiceId: string,
  matterId: string,
  payload: {
    start_time: string;
    end_time: string;
    description?: string;
    billable?: boolean;
  },
  options: FetchOptions = {}
): Promise<BackendMatterTimeEntry | null> => {
  if (!practiceId || !matterId) {
    throw new Error('practiceId and matterId are required');
  }
  if (!payload?.start_time || !payload?.end_time) {
    throw new Error('start_time and end_time are required');
  }
  const json = await requestData(
    apiClient.post(
      `/api/matters/${encodeURIComponent(practiceId)}/${encodeURIComponent(matterId)}/time-entries`,
      payload,
      { signal: options.signal }
    ),
    'Failed to create time entry'
  );
  if (json && typeof json === 'object' && 'timeEntry' in json) {
    const record = json as Record<string, unknown>;
    if (record.timeEntry && typeof record.timeEntry === 'object') {
      return record.timeEntry as BackendMatterTimeEntry;
    }
  }
  return extractTimeEntriesArray(json)[0] ?? null;
};

export const updateMatterTimeEntry = async (
  practiceId: string,
  matterId: string,
  timeEntryId: string,
  payload: {
    start_time: string;
    end_time: string;
    description?: string;
    billable?: boolean;
  },
  options: FetchOptions = {}
): Promise<BackendMatterTimeEntry | null> => {
  if (!practiceId || !matterId || !timeEntryId) {
    throw new Error('practiceId, matterId, and timeEntryId are required');
  }
  if (!payload?.start_time || !payload?.end_time) {
    throw new Error('start_time and end_time are required');
  }
  const json = await requestData(
    apiClient.patch(
      `/api/matters/${encodeURIComponent(practiceId)}/${encodeURIComponent(matterId)}/time-entries/update/${encodeURIComponent(timeEntryId)}`,
      payload,
      { signal: options.signal }
    ),
    'Failed to update time entry'
  );
  if (json && typeof json === 'object' && 'timeEntry' in json) {
    const record = json as Record<string, unknown>;
    if (record.timeEntry && typeof record.timeEntry === 'object') {
      return record.timeEntry as BackendMatterTimeEntry;
    }
  }
  return extractTimeEntriesArray(json)[0] ?? null;
};

export const deleteMatterTimeEntry = async (
  practiceId: string,
  matterId: string,
  timeEntryId: string,
  options: FetchOptions = {}
): Promise<void> => {
  if (!practiceId || !matterId || !timeEntryId) {
    throw new Error('practiceId, matterId, and timeEntryId are required');
  }
  await requestData(
    apiClient.delete(
      `/api/matters/${encodeURIComponent(practiceId)}/${encodeURIComponent(matterId)}/time-entries/delete/${encodeURIComponent(timeEntryId)}`,
      { signal: options.signal }
    ),
    'Failed to delete time entry'
  );
};

export const getMatterTimeEntryStats = async (
  practiceId: string,
  matterId: string,
  options: FetchOptions = {}
): Promise<BackendMatterTimeStats | null> => {
  if (!practiceId || !matterId) {
    return null;
  }

  const payload = await requestData(
    apiClient.get(
      `/api/matters/${encodeURIComponent(practiceId)}/${encodeURIComponent(matterId)}/time-entries/stats`,
      { signal: options.signal }
    ),
    'Failed to load time stats'
  );
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return payload as BackendMatterTimeStats;
  }
  return null;
};

export const listMatterExpenses = async (
  practiceId: string,
  matterId: string,
  options: FetchOptions = {}
): Promise<BackendMatterExpense[]> => {
  if (!practiceId || !matterId) {
    return [];
  }

  const payload = await requestData(
    apiClient.get(
      `/api/matters/${encodeURIComponent(practiceId)}/${encodeURIComponent(matterId)}/expenses`,
      { signal: options.signal }
    ),
    'Failed to load expenses'
  );
  return extractExpensesArray(payload).map(normalizeExpense);
};

export const createMatterExpense = async (
  practiceId: string,
  matterId: string,
  payload: {
    description: string;
    amount: MajorAmount;
    date: string;
    billable?: boolean;
  },
  options: FetchOptions = {}
): Promise<BackendMatterExpense | null> => {
  if (!practiceId || !matterId) {
    throw new Error('practiceId and matterId are required');
  }
  if (!payload?.description?.trim()) {
    throw new Error('description is required');
  }
  if (typeof payload.amount !== 'number' || !Number.isFinite(payload.amount)) {
    throw new Error('amount is required');
  }
  if (!payload.date) {
    throw new Error('date is required');
  }
  const json = await requestData(
    apiClient.post(
      `/api/matters/${encodeURIComponent(practiceId)}/${encodeURIComponent(matterId)}/expenses`,
      normalizeExpensePayload(payload),
      { signal: options.signal }
    ),
    'Failed to create expense'
  );
  if (json && typeof json === 'object' && 'expense' in json) {
    const record = json as Record<string, unknown>;
    if (record.expense && typeof record.expense === 'object') {
      return normalizeExpense(record.expense as BackendMatterExpense);
    }
  }
  const fallback = extractExpensesArray(json)[0];
  return fallback ? normalizeExpense(fallback) : null;
};

export const updateMatterExpense = async (
  practiceId: string,
  matterId: string,
  expenseId: string,
  payload: {
    description: string;
    amount: MajorAmount;
    date: string;
    billable?: boolean;
  },
  options: FetchOptions = {}
): Promise<BackendMatterExpense | null> => {
  if (!practiceId || !matterId || !expenseId) {
    throw new Error('practiceId, matterId, and expenseId are required');
  }
  if (!payload?.description?.trim()) {
    throw new Error('description is required');
  }
  if (typeof payload.amount !== 'number' || !Number.isFinite(payload.amount)) {
    throw new Error('amount is required');
  }
  if (!payload.date) {
    throw new Error('date is required');
  }
  const json = await requestData(
    apiClient.patch(
      `/api/matters/${encodeURIComponent(practiceId)}/${encodeURIComponent(matterId)}/expenses/update/${encodeURIComponent(expenseId)}`,
      normalizeExpensePayload(payload),
      { signal: options.signal }
    ),
    'Failed to update expense'
  );
  if (json && typeof json === 'object' && 'expense' in json) {
    const record = json as Record<string, unknown>;
    if (record.expense && typeof record.expense === 'object') {
      return normalizeExpense(record.expense as BackendMatterExpense);
    }
  }
  const fallback = extractExpensesArray(json)[0];
  return fallback ? normalizeExpense(fallback) : null;
};

export const deleteMatterExpense = async (
  practiceId: string,
  matterId: string,
  expenseId: string,
  options: FetchOptions = {}
): Promise<void> => {
  if (!practiceId || !matterId || !expenseId) {
    throw new Error('practiceId, matterId, and expenseId are required');
  }
  await requestData(
    apiClient.delete(
      `/api/matters/${encodeURIComponent(practiceId)}/${encodeURIComponent(matterId)}/expenses/delete/${encodeURIComponent(expenseId)}`,
      { signal: options.signal }
    ),
    'Failed to delete expense'
  );
};

export const listMatterMilestones = async (
  practiceId: string,
  matterId: string,
  options: FetchOptions = {}
): Promise<BackendMatterMilestone[]> => {
  if (!practiceId || !matterId) {
    return [];
  }

  const payload = await requestData(
    apiClient.get(
      `/api/matters/${encodeURIComponent(practiceId)}/${encodeURIComponent(matterId)}/milestones`,
      { signal: options.signal }
    ),
    'Failed to load milestones'
  );
  return extractMilestonesArray(payload).map(normalizeMilestone);
};

export const createMatterMilestone = async (
  practiceId: string,
  matterId: string,
  payload: {
    description: string;
    amount: MajorAmount;
    due_date: string;
    status?: string;
    order?: number;
  },
  options: FetchOptions = {}
): Promise<BackendMatterMilestone | null> => {
  if (!practiceId || !matterId) {
    throw new Error('practiceId and matterId are required');
  }
  if (!payload?.description?.trim()) {
    throw new Error('description is required');
  }
  if (typeof payload.amount !== 'number' || !Number.isFinite(payload.amount)) {
    throw new Error('amount is required');
  }
  if (!payload.due_date) {
    throw new Error('due_date is required');
  }
  const json = await requestData(
    apiClient.post(
      `/api/matters/${encodeURIComponent(practiceId)}/${encodeURIComponent(matterId)}/milestones`,
      normalizeMilestonePayload(payload),
      { signal: options.signal }
    ),
    'Failed to create milestone'
  );
  if (json && typeof json === 'object' && 'milestone' in json) {
    const record = json as Record<string, unknown>;
    if (record.milestone && typeof record.milestone === 'object') {
      return normalizeMilestone(record.milestone as BackendMatterMilestone);
    }
  }
  const fallback = extractMilestonesArray(json)[0];
  return fallback ? normalizeMilestone(fallback) : null;
};

export const updateMatterMilestone = async (
  practiceId: string,
  matterId: string,
  milestoneId: string,
  payload: {
    description: string;
    amount: MajorAmount;
    due_date: string;
    status?: string;
    order?: number;
  },
  options: FetchOptions = {}
): Promise<BackendMatterMilestone | null> => {
  if (!practiceId || !matterId || !milestoneId) {
    throw new Error('practiceId, matterId, and milestoneId are required');
  }
  if (!payload?.description?.trim()) {
    throw new Error('description is required');
  }
  if (typeof payload.amount !== 'number' || !Number.isFinite(payload.amount)) {
    throw new Error('amount is required');
  }
  if (!payload.due_date) {
    throw new Error('due_date is required');
  }
  const json = await requestData(
    apiClient.patch(
      `/api/matters/${encodeURIComponent(practiceId)}/${encodeURIComponent(matterId)}/milestones/update/${encodeURIComponent(milestoneId)}`,
      normalizeMilestonePayload(payload),
      { signal: options.signal }
    ),
    'Failed to update milestone'
  );
  if (json && typeof json === 'object' && 'milestone' in json) {
    const record = json as Record<string, unknown>;
    if (record.milestone && typeof record.milestone === 'object') {
      return normalizeMilestone(record.milestone as BackendMatterMilestone);
    }
  }
  const fallback = extractMilestonesArray(json)[0];
  return fallback ? normalizeMilestone(fallback) : null;
};

export const deleteMatterMilestone = async (
  practiceId: string,
  matterId: string,
  milestoneId: string,
  options: FetchOptions = {}
): Promise<void> => {
  if (!practiceId || !matterId || !milestoneId) {
    throw new Error('practiceId, matterId, and milestoneId are required');
  }
  await requestData(
    apiClient.delete(
      `/api/matters/${encodeURIComponent(practiceId)}/${encodeURIComponent(matterId)}/milestones/delete/${encodeURIComponent(milestoneId)}`,
      { signal: options.signal }
    ),
    'Failed to delete milestone'
  );
};

export const reorderMatterMilestones = async (
  practiceId: string,
  matterId: string,
  milestones: Array<{ id: string; order: number }>,
  options: FetchOptions = {}
): Promise<boolean> => {
  await requestData(
    apiClient.post(
      `/api/matters/${encodeURIComponent(practiceId)}/${encodeURIComponent(matterId)}/milestones/reorder`,
      { milestones },
      { signal: options.signal }
    ),
    'Failed to reorder milestones'
  );
  return true;
};

export const listMatterTasks = async (
  practiceId: string,
  matterId: string,
  filters: ListMatterTaskFilters = {},
  options: FetchOptions = {}
): Promise<BackendMatterTask[]> => {
  if (!practiceId || !matterId) {
    return [];
  }

  const params = new URLSearchParams();
  if (filters.task_id) params.set('task_id', filters.task_id);
  if (filters.assignee_id) params.set('assignee_id', filters.assignee_id);
  if (filters.status) params.set('status', filters.status);
  if (filters.priority) params.set('priority', filters.priority);
  if (filters.stage) params.set('stage', filters.stage);

  const payload = await requestData(
    apiClient.get(
      `/api/matters/${encodeURIComponent(practiceId)}/${encodeURIComponent(matterId)}/tasks`,
      {
        params: Object.fromEntries(params.entries()),
        signal: options.signal
      }
    ),
    'Failed to load tasks'
  );
  return extractTasksArray(payload);
};

export const createMatterTask = async (
  practiceId: string,
  matterId: string,
  payload: CreateMatterTaskPayload,
  options: FetchOptions = {}
): Promise<BackendMatterTask | null> => {
  if (!practiceId || !matterId) {
    throw new Error('practiceId and matterId are required');
  }
  if (!payload?.name?.trim()) {
    throw new Error('name is required');
  }
  if (!payload?.stage?.trim()) {
    throw new Error('stage is required');
  }
  const json = await requestData(
    apiClient.post(
      `/api/matters/${encodeURIComponent(practiceId)}/${encodeURIComponent(matterId)}/tasks`,
      payload,
      { signal: options.signal }
    ),
    'Failed to create task'
  );
  return extractTask(json);
};

export const updateMatterTask = async (
  practiceId: string,
  matterId: string,
  taskId: string,
  payload: UpdateMatterTaskPayload,
  options: FetchOptions = {}
): Promise<BackendMatterTask | null> => {
  if (!practiceId || !matterId || !taskId) {
    throw new Error('practiceId, matterId, and taskId are required');
  }
  if (!payload || Object.keys(payload).length === 0) {
    throw new Error('At least one field must be provided');
  }
  const json = await requestData(
    apiClient.patch(
      `/api/matters/${encodeURIComponent(practiceId)}/${encodeURIComponent(matterId)}/tasks/${encodeURIComponent(taskId)}`,
      payload,
      { signal: options.signal }
    ),
    'Failed to update task'
  );
  return extractTask(json);
};

export const deleteMatterTask = async (
  practiceId: string,
  matterId: string,
  taskId: string,
  options: FetchOptions = {}
): Promise<boolean> => {
  if (!practiceId || !matterId || !taskId) {
    throw new Error('practiceId, matterId, and taskId are required');
  }
  const payload = await requestData(
    apiClient.delete(
      `/api/matters/${encodeURIComponent(practiceId)}/${encodeURIComponent(matterId)}/tasks/${encodeURIComponent(taskId)}`,
      { signal: options.signal }
    ),
    'Failed to delete task'
  );
  if (payload && typeof payload === 'object' && 'success' in payload) {
    return Boolean((payload as Record<string, unknown>).success);
  }
  return true;
};

export const generateMatterTasks = async (
  practiceId: string,
  matterId: string,
  payload: GenerateMatterTasksPayload,
  options: FetchOptions = {}
): Promise<BackendMatterTask[]> => {
  if (!practiceId || !matterId) {
    throw new Error('practiceId and matterId are required');
  }
  if (!Array.isArray(payload.tasks) || payload.tasks.length === 0) {
    throw new Error('tasks must include at least one entry');
  }
  const json = await requestData(
    apiClient.post(
      `/api/matters/${encodeURIComponent(practiceId)}/${encodeURIComponent(matterId)}/tasks/generate`,
      payload,
      { signal: options.signal }
    ),
    'Failed to generate tasks'
  );
  return extractTasksArray(json);
};
