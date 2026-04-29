/**
 * Wire types — single source of truth for backend HTTP contracts.
 *
 * Frontend code MUST import backend response/request shapes from this module,
 * not redeclare them inline (no more `Backend*` types per service file).
 *
 * The wire types live under `worker/types/wire/` (one file per resource) and
 * are re-exported here so frontend `@/shared/types/wire` and worker
 * `worker/types/wire/<resource>` stay in lock-step.
 */

export type { ApiResponse } from '../../../worker/types';

// Resource wire types are re-exported as they migrate from inline `Backend*`
// declarations in src/features/*/services/*.ts. Each migration adds a line
// here and deletes the inline type at the call site.
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

export type {
  BackendInvoice,
  BackendInvoiceLineItem,
} from '../../../worker/types/wire/invoice';

export type {
  BackendUploadRecord,
} from '../../../worker/types/wire/upload';

export type {
  BackendSession,
} from '../../../worker/types/wire/auth';

export type {
  BackendIntakeCreatePayload,
  BackendIntakeCreateResponse,
} from '../../../worker/types/wire/intake';

export type {
  Practice,
  Workspace,
  PracticeOrWorkspace,
  ConversationConfig,
  PracticeConfig,
  SubscriptionLifecycleStatus,
} from '../../../worker/types/wire/practice';

export type {
  ChatMessage,
  ChatSession,
  MessageReaction,
  BackendConversation,
} from '../../../worker/types/wire/conversation';

// ChatMessageUI is composed of wire ChatMessage + worker-internal
// UIMessageExtras, so it stays declared in worker/types.ts.
export type { ChatMessageUI } from '../../../worker/types';

export type {
  BackendUserDetail,
  BackendUserDetailAddress,
  BackendUserDetailMemo,
  UserDetailStatus,
} from '../../../worker/types/wire/client';

export type {
  BackendActivityEvent,
  BackendActivityActorType,
  BackendActivityEventType,
  BackendActivityListResponse,
} from '../../../worker/types/wire/activity';
