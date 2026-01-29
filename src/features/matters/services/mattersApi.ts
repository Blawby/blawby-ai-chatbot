import { getBackendApiUrl } from '@/config/urls';

export type BackendMatter = {
  id: string;
  organization_id?: string | null;
  client_id?: string | null;
  title?: string | null;
  description?: string | null;
  billing_type?: 'hourly' | 'fixed' | 'contingency' | string | null;
  total_fixed_price?: number | null;
  contingency_percentage?: number | null;
  settlement_amount?: number | null;
  practice_service_id?: string | null;
  admin_hourly_rate?: number | null;
  attorney_hourly_rate?: number | null;
  payment_frequency?: 'project' | 'milestone' | string | null;
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
  amount?: number | null;
  date?: string | null;
  billable?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type BackendMatterMilestone = {
  id: string;
  matter_id: string;
  description?: string | null;
  amount?: number | null;
  due_date?: string | null;
  status?: string | null;
  order?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type FetchOptions = {
  signal?: AbortSignal;
};

const normalizeBackendBaseUrl = (value: string) => value.replace(/\/+$/, '');

const buildBackendUrl = (path: string) => {
  const baseUrl = normalizeBackendBaseUrl(getBackendApiUrl());
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
};

const parseJson = async (response: Response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
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

const buildJsonHeaders = () => ({
  'Accept': 'application/json',
  'Content-Type': 'application/json'
});

const fetchJsonOrThrow = async (response: Response) => {
  const payload = await parseJson(response);
  if (response.ok) {
    return payload;
  }

  if (typeof payload === 'string') {
    throw new Error(payload || `Request failed (${response.status})`);
  }

  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const error = typeof record.error === 'string' ? record.error : null;
    const message = typeof record.message === 'string' ? record.message : null;
    throw new Error(error || message || `Request failed (${response.status})`);
  }

  throw new Error(`Request failed (${response.status})`);
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

  const response = await fetch(
    buildBackendUrl(`/api/matters/${encodeURIComponent(practiceId)}?${params.toString()}`),
    {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Accept': 'application/json'
      },
      signal: options.signal
    }
  );

  const payload = await fetchJsonOrThrow(response);
  return extractMatterArray(payload);
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

  const response = await fetch(
    buildBackendUrl(`/api/matters/${encodeURIComponent(practiceId)}?${params.toString()}`),
    {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Accept': 'application/json'
      },
      signal: options.signal
    }
  );

  const payload = await fetchJsonOrThrow(response);
  return extractMatter(payload);
};

export const createMatter = async (
  practiceId: string,
  payload: Record<string, unknown>,
  options: FetchOptions = {}
): Promise<BackendMatter | null> => {
  if (!practiceId) {
    throw new Error('practiceId is required');
  }
  const response = await fetch(
    buildBackendUrl(`/api/matters/${encodeURIComponent(practiceId)}/create`),
    {
      method: 'POST',
      credentials: 'include',
      headers: buildJsonHeaders(),
      body: JSON.stringify(payload),
      signal: options.signal
    }
  );

  const json = await fetchJsonOrThrow(response);
  return extractMatter(json);
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
  const response = await fetch(
    buildBackendUrl(`/api/matters/${encodeURIComponent(practiceId)}/update/${encodeURIComponent(matterId)}`),
    {
      method: 'PUT',
      credentials: 'include',
      headers: buildJsonHeaders(),
      body: JSON.stringify(payload),
      signal: options.signal
    }
  );

  const json = await fetchJsonOrThrow(response);
  return extractMatter(json);
};

export const deleteMatter = async (
  practiceId: string,
  matterId: string,
  options: FetchOptions = {}
): Promise<void> => {
  if (!practiceId || !matterId) {
    throw new Error('practiceId and matterId are required');
  }
  await fetchJsonOrThrow(await fetch(
    buildBackendUrl(`/api/matters/${encodeURIComponent(practiceId)}/delete/${encodeURIComponent(matterId)}`),
    {
      method: 'DELETE',
      credentials: 'include',
      headers: {
        'Accept': 'application/json'
      },
      signal: options.signal
    }
  ));
};

