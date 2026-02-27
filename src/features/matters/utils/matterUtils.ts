/**
 * matterUtils.ts
 * Pure transformation and formatting helpers for the matters feature.
 * No Preact imports, no side effects — safe to unit test in isolation.
 */

import {
  MATTER_STATUS_LABELS,
  MATTER_WORKFLOW_STATUSES,
  isMatterStatus,
  type MatterStatus
} from '@/shared/types/matterStatus';
import {
  type MatterDetail,
  type MatterExpense,
  type MatterOption,
  type MatterSummary,
  type MatterTask,
  type TimeEntry
} from '@/features/matters/data/matterTypes';
import type { MatterFormState } from '@/features/matters/components/MatterCreateModal';
import { asMajor, toMajorUnits } from '@/shared/utils/money';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { formatLongDate } from '@/shared/utils/dateFormatter';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
import {
  type BackendMatter,
  type BackendMatterActivity,
  type BackendMatterExpense,
  type BackendMatterMilestone,
  type BackendMatterNote,
  type BackendMatterTask,
  type BackendMatterTimeEntry
} from '@/features/matters/services/mattersApi';
import type { TimelineItem, TimelinePerson } from '@/shared/ui/activity/ActivityTimeline';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const CLOSED_STATUSES: MatterStatus[] = ['closed', 'declined', 'conflicted', 'referred'];

export const isClosedStatus = (status: MatterStatus) => CLOSED_STATUSES.includes(status);

export const statusOrder = Object.fromEntries(
  MATTER_WORKFLOW_STATUSES.map((status, index) => [status, index])
) as Record<MatterStatus, number>;

export const FIELD_LABELS: Record<string, string> = {
  title: 'title',
  description: 'description',
  client_id: 'client',
  practice_service_id: 'practice area',
  billing_type: 'billing type',
  case_number: 'case number',
  matter_type: 'matter type',
  urgency: 'urgency',
  responsible_attorney_id: 'responsible attorney',
  originating_attorney_id: 'originating attorney',
  court: 'court',
  judge: 'judge',
  opposing_party: 'opposing party',
  opposing_counsel: 'opposing counsel',
  open_date: 'open date',
  close_date: 'close date',
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

export const activityActionMap: Record<string, { type: TimelineItem['type']; label: string }> = {
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
  task_created: { type: 'edited', label: 'added a task.' },
  task_updated: { type: 'edited', label: 'updated a task.' },
  task_deleted: { type: 'edited', label: 'deleted a task.' },
  task_completed: { type: 'edited', label: 'completed a task.' },
  tasks_generated: { type: 'edited', label: 'generated tasks from a template.' },
  assignee_added: { type: 'edited', label: 'assigned a team member.' },
  assignee_removed: { type: 'edited', label: 'removed an assignee.' }
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

// ---------------------------------------------------------------------------
// Label helpers
// ---------------------------------------------------------------------------

export const formatUrgencyLabel = (value: string) => value.replace(/_/g, ' ');

export const resolveClientLabel = (clientId?: string | null, fallback?: string) => {
  if (fallback) return fallback;
  return clientId ? `Client ${clientId.slice(0, 8)}` : 'Unassigned client';
};

export const resolvePracticeServiceLabel = (serviceId?: string | null, fallback?: string) => {
  if (fallback) return fallback;
  return serviceId ? `Service ${serviceId.slice(0, 8)}` : 'Not specified';
};

export const resolveOptionLabel = (options: MatterOption[], id: string, fallback: string) =>
  options.find((o) => o.id === id)?.name ?? fallback;

export const normalizeMatterStatus = (status?: string | null): MatterStatus => {
  const normalized = status?.toLowerCase().replace(/\s+/g, '_') ?? '';
  if (normalized === 'draft' || normalized === 'lead') return 'first_contact';
  if (isMatterStatus(normalized)) return normalized;
  return 'first_contact';
};

export const normalizeUrgency = (urgency?: string | null): MatterDetail['urgency'] => {
  if (!urgency) return undefined;
  const normalized = urgency.toLowerCase().replace(/\s+/g, '_');
  const validValues = ['routine', 'time_sensitive', 'emergency'] as const;
  if ((validValues as readonly string[]).includes(normalized)) {
    return normalized as MatterDetail['urgency'];
  }
  throw new Error(`Invalid urgency value: "${urgency}". Expected one of: routine, time_sensitive, emergency`);
};

export const normalizeBillingType = (billingType?: string | null): MatterDetail['billingType'] => {
  if (!billingType) throw new Error('Missing required billing type');
  const normalized = billingType.toLowerCase().replace(/\s+/g, '_');
  const validValues = ['hourly', 'fixed', 'contingency', 'pro_bono'] as const;
  if ((validValues as readonly string[]).includes(normalized)) {
    return normalized as MatterDetail['billingType'];
  }
  throw new Error(`Invalid billing type: "${billingType}". Expected one of: hourly, fixed, contingency, pro_bono`);
};

export const normalizePaymentFrequency = (frequency?: string | null): MatterDetail['paymentFrequency'] => {
  if (!frequency) return undefined;
  const normalized = frequency.toLowerCase().replace(/\s+/g, '_');
  const validValues = ['project', 'milestone'] as const;
  if ((validValues as readonly string[]).includes(normalized)) {
    return normalized as MatterDetail['paymentFrequency'];
  }
  throw new Error(`Invalid payment frequency: "${frequency}". Expected one of: project, milestone`);
};

export const normalizeFieldLabel = (field: string): string => {
  const trimmed = field.trim();
  if (!trimmed) return '';
  return FIELD_LABELS[trimmed] ?? trimmed.replace(/_/g, ' ');
};

export const resolveStatusLabel = (value: string): string => {
  if (isMatterStatus(value)) return MATTER_STATUS_LABELS[value];
  return value.replace(/_/g, ' ');
};

export const humanizeAction = (value?: string | null): string | undefined => {
  if (!value) return undefined;
  return value.trim().replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
};

export const isEmailLike = (value: string) => value.includes('@');

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export const formatMinorCurrency = (value: unknown): string | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const major = toMajorUnits(value);
  if (typeof major !== 'number' || !Number.isFinite(major)) return null;
  return formatCurrency(major);
};

export const formatDuration = (seconds?: number | null): string | null => {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return null;
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) {
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  }
  if (hours > 0) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
};

