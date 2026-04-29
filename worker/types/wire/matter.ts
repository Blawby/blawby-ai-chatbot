/**
 * Wire types for Matter resources — backend HTTP contract.
 *
 * snake_case fields, exactly matching the backend at
 * `BACKEND_API_URL` (staging-api.blawby.com / production-api.blawby.com).
 *
 * Frontend code imports these via `@/shared/types/wire`.
 * Worker code imports directly from this module.
 */

import type { MajorAmount } from '../../../src/shared/utils/money';

export type BackendMatter = {
  id: string;
  organization_id?: string | null;
  // Backend contract: single linked client/person reference for the matter.
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
