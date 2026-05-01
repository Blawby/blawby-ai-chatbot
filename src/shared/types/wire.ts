/**
 * Wire types — single source of truth for backend HTTP contracts.
 *
 * Frontend code MUST import backend response/request shapes from this module,
 * not redeclare them inline (no more `Backend*` types per service file).
 *
 * The wire types live under `worker/types/wire/` (one file per resource) and
 * are re-exported here so frontend `@/shared/types/wire` and worker
 * `worker/types/wire/<resource>` stay in lock-step.
 *
 * Both TypeScript types and Zod schemas are re-exported. Schemas let
 * frontend code validate runtime payloads with the same contract the
 * worker uses.
 */

export type { ApiResponse } from '../../../worker/types';

// ── Matter ────────────────────────────────────────────────────────────────
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
} from '../../../worker/types/wire/matter';
export {
  BackendMatterSchema,
  BackendMatterActivitySchema,
  BackendMatterNoteSchema,
  BackendMatterTimeEntrySchema,
  BackendMatterTimeStatsSchema,
  BackendMatterExpenseSchema,
  BackendMatterMilestoneSchema,
  BackendMatterTaskSchema,
  TaskStatusSchema,
  TaskPrioritySchema,
} from '../../../worker/types/wire/matter';

// ── Invoice ───────────────────────────────────────────────────────────────
export type {
  BackendInvoice,
  BackendInvoiceLineItem,
} from '../../../worker/types/wire/invoice';
export {
  BackendInvoiceSchema,
  BackendInvoiceLineItemSchema,
} from '../../../worker/types/wire/invoice';

// ── Upload ────────────────────────────────────────────────────────────────
export type { BackendUploadRecord } from '../../../worker/types/wire/upload';
export { BackendUploadRecordSchema } from '../../../worker/types/wire/upload';

// ── Auth ──────────────────────────────────────────────────────────────────
export type { BackendSession } from '../../../worker/types/wire/auth';
export { BackendSessionSchema } from '../../../worker/types/wire/auth';

// ── Intake ────────────────────────────────────────────────────────────────
export type {
  BackendIntakeCreatePayload,
  BackendIntakeCreateResponse,
} from '../../../worker/types/wire/intake';
export {
  BackendIntakeCreatePayloadSchema,
  BackendIntakeCreateResponseSchema,
} from '../../../worker/types/wire/intake';

// ── Practice ──────────────────────────────────────────────────────────────
export type {
  Practice,
  Workspace,
  PracticeOrWorkspace,
  ConversationConfig,
  PracticeConfig,
  SubscriptionLifecycleStatus,
} from '../../../worker/types/wire/practice';
export {
  PracticeSchema,
  WorkspaceSchema,
  PracticeOrWorkspaceSchema,
  ConversationConfigSchema,
  PracticeConfigSchema,
  SubscriptionLifecycleStatusSchema,
} from '../../../worker/types/wire/practice';

// ── Conversation ──────────────────────────────────────────────────────────
export type {
  ChatMessage,
  ChatSession,
  MessageReaction,
  BackendConversation,
} from '../../../worker/types/wire/conversation';

// ChatMessageUI is composed of wire ChatMessage + worker-internal
// UIMessageExtras, so it stays declared in worker/types.ts.
export type { ChatMessageUI } from '../../../worker/types';

// ── Client (user-detail) ──────────────────────────────────────────────────
export type {
  BackendUserDetail,
  BackendUserDetailAddress,
  BackendUserDetailMemo,
  UserDetailStatus,
} from '../../../worker/types/wire/client';
export {
  BackendUserDetailSchema,
  BackendUserDetailAddressSchema,
  BackendUserDetailMemoSchema,
  UserDetailStatusSchema,
} from '../../../worker/types/wire/client';

// ── Activity ──────────────────────────────────────────────────────────────
export type {
  BackendActivityEvent,
  BackendActivityActorType,
  BackendActivityEventType,
  BackendActivityListResponse,
} from '../../../worker/types/wire/activity';
export {
  BackendActivityEventSchema,
  BackendActivityActorTypeSchema,
  BackendActivityEventTypeSchema,
  BackendActivityListResponseSchema,
} from '../../../worker/types/wire/activity';