export const formatFieldList = (fields: string[]): string | null => {
  if (fields.length === 0) return null;
  if (fields.length === 1) return fields[0];
  if (fields.length === 2) return `${fields[0]} and ${fields[1]}`;
  return `${fields.slice(0, -1).join(', ')}, and ${fields[fields.length - 1]}`;
};

export const stripActorPrefix = (description: string, actorName: string): string => {
  const trimmed = description.trim();
  if (!actorName) return trimmed;
  const prefix = `${actorName} `;
  if (trimmed.toLowerCase().startsWith(prefix.toLowerCase())) {
    return trimmed.slice(prefix.length).trim();
  }
  return trimmed;
};

// ---------------------------------------------------------------------------
// Backend → Frontend mappers
// ---------------------------------------------------------------------------

export const extractAssigneeIds = (matter: BackendMatter): string[] => {
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

export const mapMilestones = (milestones?: BackendMatter['milestones']): MatterDetail['milestones'] => {
  if (!Array.isArray(milestones)) return [];
  return milestones.map((item, index) => {
    if (!item || typeof item !== 'object') {
      return { description: `Milestone ${index + 1}`, dueDate: '', amount: asMajor(0) };
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

export const toMatterSummary = (
  matter: BackendMatter,
  options?: { clientNameById?: Map<string, string>; serviceNameById?: Map<string, string> }
): MatterSummary => {
  const updatedAt = matter.updated_at || matter.created_at || '';
  const clientName = matter.client_id ? options?.clientNameById?.get(matter.client_id) : undefined;
  const serviceName = matter.practice_service_id ? options?.serviceNameById?.get(matter.practice_service_id) : undefined;
  return {
    id: matter.id,
    title: matter.title || 'Untitled matter',
    clientName: resolveClientLabel(matter.client_id, clientName),
    practiceArea: matter.practice_service_id
      ? resolvePracticeServiceLabel(matter.practice_service_id, serviceName)
      : null,
    status: normalizeMatterStatus(matter.status),
    updatedAt,
    createdAt: matter.created_at || matter.updated_at || ''
  };
};

export const toMatterDetail = (
  matter: BackendMatter,
  options?: { clientNameById?: Map<string, string>; serviceNameById?: Map<string, string> }
): MatterDetail => ({
  ...toMatterSummary(matter, options),
  clientId: matter.client_id || '',
  practiceAreaId: matter.practice_service_id || '',
  assigneeIds: extractAssigneeIds(matter),
  description: matter.description || '',
  caseNumber: matter.case_number ?? undefined,
  matterType: matter.matter_type ?? undefined,
  urgency: normalizeUrgency(matter.urgency),
  responsibleAttorneyId: matter.responsible_attorney_id ?? undefined,
  originatingAttorneyId: matter.originating_attorney_id ?? undefined,
  court: matter.court ?? undefined,
  judge: matter.judge ?? undefined,
  opposingParty: matter.opposing_party ?? undefined,
  opposingCounsel: matter.opposing_counsel ?? undefined,
  openDate: matter.open_date ?? undefined,
  closeDate: matter.close_date ?? undefined,
  billingType: normalizeBillingType(matter.billing_type),
  attorneyHourlyRate: typeof matter.attorney_hourly_rate === 'number' ? asMajor(matter.attorney_hourly_rate) : undefined,
  adminHourlyRate: typeof matter.admin_hourly_rate === 'number' ? asMajor(matter.admin_hourly_rate) : undefined,
  paymentFrequency: normalizePaymentFrequency(matter.payment_frequency),
  totalFixedPrice: typeof matter.total_fixed_price === 'number' ? asMajor(matter.total_fixed_price) : undefined,
  settlementAmount: typeof matter.settlement_amount === 'number' ? asMajor(matter.settlement_amount) : undefined,
  milestones: mapMilestones(matter.milestones),
  contingencyPercent: matter.contingency_percentage ?? undefined,
  timeEntries: [],
  expenses: [],
  notes: []
});

export const toTimeEntry = (entry: BackendMatterTimeEntry): TimeEntry => {
  if (!entry.start_time || !entry.end_time) {
    throw new Error(`Invalid time entry: missing required timestamps (id: ${entry.id})`);
  }
  return {
    id: entry.id,
    startTime: entry.start_time,
    endTime: entry.end_time,
    description: entry.description ?? ''
  };
};

export const toExpense = (expense: BackendMatterExpense): MatterExpense => {
  if (!expense.date) {
    throw new Error(`Invalid expense: missing required date (id: ${expense.id})`);
  }
  return {
    id: expense.id,
    description: expense.description ?? 'Expense',
    amount: asMajor(expense.amount ?? 0),
    date: expense.date,
    billable: expense.billable ?? true
  };
};

export const toMilestone = (milestone: BackendMatterMilestone): MatterDetail['milestones'][number] => ({
  id: milestone.id,
  description: milestone.description ?? 'Milestone',
  amount: asMajor(milestone.amount ?? 0),
  dueDate: milestone.due_date ?? '',
  status: ((): MatterDetail['milestones'][number]['status'] => {
    const s = typeof milestone.status === 'string' ? milestone.status : undefined;
    if (!s) return undefined;
    if (s === 'pending' || s === 'in_progress' || s === 'completed' || s === 'overdue') return s;
    return undefined;
  })()
});

export const toMatterTask = (task: BackendMatterTask): MatterTask => {
  const normalizedStatus: MatterTask['status'] = (() => {
    if (task.status === 'pending' || task.status === 'in_progress' || task.status === 'completed' || task.status === 'blocked') {
      return task.status;
    }
    return 'pending';
  })();
  const normalizedPriority: MatterTask['priority'] = (() => {
    if (task.priority === 'low' || task.priority === 'normal' || task.priority === 'high' || task.priority === 'urgent') {
      return task.priority;
    }
    return 'normal';
  })();
  return {
    id: task.id,
    matterId: task.matter_id,
    name: task.name,
    description: task.description ?? null,
    assigneeId: task.assignee_id ?? null,
    dueDate: task.due_date ?? null,
    status: normalizedStatus,
    priority: normalizedPriority,
    stage: task.stage,
    createdAt: task.created_at ?? '',
    updatedAt: task.updated_at ?? ''
  };
};

export const toTaskStageOptions = (tasks: MatterTask[]): Array<{ value: string; label: string }> => {
  const stages = Array.from(
    new Set(
      tasks
        .map((task) => task.stage.trim())
        .filter((stage) => stage.length > 0)
    )
  ).sort((a, b) => a.localeCompare(b));
  return stages.map((stage) => ({ value: stage, label: stage }));
};

// ---------------------------------------------------------------------------
// MatterDetail → MatterFormState  (eliminates the 3x manual reconstruction)
// ---------------------------------------------------------------------------

export const buildFormStateFromDetail = (detail: MatterDetail, overrides?: Partial<MatterFormState>): MatterFormState => ({
  title: detail.title,
  clientId: detail.clientId,
  practiceAreaId: detail.practiceAreaId,
  assigneeIds: detail.assigneeIds,
  status: detail.status,
  caseNumber: detail.caseNumber ?? '',
  matterType: detail.matterType ?? '',
  urgency: detail.urgency ?? '',
  responsibleAttorneyId: detail.responsibleAttorneyId ?? '',
  originatingAttorneyId: detail.originatingAttorneyId ?? '',
  court: detail.court ?? '',
  judge: detail.judge ?? '',
  opposingParty: detail.opposingParty ?? '',
  opposingCounsel: detail.opposingCounsel ?? '',
  openDate: detail.openDate ?? '',
  closeDate: detail.closeDate ?? '',
  billingType: detail.billingType,
  attorneyHourlyRate: detail.attorneyHourlyRate,
  adminHourlyRate: detail.adminHourlyRate,
  paymentFrequency: detail.paymentFrequency,
  totalFixedPrice: detail.totalFixedPrice,
  settlementAmount: detail.settlementAmount,
  milestones: detail.milestones ?? [],
  contingencyPercent: detail.contingencyPercent,
  description: detail.description,
  ...overrides
});

// ---------------------------------------------------------------------------
// MatterFormState → API payload builders
// ---------------------------------------------------------------------------

export const nullIfEmpty = (value: string | undefined | null): string | null | undefined =>
  value === '' ? null : value || undefined;

const uuidOrNull = (value: string | undefined | null): string | null | undefined => {
  if (!value || value === '') return null;
  return isUuid(value) ? value : undefined;
};

export const buildCreatePayload = (values: MatterFormState): Record<string, unknown> => ({
  title: values.title.trim(),
  billing_type: values.billingType,
  status: values.status,
  client_id: values.clientId || undefined,
  practice_service_id: values.practiceAreaId || undefined,
  description: values.description || undefined,
  case_number: values.caseNumber || undefined,
  matter_type: values.matterType || undefined,
  urgency: values.urgency || undefined,
  responsible_attorney_id: values.responsibleAttorneyId || undefined,
  originating_attorney_id: values.originatingAttorneyId || undefined,
  court: values.court || undefined,
  judge: values.judge || undefined,
  opposing_party: values.opposingParty || undefined,
  opposing_counsel: values.opposingCounsel || undefined,
  attorney_hourly_rate: values.attorneyHourlyRate ?? undefined,
  admin_hourly_rate: values.adminHourlyRate ?? undefined,
  payment_frequency: values.paymentFrequency ?? undefined,
  total_fixed_price: values.totalFixedPrice ?? undefined,
  contingency_percentage: values.contingencyPercent ?? undefined,
  settlement_amount: values.settlementAmount ?? undefined,
  assignee_ids: values.assigneeIds.length > 0 ? values.assigneeIds : undefined,
  milestones: values.milestones.map((m, i) => ({
    description: m.description,
    amount: m.amount ?? 0,
    due_date: m.dueDate || null,
    order: i + 1
  }))
});

export const buildUpdatePayload = (
  values: MatterFormState,
  currentStatus?: MatterStatus
): Record<string, unknown> => ({
  title: values.title.trim(),
  billing_type: values.billingType,
  description: values.description?.trim() ?? undefined,
  client_id: nullIfEmpty(values.clientId),
  practice_service_id: nullIfEmpty(values.practiceAreaId),
  case_number: nullIfEmpty(values.caseNumber),
  matter_type: nullIfEmpty(values.matterType),
  urgency: nullIfEmpty(values.urgency),
  responsible_attorney_id: uuidOrNull(values.responsibleAttorneyId),
  originating_attorney_id: uuidOrNull(values.originatingAttorneyId),
  court: nullIfEmpty(values.court),
  judge: nullIfEmpty(values.judge),
  opposing_party: nullIfEmpty(values.opposingParty),
  opposing_counsel: nullIfEmpty(values.opposingCounsel),
  attorney_hourly_rate: values.attorneyHourlyRate ?? undefined,
  admin_hourly_rate: values.adminHourlyRate ?? undefined,
  payment_frequency: values.paymentFrequency ?? undefined,
  settlement_amount: values.settlementAmount ?? undefined,
  // Only send status if it changed
  status: values.status !== currentStatus ? values.status : undefined,
  assignee_ids: values.assigneeIds.length > 0 ? values.assigneeIds : null
});

export const prunePayload = (payload: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined));

// ---------------------------------------------------------------------------
// Activity / timeline helpers
// ---------------------------------------------------------------------------

export const extractChangedFields = (metadata: Record<string, unknown>): Array<{ key: string; label: string }> => {
  const raw = metadata.changed_fields;
  if (!Array.isArray(raw)) {
    console.warn('[matterUtils] Missing or invalid metadata.changed_fields', metadata);
    return [];
  }
  const seen = new Set<string>();
  const result: Array<{ key: string; label: string }> = [];
  
  for (const item of raw) {
    if (typeof item === 'string') {
      const trimmed = item.trim();
      const label = normalizeFieldLabel(trimmed);
      if (label && !seen.has(label)) {
        seen.add(label);
        result.push({ key: trimmed, label });
      }
    }
  }
  
  return result;
};

export const buildMatterCreatedLabel = (context: {
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
    return `created matter "${title}"${clientSuffix}${practiceSuffix}.`;
  }
  if (clientName || practiceArea) {
    const clientSuffix = clientName ? ` for ${clientName}` : '';
    const practiceSuffix = practiceArea ? ` (${practiceArea})` : '';
    return `created a matter${clientSuffix}${practiceSuffix}.`;
  }
  return 'created the matter.';
};

export const resolveStatusChangeLabel = (metadata: Record<string, unknown>): string | null => {
  const rawOld = metadata.oldStatus ?? metadata.old_status ?? metadata.from_status ?? metadata.from;
  const rawNew = metadata.newStatus ?? metadata.new_status ?? metadata.to_status ?? metadata.to ?? metadata.status;
  const oldValue = typeof rawOld === 'string' ? rawOld.trim() : '';
  const newValue = typeof rawNew === 'string' ? rawNew.trim() : '';
  if (oldValue && newValue) return `updated the status from ${resolveStatusLabel(oldValue)} to ${resolveStatusLabel(newValue)}.`;
  if (newValue) return `updated the status to ${resolveStatusLabel(newValue)}.`;
  return null;
};

export const buildStatusChangeMeta = (metadata: Record<string, unknown>): TimelineItem['actionMeta'] | null => {
  const rawOld = metadata.oldStatus ?? metadata.old_status ?? metadata.from_status ?? metadata.from;
  const rawNew = metadata.newStatus ?? metadata.new_status ?? metadata.to_status ?? metadata.to ?? metadata.status;
  const oldValue = typeof rawOld === 'string' ? rawOld.trim() : '';
  const newValue = typeof rawNew === 'string' ? rawNew.trim() : '';
  if (!oldValue || !newValue) return null;
  return { type: 'status_change', from: resolveStatusLabel(oldValue), to: resolveStatusLabel(newValue) };
};

export const buildSingleFieldUpdateAction = (
  field: string,
  metadata: Record<string, unknown>,
  options: {
    clientNameById: Map<string, string>;
    serviceNameById: Map<string, string>;
    assigneeNameById: Map<string, string>;
  }
): string | null => {
  const changes = metadata.changes;
  const changeRecord = changes && typeof changes === 'object' ? (changes as Record<string, unknown>) : {};
  const value = changeRecord[field];

  if (field === 'client_id' && typeof value === 'string' && value.trim()) {
    const clientName = options.clientNameById.get(value) ?? `Client ${value.slice(0, 6)}`;
    return `updated client to ${clientName}.`;
  }
  if (field === 'practice_service_id' && typeof value === 'string' && value.trim()) {
    const serviceName = options.serviceNameById.get(value) ?? `Service ${value.slice(0, 6)}`;
    return `updated practice area to ${serviceName}.`;
  }
  if ((field === 'responsible_attorney_id' || field === 'originating_attorney_id') && typeof value === 'string' && value.trim()) {
    const name = options.assigneeNameById.get(value) ?? `User ${value.slice(0, 6)}`;
    const label = field === 'responsible_attorney_id' ? 'responsible attorney' : 'originating attorney';
    return `updated ${label} to ${name}.`;
  }
  if (field === 'urgency' && typeof value === 'string' && value.trim()) {
    return `updated urgency to ${formatUrgencyLabel(value)}.`;
  }
  if (field === 'open_date' || field === 'close_date') {
    const label = field === 'open_date' ? 'open date' : 'close date';
    const formatted = typeof value === 'string' ? formatLongDate(value) : null;
    return formatted ? `updated ${label} to ${formatted}.` : `updated ${label}.`;
  }
  if (field === 'billing_type' && typeof value === 'string' && value.trim()) {
    return `updated billing type to ${value.replace(/_/g, ' ')}.`;
  }
  if (['admin_hourly_rate', 'attorney_hourly_rate', 'total_fixed_price', 'settlement_amount'].includes(field)) {
    const formatted = formatMinorCurrency(value);
    const label = normalizeFieldLabel(field);
    return formatted ? `updated ${label} to ${formatted}.` : `updated ${label}.`;
  }
  if (field === 'contingency_percentage' && typeof value === 'number') {
    return `updated contingency percentage to ${value}%.`;
  }
  if (typeof value === 'string' && value.trim()) {
    return `updated ${normalizeFieldLabel(field)} to ${value}.`;
  }
  return `updated ${normalizeFieldLabel(field)}.`;
};

export const findStatusChangeMeta = (
  activity: BackendMatterActivity,
  activities: BackendMatterActivity[]
): TimelineItem['actionMeta'] | null => {
  if (!activity.created_at) return null;
  const activityTime = new Date(activity.created_at).getTime();
  if (!Number.isFinite(activityTime)) return null;
  const match = activities.find((c) => {
    if (c.action !== 'matter_status_changed') return false;
    if (c.user_id !== activity.user_id) return false;
    if (!c.created_at) return false;
    const t = new Date(c.created_at).getTime();
    return Number.isFinite(t) && Math.abs(t - activityTime) <= 1000;
  });
  if (!match) return null;
  return buildStatusChangeMeta(match.metadata as Record<string, unknown>);
};

export const sortByTimestamp = <T extends { created_at?: string | null }>(items: T[]): T[] =>
  [...items].sort((a, b) => {
    const at = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
    return (Number.isNaN(at) ? 0 : at) - (Number.isNaN(bt) ? 0 : bt);
  });

const readString = (record: Record<string, unknown>, keys: string[]): string | null => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
};

const readTaskMetadata = (metadata: Record<string, unknown>) => {
  const changes = metadata.changes && typeof metadata.changes === 'object'
    ? metadata.changes as Record<string, unknown>
    : null;
  const previous = metadata.previous && typeof metadata.previous === 'object'
    ? metadata.previous as Record<string, unknown>
    : null;

  const taskId = readString(metadata, ['task_id', 'taskId', 'id'])
    ?? (changes ? readString(changes, ['task_id', 'taskId', 'id']) : null);
  const taskName = readString(metadata, ['task_name', 'taskName', 'name', 'title'])
    ?? (changes ? readString(changes, ['task_name', 'taskName', 'name', 'title']) : null)
    ?? (previous ? readString(previous, ['task_name', 'taskName', 'name', 'title']) : null);
  const stage = readString(metadata, ['stage'])
    ?? (changes ? readString(changes, ['stage']) : null)
    ?? (previous ? readString(previous, ['stage']) : null);
  const status = readString(metadata, ['status', 'new_status', 'newStatus'])
    ?? (changes ? readString(changes, ['status', 'new_status', 'newStatus']) : null);
  const templateName = readString(metadata, ['template_name', 'templateName']);
  const taskCountRaw = metadata.task_count ?? metadata.taskCount ?? metadata.count;
  const taskCount = typeof taskCountRaw === 'number' && Number.isFinite(taskCountRaw)
    ? taskCountRaw
    : null;

  return { taskId, taskName, stage, status, templateName, taskCount };
};

const parseTaskNameFromDescription = (description?: string): string | null => {
  if (!description) return null;
  const trimmed = description.trim();
  if (!trimmed) return null;

  const colonMatch = trimmed.match(/\btask:\s*(.+)$/i);
  if (colonMatch && colonMatch[1]?.trim()) return colonMatch[1].trim();

  const quotedMatch = trimmed.match(/\btask\s+"([^"]+)"/i);
  if (quotedMatch && quotedMatch[1]?.trim()) return quotedMatch[1].trim();

  return null;
};

export const buildActivityTimelineItem = (
  activity: BackendMatterActivity,
  activities: BackendMatterActivity[],
  context: {
    matterContext: { title?: string | null; clientName?: string | null; practiceArea?: string | null };
    clientNameById: Map<string, string>;
    serviceNameById: Map<string, string>;
    assigneeNameById: Map<string, string>;
    resolvePerson: (userId?: string | null) => TimelinePerson;
  }
): TimelineItem => {
  const createdAt = activity.created_at ?? new Date().toISOString();
  const actionKey = activity.action ?? '';
  const mapped = activityActionMap[actionKey];
  const type = mapped?.type ?? 'edited';
  const date = formatRelativeTime(createdAt);
  const description = activity.description ?? undefined;
  const person = context.resolvePerson(activity.user_id);
  const metadata = (activity.metadata ?? {}) as Record<string, unknown>;

  const timeEntryDuration = formatDuration(
    typeof metadata.duration === 'number' ? metadata.duration : null
  );
  const timeEntryDescription = typeof metadata.description === 'string' ? metadata.description : undefined;
  const cleanedDescription = description ? stripActorPrefix(description, person.name) : undefined;
  const taskMeta = readTaskMetadata(metadata);

  let actionMeta = actionKey === 'matter_status_changed'
    ? buildStatusChangeMeta(metadata)
    : null;

  const action = (() => {
    if (type === 'commented') return undefined;

    if (actionKey === 'matter_created') return buildMatterCreatedLabel(context.matterContext);

    if (actionKey === 'matter_updated') {
      const fields = extractChangedFields(metadata);
      if (fields.length === 1 && fields[0].label === 'client') {
        const changes = metadata.changes;
        if (changes && typeof changes === 'object') {
          const clientId = (changes as Record<string, unknown>).client_id;
          if (typeof clientId === 'string' && clientId.trim()) {
            const clientName = context.clientNameById.get(clientId);
            if (clientName) return `updated client to ${clientName}.`;
          }
        }
      }
      if (fields.length === 1 && fields[0].label === 'status') {
        const statusMeta = findStatusChangeMeta(activity, activities);
        if (!statusMeta) {
          console.warn('[matterUtils] Missing status change metadata', activity);
        } else {
          actionMeta = statusMeta;
        }
        return undefined;
      }
      if (fields.length === 1) {
        return buildSingleFieldUpdateAction(fields[0].key, metadata, context);
      }
      const labels = fields.map(f => f.label);
      const formatted = formatFieldList(labels);
      return formatted ? `updated ${formatted}.` : cleanedDescription ?? 'updated matter details.';
    }

    if (actionKey === 'matter_status_changed') {
      return resolveStatusChangeLabel(metadata) ?? 'updated the status.';
    }

    if (actionKey.startsWith('time_entry_')) {
      if (actionKey === 'time_entry_updated') {
        const fields = extractChangedFields(metadata);
        const labels = fields.map(f => f.label);
        const formatted = formatFieldList(labels);
        if (formatted) return `updated ${formatted}.`;
      }
      if (actionKey === 'time_entry_deleted') return cleanedDescription ?? 'deleted a time entry.';
      if (timeEntryDuration) {
        const verb = actionKey === 'time_entry_updated' ? 'updated' : 'logged';
        return timeEntryDescription
          ? `${verb} ${timeEntryDuration} for ${timeEntryDescription}.`
          : `${verb} ${timeEntryDuration}.`;
      }
      return cleanedDescription ?? 'logged time entry.';
    }

    if (actionKey.startsWith('milestone_')) {
      if (actionKey === 'milestone_updated') {
        const fields = extractChangedFields(metadata);
        const labels = fields.map(f => f.label);
        const formatted = formatFieldList(labels);
        if (formatted) return `updated ${formatted}.`;
      }
      if (cleanedDescription) return cleanedDescription;
      return actionKey === 'milestone_completed' ? 'completed a milestone.'
        : actionKey === 'milestone_deleted' ? 'deleted a milestone.'
        : actionKey === 'milestone_updated' ? 'updated a milestone.'
        : 'added a milestone.';
    }

    if (actionKey.startsWith('task_') || actionKey === 'tasks_generated') {
      if (actionKey !== 'tasks_generated') {
        actionMeta = { type: 'task_event', taskId: taskMeta.taskId ?? '' };
      }

      if (actionKey === 'tasks_generated') {
        const countLabel = taskMeta.taskCount ? `${taskMeta.taskCount} tasks` : 'tasks';
        if (taskMeta.templateName) {
          return `generated ${countLabel} from template "${taskMeta.templateName}".`;
        }
        if (cleanedDescription) return cleanedDescription;
        return mapped?.label ?? humanizeAction(actionKey);
      }

      const resolvedTaskName = taskMeta.taskName ?? parseTaskNameFromDescription(cleanedDescription);
      const taskName = resolvedTaskName ? `"${resolvedTaskName}"` : null;
      if (actionKey === 'task_created') {
        if (taskName) {
          const stageSuffix = taskMeta.stage ? ` (${taskMeta.stage})` : '';
          return `created task ${taskName}${stageSuffix}.`;
        }
        if (cleanedDescription) return cleanedDescription;
        return mapped?.label ?? humanizeAction(actionKey);
      }
      if (actionKey === 'task_updated') {
        const fields = extractChangedFields(metadata);
        const labels = fields.map((f) => f.label);
        const formatted = formatFieldList(labels);
        if (formatted && taskName) {
          return `updated ${formatted} for task ${taskName}.`;
        }
        if (formatted) return `updated ${formatted}.`;
        if (taskName) return `updated task ${taskName}.`;
        if (cleanedDescription) return cleanedDescription;
        return mapped?.label ?? humanizeAction(actionKey);
      }
      if (actionKey === 'task_completed') {
        const statusSuffix = taskMeta.status ? ` (status: ${taskMeta.status.replace(/_/g, ' ')})` : '';
        if (taskName) return `completed task ${taskName}${statusSuffix}.`;
        if (cleanedDescription) return cleanedDescription;
        return mapped?.label ?? humanizeAction(actionKey);
      }
      if (actionKey === 'task_deleted') {
        if (taskName) return `deleted task ${taskName}.`;
        if (cleanedDescription) return cleanedDescription;
        return mapped?.label ?? humanizeAction(actionKey);
      }
    }

    if (actionKey === 'expense_updated' || actionKey === 'note_updated') {
      const fields = extractChangedFields(metadata);
      const labels = fields.map(f => f.label);
      const formatted = formatFieldList(labels);
      if (formatted) return `updated ${formatted}.`;
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
    action,
    actionMeta: actionMeta ?? undefined
  };
};

export const buildNoteTimelineItem = (
  note: BackendMatterNote,
  resolvePerson: (userId?: string | null) => TimelinePerson
): TimelineItem => {
  const createdAt = note.created_at ?? new Date().toISOString();
  const person = resolvePerson(note.user_id);
  return {
    id: `note-${note.id}`,
    type: 'commented',
    person,
    date: formatRelativeTime(createdAt) || 'Just now',
    dateTime: createdAt,
    comment: note.content ?? ''
  };
};
