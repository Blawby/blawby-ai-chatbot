/**
 * Wire types for Matter resources — backend HTTP contract.
 *
 * snake_case fields, exactly matching the backend at
 * `BACKEND_API_URL` (staging-api.blawby.com / production-api.blawby.com).
 *
 * Each TypeScript type is paired with a Zod schema (`BackendMatterSchema`,
 * etc.) so callers that parse upstream JSON can validate at runtime via
 * `validateWire(schema, payload, label)`. Types are derived via
 * `z.infer<typeof Schema>` so the type and the validator can never
 * drift.
 *
 * Frontend code imports the TYPES via `@/shared/types/wire`. Schemas
 * stay worker-side (validation happens at the BFF boundary).
 */

import { z } from 'zod';
import type { MajorAmount } from '../../../src/shared/utils/money';

// MajorAmount is a branded number; Zod doesn't see the brand, so we
// validate as `number` and cast through unknown to preserve the brand
// in the inferred output type.
const MajorAmountSchema = z.number().nullable().optional() as unknown as z.ZodType<MajorAmount | null | undefined>;

const nullableString = () => z.string().nullable().optional();
const nullableBoolean = () => z.boolean().nullable().optional();
const nullableNumber = () => z.number().nullable().optional();
const isoDate = () => z.string().nullable().optional(); // ISO 8601 strings; backend accepts various formats so don't pin.

export const BackendMatterSchema = z.object({
  id: z.string(),
  organization_id: nullableString(),
  client_id: nullableString(),
  title: nullableString(),
  description: nullableString(),
  billing_type: nullableString(),
  total_fixed_price: MajorAmountSchema,
  contingency_percentage: nullableNumber(),
  settlement_amount: MajorAmountSchema,
  practice_service_id: nullableString(),
  admin_hourly_rate: MajorAmountSchema,
  attorney_hourly_rate: MajorAmountSchema,
  payment_frequency: nullableString(),
  case_number: nullableString(),
  matter_type: nullableString(),
  urgency: nullableString(),
  responsible_attorney_id: nullableString(),
  originating_attorney_id: nullableString(),
  court: nullableString(),
  judge: nullableString(),
  opposing_party: nullableString(),
  opposing_counsel: nullableString(),
  open_date: isoDate(),
  close_date: isoDate(),
  status: nullableString(),
  deleted_at: isoDate(),
  deleted_by: nullableString(),
  created_at: isoDate(),
  updated_at: isoDate(),
  assignee_ids: z.array(z.string()).nullable().optional(),
  assignees: z.union([z.array(z.record(z.string(), z.unknown())), z.array(z.string())]).nullable().optional(),
  milestones: z.array(z.record(z.string(), z.unknown())).nullable().optional(),
}).passthrough();
export type BackendMatter = z.infer<typeof BackendMatterSchema>;

export const BackendMatterActivitySchema = z.object({
  id: z.string(),
  matter_id: z.string(),
  user_id: nullableString(),
  action: nullableString(),
  description: nullableString(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  created_at: isoDate(),
}).passthrough();
export type BackendMatterActivity = z.infer<typeof BackendMatterActivitySchema>;

export const BackendMatterNoteSchema = z.object({
  id: z.string(),
  matter_id: z.string(),
  user_id: nullableString(),
  content: nullableString(),
  created_at: isoDate(),
  updated_at: isoDate(),
}).passthrough();
export type BackendMatterNote = z.infer<typeof BackendMatterNoteSchema>;

export const BackendMatterTimeEntrySchema = z.object({
  id: z.string(),
  matter_id: z.string(),
  user_id: nullableString(),
  start_time: isoDate(),
  end_time: isoDate(),
  duration: nullableNumber(),
  description: nullableString(),
  billable: nullableBoolean(),
  created_at: isoDate(),
  updated_at: isoDate(),
}).passthrough();
export type BackendMatterTimeEntry = z.infer<typeof BackendMatterTimeEntrySchema>;

export const BackendMatterTimeStatsSchema = z.object({
  totalBillableSeconds: nullableNumber(),
  totalSeconds: nullableNumber(),
  totalBillableHours: nullableNumber(),
  totalHours: nullableNumber(),
}).passthrough();
export type BackendMatterTimeStats = z.infer<typeof BackendMatterTimeStatsSchema>;

export const BackendMatterExpenseSchema = z.object({
  id: z.string(),
  matter_id: z.string(),
  description: nullableString(),
  amount: MajorAmountSchema,
  date: isoDate(),
  billable: nullableBoolean(),
  created_at: isoDate(),
  updated_at: isoDate(),
}).passthrough();
export type BackendMatterExpense = z.infer<typeof BackendMatterExpenseSchema>;

export const BackendMatterMilestoneSchema = z.object({
  id: z.string(),
  matter_id: z.string(),
  description: nullableString(),
  amount: MajorAmountSchema,
  due_date: isoDate(),
  status: nullableString(),
  order: nullableNumber(),
  created_at: isoDate(),
  updated_at: isoDate(),
}).passthrough();
export type BackendMatterMilestone = z.infer<typeof BackendMatterMilestoneSchema>;

export const TaskStatusSchema = z.enum(['pending', 'in_progress', 'completed', 'blocked']);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TaskPrioritySchema = z.enum(['low', 'normal', 'high', 'urgent']);
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;

export const BackendMatterTaskSchema = z.object({
  id: z.string(),
  matter_id: z.string(),
  name: z.string(),
  description: nullableString(),
  assignee_id: nullableString(),
  due_date: isoDate(),
  status: TaskStatusSchema,
  priority: TaskPrioritySchema,
  stage: z.string(),
  created_at: isoDate(),
  updated_at: isoDate(),
}).passthrough();
export type BackendMatterTask = z.infer<typeof BackendMatterTaskSchema>;