export const getMatterActivity = async (
  practiceId: string,
  matterId: string,
  options: FetchOptions = {}
): Promise<BackendMatterActivity[]> => {
  if (!practiceId || !matterId) {
    return [];
  }

  const response = await fetch(
    buildBackendUrl(`/api/matters/${encodeURIComponent(practiceId)}/matters/${encodeURIComponent(matterId)}/activity`),
    {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Accept': 'application/json'
      },
      signal: options.signal
    }
  );

  const payload = await fetchJsonOrThrow(response);
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

  const response = await fetch(
    buildBackendUrl(`/api/matters/${encodeURIComponent(practiceId)}/matters/${encodeURIComponent(matterId)}/notes`),
    {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Accept': 'application/json'
      },
      signal: options.signal
    }
  );

  const payload = await fetchJsonOrThrow(response);
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
  const response = await fetch(
    buildBackendUrl(`/api/matters/${encodeURIComponent(practiceId)}/matters/${encodeURIComponent(matterId)}/notes`),
    {
      method: 'POST',
      credentials: 'include',
      headers: buildJsonHeaders(),
      body: JSON.stringify({ content }),
      signal: options.signal
    }
  );

  const payload = await fetchJsonOrThrow(response);
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
  const response = await fetch(
    buildBackendUrl(
      `/api/matters/${encodeURIComponent(practiceId)}/matters/${encodeURIComponent(matterId)}/notes/${encodeURIComponent(noteId)}`
    ),
    {
      method: 'PUT',
      credentials: 'include',
      headers: buildJsonHeaders(),
      body: JSON.stringify({ content }),
      signal: options.signal
    }
  );

  const payload = await fetchJsonOrThrow(response);
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
  const response = await fetch(
    buildBackendUrl(
      `/api/matters/${encodeURIComponent(practiceId)}/matters/${encodeURIComponent(matterId)}/notes/${encodeURIComponent(noteId)}`
    ),
    {
      method: 'DELETE',
      credentials: 'include',
      headers: {
        'Accept': 'application/json'
      },
      signal: options.signal
    }
  );

  await fetchJsonOrThrow(response);
};

export const listMatterTimeEntries = async (
  practiceId: string,
  matterId: string,
  options: FetchOptions = {}
): Promise<BackendMatterTimeEntry[]> => {
  if (!practiceId || !matterId) {
    return [];
  }

  const response = await fetch(
    buildBackendUrl(`/api/matters/${encodeURIComponent(practiceId)}/matters/${encodeURIComponent(matterId)}/time-entries`),
    {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Accept': 'application/json'
      },
      signal: options.signal
    }
  );

  const payload = await fetchJsonOrThrow(response);
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
  const response = await fetch(
    buildBackendUrl(`/api/matters/${encodeURIComponent(practiceId)}/matters/${encodeURIComponent(matterId)}/time-entries`),
    {
      method: 'POST',
      credentials: 'include',
      headers: buildJsonHeaders(),
      body: JSON.stringify(payload),
      signal: options.signal
    }
  );

  const json = await fetchJsonOrThrow(response);
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
  const response = await fetch(
    buildBackendUrl(
      `/api/matters/${encodeURIComponent(practiceId)}/matters/${encodeURIComponent(matterId)}/time-entries/${encodeURIComponent(timeEntryId)}`
    ),
    {
      method: 'PUT',
      credentials: 'include',
      headers: buildJsonHeaders(),
      body: JSON.stringify(payload),
      signal: options.signal
    }
  );

  const json = await fetchJsonOrThrow(response);
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
  const response = await fetch(
    buildBackendUrl(
      `/api/matters/${encodeURIComponent(practiceId)}/matters/${encodeURIComponent(matterId)}/time-entries/${encodeURIComponent(timeEntryId)}`
    ),
    {
      method: 'DELETE',
      credentials: 'include',
      headers: {
        'Accept': 'application/json'
      },
      signal: options.signal
    }
  );

  await fetchJsonOrThrow(response);
};

export const getMatterTimeEntryStats = async (
  practiceId: string,
  matterId: string,
  options: FetchOptions = {}
): Promise<BackendMatterTimeStats | null> => {
  if (!practiceId || !matterId) {
    return null;
  }

  const response = await fetch(
    buildBackendUrl(`/api/matters/${encodeURIComponent(practiceId)}/matters/${encodeURIComponent(matterId)}/time-entries/stats`),
    {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Accept': 'application/json'
      },
      signal: options.signal
    }
  );

  const payload = await fetchJsonOrThrow(response);
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

  const response = await fetch(
    buildBackendUrl(`/api/matters/${encodeURIComponent(practiceId)}/matters/${encodeURIComponent(matterId)}/expenses`),
    {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Accept': 'application/json'
      },
      signal: options.signal
    }
  );

  const payload = await fetchJsonOrThrow(response);
  return extractExpensesArray(payload);
};

