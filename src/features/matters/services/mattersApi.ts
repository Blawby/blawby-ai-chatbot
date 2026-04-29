import {
  isHttpError,
  isAbortError,
  pluckCollection,
  pluckRecord,
  unwrapApiResponse,
  apiClient,
} from '@/shared/lib/apiClient';
import {
  matterCollectionPath,
  matterItemPath,
  matterNestedItemPath,
  matterNestedPath
} from '@/config/urls';
import {
  toMajorUnits,
  toMinorUnitsValue,
  assertMajorUnits,
  assertMinorUnits,
  type MajorAmount,
  type MinorAmount
} from '@/shared/utils/money';

// Wire types live in worker/types/wire/matter.ts (single source of truth).
// Re-exported here for existing consumers; new code should import from
// `@/shared/types/wire` directly.
import type {
  BackendMatter,
  BackendMatterActivity,
  BackendMatterNote,
  BackendMatterTimeEntry,
  BackendMatterTimeStats,
  BackendMatterExpense,
  BackendMatterMilestone,
  BackendMatterTask,
  TaskStatus,
  TaskPriority,
} from '@/shared/types/wire';
export type {
  BackendMatter,
  BackendMatterActivity,
  BackendMatterNote,
  BackendMatterTimeEntry,
  BackendMatterTimeStats,
  BackendMatterExpense,
  BackendMatterMilestone,
  BackendMatterTask,
  TaskStatus,
  TaskPriority,
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

const normalizeMatter = (matter: BackendMatter): BackendMatter => {
  try {
    return {
      ...matter,
      total_fixed_price: typeof matter.total_fixed_price === 'number' && Number.isFinite(matter.total_fixed_price) && Number.isInteger(matter.total_fixed_price)
        ? toMajorUnits(matter.total_fixed_price) 
        : matter.total_fixed_price,
      settlement_amount: typeof matter.settlement_amount === 'number' && Number.isFinite(matter.settlement_amount) && Number.isInteger(matter.settlement_amount)
        ? toMajorUnits(matter.settlement_amount)
        : matter.settlement_amount,
      admin_hourly_rate: typeof matter.admin_hourly_rate === 'number' && Number.isFinite(matter.admin_hourly_rate) && Number.isInteger(matter.admin_hourly_rate)
        ? toMajorUnits(matter.admin_hourly_rate)
        : matter.admin_hourly_rate,
      attorney_hourly_rate: typeof matter.attorney_hourly_rate === 'number' && Number.isFinite(matter.attorney_hourly_rate) && Number.isInteger(matter.attorney_hourly_rate)
        ? toMajorUnits(matter.attorney_hourly_rate)
        : matter.attorney_hourly_rate,
      milestones: Array.isArray(matter.milestones)
        ? matter.milestones.map((item) => {
          if (!item || typeof item !== 'object') return item;
          const record = item as Record<string, unknown>;
          return {
            ...record,
            amount: typeof record.amount === 'number' && Number.isFinite(record.amount) && Number.isInteger(record.amount)
              ? toMajorUnits(record.amount)
              : record.amount,
          };
        })
        : matter.milestones,
    };
  } catch (err) {
    console.warn('[mattersApi] Failed to normalize matter money fields', err instanceof Error ? err.message : String(err), { matterId: matter?.id });
    return matter;
  }
};

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
  if (isHttpError(error)) {
    const data = error.response.data;
    if (typeof data === 'string' && data.trim().length > 0) return data;
    if (data && typeof data === 'object') {
      const record = data as Record<string, unknown>;
      const err = typeof record.error === 'string' ? record.error : null;
      const message = typeof record.message === 'string' ? record.message : null;
      return err || message || error.message || fallback;
    }
    return error.message || fallback;
  }
  if (error instanceof Error) return error.message || fallback;
  return fallback;
};

const requestData = async <T>(promise: Promise<{ data: T }>, fallbackMessage: string): Promise<T> => {
  try {
    const response = await promise;
    return response.data;
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new Error(getErrorMessage(error, fallbackMessage));
  }
};

// Extract helpers — all delegate to the shared `pluckCollection` /
// `pluckRecord` primitives in `apiClient.ts`. Each helper just declares
// the keys the backend uses for its resource.
const extractMatterArray = (payload: unknown): BackendMatter[] => {
  const unwrapped = unwrapApiResponse<unknown>(payload, 'Failed to load matters');
  const list = pluckCollection<BackendMatter>(unwrapped, ['matters', 'items']);
  if (list.length > 0) return list;
  // Fallback: backend occasionally returns a single matter at the top level.
  if (unwrapped && typeof unwrapped === 'object' && !Array.isArray(unwrapped)) {
    const record = unwrapped as Record<string, unknown>;
    if (record.matter && typeof record.matter === 'object' && !Array.isArray(record.matter)) {
      return [record.matter as BackendMatter];
    }
    if (record.id && ('title' in record || 'slug' in record || 'organization_id' in record)) {
      return [record as BackendMatter];
    }
  }
  return [];
};

const extractMatter = (payload: unknown): BackendMatter | null =>
  pluckRecord<BackendMatter>(unwrapApiResponse<unknown>(payload), ['matter']);

const extractActivityArray = (payload: unknown): BackendMatterActivity[] =>
  pluckCollection<BackendMatterActivity>(unwrapApiResponse<unknown>(payload), ['activities', 'activity']);

const extractNotesArray = (payload: unknown): BackendMatterNote[] =>
  pluckCollection<BackendMatterNote>(unwrapApiResponse<unknown>(payload), ['notes']);

