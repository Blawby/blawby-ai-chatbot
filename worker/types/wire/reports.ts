/**
 * Wire types for the new Railway endpoints introduced by blawby-backend#233.
 *
 * Trust transactions (`/api/trust-ledger/:practiceId`), WIP aggregates
 * (`/api/matters/:practiceId/wip`), and the per-practice tasks list
 * (`/api/tasks/:practiceId`) are not yet shipped in the existing wire/
 * schemas — defining them here keeps the worker code typed today and
 * gives one place to update when backend confirms the final shape.
 *
 * snake_case fields per the rest of the wire/ contract. All money in
 * cents (integers) following the invoice convention.
 */

import { z } from 'zod';

const nullableString = () => z.string().nullable().optional();
const nullableNumber = () => z.number().nullable().optional();
const isoDate = () => z.string().nullable().optional();

export const BackendTrustTransactionSchema = z.object({
  id: z.string(),
  practice_id: nullableString(),
  client_id: nullableString(),
  matter_id: nullableString(),
  type: nullableString(), // 'deposit' | 'withdrawal' | 'fee_payment' | …
  amount: nullableNumber(), // cents, signed (negative = withdrawal)
  balance_after: nullableNumber(), // cents, running balance
  description: nullableString(),
  occurred_at: isoDate(),
  client_name: nullableString(),
  client: z.record(z.string(), z.unknown()).nullable().optional(),
}).passthrough();
export type BackendTrustTransaction = z.infer<typeof BackendTrustTransactionSchema>;

export const BackendWipMatterSchema = z.object({
  matter_id: z.string(),
  matter_title: nullableString(),
  unbilled_seconds: nullableNumber(),
  unbilled_amount: nullableNumber(), // cents
}).passthrough();
export type BackendWipMatter = z.infer<typeof BackendWipMatterSchema>;

/**
 * Practice-wide tasks endpoint. Differs from `BackendMatterTask` only in
 * that it tolerates a missing `matter_id` (e.g. ad-hoc tasks not yet
 * attached to a matter) and includes assignee name when joined backend-
 * side.
 */
export const BackendPracticeTaskSchema = z.object({
  id: z.string(),
  matter_id: nullableString(),
  name: nullableString(),
  description: nullableString(),
  assignee_id: nullableString(),
  assignee_name: nullableString(),
  due_date: isoDate(),
  status: z.string(), // 'pending' | 'in_progress' | 'completed' | 'blocked' or backend-defined
  priority: nullableString(),
  stage: nullableString(),
  completed_at: isoDate(),
  created_at: isoDate(),
  updated_at: isoDate(),
}).passthrough();
export type BackendPracticeTask = z.infer<typeof BackendPracticeTaskSchema>;