export const createMatterExpense = async (
  practiceId: string,
  matterId: string,
  payload: {
    description: string;
    amount: number;
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
  const response = await fetch(
    buildBackendUrl(`/api/matters/${encodeURIComponent(practiceId)}/matters/${encodeURIComponent(matterId)}/expenses`),
    {
      method: 'POST',
      credentials: 'include',
      headers: buildJsonHeaders(),
      body: JSON.stringify(payload),
      signal: options.signal
    }
  );

  const json = await fetchJsonOrThrow(response);
  if (json && typeof json === 'object' && 'expense' in json) {
    const record = json as Record<string, unknown>;
    if (record.expense && typeof record.expense === 'object') {
      return record.expense as BackendMatterExpense;
    }
  }
  return extractExpensesArray(json)[0] ?? null;
};

export const updateMatterExpense = async (
  practiceId: string,
  matterId: string,
  expenseId: string,
  payload: {
    description: string;
    amount: number;
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
  const response = await fetch(
    buildBackendUrl(
      `/api/matters/${encodeURIComponent(practiceId)}/matters/${encodeURIComponent(matterId)}/expenses/${encodeURIComponent(expenseId)}`
    ),
    {
      method: 'PUT',
      credentials: 'include',
      headers: buildJsonHeaders(),
      body: JSON.stringify(payload),
      signal: options.signal
    }
  );

  const json = await fetchJsonOrThrow(response);
  if (json && typeof json === 'object' && 'expense' in json) {
    const record = json as Record<string, unknown>;
    if (record.expense && typeof record.expense === 'object') {
      return record.expense as BackendMatterExpense;
    }
  }
  return extractExpensesArray(json)[0] ?? null;
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
  const response = await fetch(
    buildBackendUrl(
      `/api/matters/${encodeURIComponent(practiceId)}/matters/${encodeURIComponent(matterId)}/expenses/${encodeURIComponent(expenseId)}`
    ),
    {
      method: 'DELETE',
      credentials: 'include',
      headers: {
        'Accept': 'application/json'
      },
      signal: options.signal
    }
  );

  await fetchJsonOrThrow(response);
};

export const listMatterMilestones = async (
  practiceId: string,
  matterId: string,
  options: FetchOptions = {}
): Promise<BackendMatterMilestone[]> => {
  if (!practiceId || !matterId) {
    return [];
  }

  const response = await fetch(
    buildBackendUrl(`/api/matters/${encodeURIComponent(practiceId)}/matters/${encodeURIComponent(matterId)}/milestones`),
    {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Accept': 'application/json'
      },
      signal: options.signal
    }
  );

  const payload = await fetchJsonOrThrow(response);
  return extractMilestonesArray(payload);
};

export const createMatterMilestone = async (
  practiceId: string,
  matterId: string,
  payload: {
    description: string;
    amount: number;
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
  const response = await fetch(
    buildBackendUrl(`/api/matters/${encodeURIComponent(practiceId)}/matters/${encodeURIComponent(matterId)}/milestones`),
    {
      method: 'POST',
      credentials: 'include',
      headers: buildJsonHeaders(),
      body: JSON.stringify(payload),
      signal: options.signal
    }
  );

  const json = await fetchJsonOrThrow(response);
  if (json && typeof json === 'object' && 'milestone' in json) {
    const record = json as Record<string, unknown>;
    if (record.milestone && typeof record.milestone === 'object') {
      return record.milestone as BackendMatterMilestone;
    }
  }
  return extractMilestonesArray(json)[0] ?? null;
};

export const updateMatterMilestone = async (
  practiceId: string,
  matterId: string,
  milestoneId: string,
  payload: {
    description: string;
    amount: number;
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
  const response = await fetch(
    buildBackendUrl(
      `/api/matters/${encodeURIComponent(practiceId)}/matters/${encodeURIComponent(matterId)}/milestones/${encodeURIComponent(milestoneId)}`
    ),
    {
      method: 'PUT',
      credentials: 'include',
      headers: buildJsonHeaders(),
      body: JSON.stringify(payload),
      signal: options.signal
    }
  );

  const json = await fetchJsonOrThrow(response);
  if (json && typeof json === 'object' && 'milestone' in json) {
    const record = json as Record<string, unknown>;
    if (record.milestone && typeof record.milestone === 'object') {
      return record.milestone as BackendMatterMilestone;
    }
  }
  return extractMilestonesArray(json)[0] ?? null;
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
  const response = await fetch(
    buildBackendUrl(
      `/api/matters/${encodeURIComponent(practiceId)}/matters/${encodeURIComponent(matterId)}/milestones/${encodeURIComponent(milestoneId)}`
    ),
    {
      method: 'DELETE',
      credentials: 'include',
      headers: {
        'Accept': 'application/json'
      },
      signal: options.signal
    }
  );

  await fetchJsonOrThrow(response);
};

export const reorderMatterMilestones = async (
  practiceId: string,
  matterId: string,
  milestones: Array<{ id: string; order: number }>,
  options: FetchOptions = {}
): Promise<boolean> => {
  const response = await fetch(
    buildBackendUrl(`/api/matters/${encodeURIComponent(practiceId)}/matters/${encodeURIComponent(matterId)}/milestones/reorder`),
    {
      method: 'POST',
      credentials: 'include',
      headers: buildJsonHeaders(),
      body: JSON.stringify({ milestones }),
      signal: options.signal
    }
  );

  await fetchJsonOrThrow(response);
  return true;
};