const extractTimeEntriesArray = (payload: unknown): BackendMatterTimeEntry[] =>
  pluckCollection<BackendMatterTimeEntry>(unwrapApiResponse<unknown>(payload), ['timeEntries']);

const extractExpensesArray = (payload: unknown): BackendMatterExpense[] =>
  pluckCollection<BackendMatterExpense>(unwrapApiResponse<unknown>(payload), ['expenses']);

const extractMilestonesArray = (payload: unknown): BackendMatterMilestone[] =>
  pluckCollection<BackendMatterMilestone>(unwrapApiResponse<unknown>(payload), ['milestones']);

const extractTasksArray = (payload: unknown): BackendMatterTask[] =>
  pluckCollection<BackendMatterTask>(unwrapApiResponse<unknown>(payload), ['tasks']);

const extractTask = (payload: unknown): BackendMatterTask | null =>
  pluckRecord<BackendMatterTask>(unwrapApiResponse<unknown>(payload), ['task']);


export const listMatters = async (
  practiceId: string,
  options: FetchOptions & { page?: number; limit?: number } = {}
): Promise<BackendMatter[]> => {
  if (!practiceId) {
    return [];
  }

  const params = new URLSearchParams();
  params.set('page', String(options.page ?? 1));
  params.set('limit', String(options.limit ?? 20));

  const payload = await requestData(
    apiClient.get(matterCollectionPath(practiceId), {
      params: Object.fromEntries(params.entries()),
      signal: options.signal
    }),
    'Failed to load matters'
  );
  
  const matters = extractMatterArray(payload);
  return matters.map(normalizeMatter);
};

export const getMatter = async (
  practiceId: string,
  matterId: string,
  options: FetchOptions = {}
): Promise<BackendMatter | null> => {
  if (!practiceId || !matterId) {
    return null;
  }

  const payload = await requestData(
    apiClient.get(matterItemPath(practiceId, matterId), {
      signal: options.signal
    }),
    'Failed to load matter'
  );

  const singleMatter = extractMatter(payload);
  if (singleMatter) {
    return normalizeMatter(singleMatter);
  }
  return null;
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
      matterCollectionPath(practiceId),
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
  const normalizedPayload = normalizeMatterPayload(payload);
  // Debug log removed for security/cleanliness
  const json = await requestData(
    apiClient.put(
      matterItemPath(practiceId, matterId),
      normalizedPayload,
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
    apiClient.delete(matterItemPath(practiceId, matterId), {
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
      matterNestedPath(practiceId, matterId, 'activity'),
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
      matterNestedPath(practiceId, matterId, 'notes'),
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
      matterNestedPath(practiceId, matterId, 'notes'),
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
    apiClient.put(
      matterNestedItemPath(practiceId, matterId, 'notes', noteId),
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
      matterNestedItemPath(practiceId, matterId, 'notes', noteId),
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
      matterNestedPath(practiceId, matterId, 'time-entries'),
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
      matterNestedPath(practiceId, matterId, 'time-entries'),
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
    apiClient.put(
      matterNestedItemPath(practiceId, matterId, 'time-entries', timeEntryId),
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
      matterNestedItemPath(practiceId, matterId, 'time-entries', timeEntryId),
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
      matterNestedPath(practiceId, matterId, 'time-entries/stats'),
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
      matterNestedPath(practiceId, matterId, 'expenses'),
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
      matterNestedPath(practiceId, matterId, 'expenses'),
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
    apiClient.put(
      matterNestedItemPath(practiceId, matterId, 'expenses', expenseId),
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
      matterNestedItemPath(practiceId, matterId, 'expenses', expenseId),
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
      matterNestedPath(practiceId, matterId, 'milestones'),
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
      matterNestedPath(practiceId, matterId, 'milestones'),
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
    apiClient.put(
      matterNestedItemPath(practiceId, matterId, 'milestones', milestoneId),
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
      matterNestedItemPath(practiceId, matterId, 'milestones', milestoneId),
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
      matterNestedPath(practiceId, matterId, 'milestones/reorder'),
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
      matterNestedPath(practiceId, matterId, 'tasks'),
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
  // Legacy/undocumented: the supplied backend contract only documents GET /tasks.
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
      matterNestedPath(practiceId, matterId, 'tasks'),
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
  // Legacy/undocumented: the supplied backend contract does not document task mutation routes.
  if (!practiceId || !matterId || !taskId) {
    throw new Error('practiceId, matterId, and taskId are required');
  }
  if (!payload || Object.keys(payload).length === 0) {
    throw new Error('At least one field must be provided');
  }
  const json = await requestData(
    apiClient.patch(
      matterNestedItemPath(practiceId, matterId, 'tasks', taskId),
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
  // Legacy/undocumented: the supplied backend contract does not document task mutation routes.
  if (!practiceId || !matterId || !taskId) {
    throw new Error('practiceId, matterId, and taskId are required');
  }
  const payload = await requestData(
    apiClient.delete(
      matterNestedItemPath(practiceId, matterId, 'tasks', taskId),
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
  // Legacy/undocumented: task generation is not part of the supplied backend contract.
  if (!practiceId || !matterId) {
    throw new Error('practiceId and matterId are required');
  }
  if (!Array.isArray(payload.tasks) || payload.tasks.length === 0) {
    throw new Error('tasks must include at least one entry');
  }
  const json = await requestData(
    apiClient.post(
      matterNestedPath(practiceId, matterId, 'tasks/generate'),
      payload,
      { signal: options.signal }
    ),
    'Failed to generate tasks'
  );
  return extractTasksArray(json);
};
