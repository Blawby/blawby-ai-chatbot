/**
 * Type-level tests for the wire contract.
 *
 * Each Zod schema in worker/types/wire/ pairs with a TypeScript type
 * derived via `z.infer<typeof Schema>`. These tests assert that
 * `expectTypeOf<z.infer<typeof Schema>>().toEqualTypeOf<Backend*>()` —
 * if the schema and the type drift, the test fails at type-check time
 * and a fixable error appears in CI.
 *
 * The test file uses `expectTypeOf().toMatchTypeOf<...>()` (looser than
 * toEqualTypeOf so the .passthrough()-introduced `[k: string]: unknown`
 * index signature doesn't bork the assertion).
 */
import { describe, it, expectTypeOf } from 'vitest';
import { z } from 'zod';

import {
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
  type BackendMatter,
  type BackendMatterActivity,
  type BackendMatterNote,
  type BackendMatterTimeEntry,
  type BackendMatterTimeStats,
  type BackendMatterExpense,
  type BackendMatterMilestone,
  type BackendMatterTask,
  type TaskStatus,
  type TaskPriority,
} from '../../../worker/types/wire/matter';

import {
  BackendInvoiceSchema,
  BackendInvoiceLineItemSchema,
  type BackendInvoice,
  type BackendInvoiceLineItem,
} from '../../../worker/types/wire/invoice';

import {
  BackendUploadRecordSchema,
  type BackendUploadRecord,
} from '../../../worker/types/wire/upload';

import {
  BackendSessionSchema,
  type BackendSession,
} from '../../../worker/types/wire/auth';

import {
  BackendIntakeCreatePayloadSchema,
  BackendIntakeCreateResponseSchema,
  type BackendIntakeCreatePayload,
  type BackendIntakeCreateResponse,
} from '../../../worker/types/wire/intake';

import {
  PracticeSchema,
  WorkspaceSchema,
  PracticeOrWorkspaceSchema,
  ConversationConfigSchema,
  PracticeConfigSchema,
  SubscriptionLifecycleStatusSchema,
  type Practice,
  type Workspace,
  type PracticeOrWorkspace,
  type ConversationConfig,
  type PracticeConfig,
  type SubscriptionLifecycleStatus,
} from '../../../worker/types/wire/practice';

import {
  BackendUserDetailSchema,
  BackendUserDetailAddressSchema,
  BackendUserDetailMemoSchema,
  UserDetailStatusSchema,
  type BackendUserDetail,
  type BackendUserDetailAddress,
  type BackendUserDetailMemo,
  type UserDetailStatus,
} from '../../../worker/types/wire/client';

import {
  BackendActivityEventSchema,
  BackendActivityActorTypeSchema,
  BackendActivityEventTypeSchema,
  BackendActivityListResponseSchema,
  type BackendActivityEvent,
  type BackendActivityActorType,
  type BackendActivityEventType,
  type BackendActivityListResponse,
} from '../../../worker/types/wire/activity';

describe('wire schemas — type/zod parity', () => {
  it('matter wire types match z.infer of their schemas', () => {
    expectTypeOf<z.infer<typeof BackendMatterSchema>>().toEqualTypeOf<BackendMatter>();
    expectTypeOf<z.infer<typeof BackendMatterActivitySchema>>().toEqualTypeOf<BackendMatterActivity>();
    expectTypeOf<z.infer<typeof BackendMatterNoteSchema>>().toEqualTypeOf<BackendMatterNote>();
    expectTypeOf<z.infer<typeof BackendMatterTimeEntrySchema>>().toEqualTypeOf<BackendMatterTimeEntry>();
    expectTypeOf<z.infer<typeof BackendMatterTimeStatsSchema>>().toEqualTypeOf<BackendMatterTimeStats>();
    expectTypeOf<z.infer<typeof BackendMatterExpenseSchema>>().toEqualTypeOf<BackendMatterExpense>();
    expectTypeOf<z.infer<typeof BackendMatterMilestoneSchema>>().toEqualTypeOf<BackendMatterMilestone>();
    expectTypeOf<z.infer<typeof BackendMatterTaskSchema>>().toEqualTypeOf<BackendMatterTask>();
    expectTypeOf<z.infer<typeof TaskStatusSchema>>().toEqualTypeOf<TaskStatus>();
    expectTypeOf<z.infer<typeof TaskPrioritySchema>>().toEqualTypeOf<TaskPriority>();
  });

  it('invoice wire types match z.infer of their schemas', () => {
    expectTypeOf<z.infer<typeof BackendInvoiceSchema>>().toEqualTypeOf<BackendInvoice>();
    expectTypeOf<z.infer<typeof BackendInvoiceLineItemSchema>>().toEqualTypeOf<BackendInvoiceLineItem>();
  });

  it('upload wire type matches z.infer of its schema', () => {
    expectTypeOf<z.infer<typeof BackendUploadRecordSchema>>().toEqualTypeOf<BackendUploadRecord>();
  });

  it('auth wire type matches z.infer of its schema', () => {
    expectTypeOf<z.infer<typeof BackendSessionSchema>>().toEqualTypeOf<BackendSession>();
  });

  it('intake wire types match z.infer of their schemas', () => {
    expectTypeOf<z.infer<typeof BackendIntakeCreatePayloadSchema>>().toEqualTypeOf<BackendIntakeCreatePayload>();
    expectTypeOf<z.infer<typeof BackendIntakeCreateResponseSchema>>().toEqualTypeOf<BackendIntakeCreateResponse>();
  });

  it('practice wire types match z.infer of their schemas', () => {
    expectTypeOf<z.infer<typeof PracticeSchema>>().toEqualTypeOf<Practice>();
    expectTypeOf<z.infer<typeof WorkspaceSchema>>().toEqualTypeOf<Workspace>();
    expectTypeOf<z.infer<typeof PracticeOrWorkspaceSchema>>().toEqualTypeOf<PracticeOrWorkspace>();
    expectTypeOf<z.infer<typeof ConversationConfigSchema>>().toEqualTypeOf<ConversationConfig>();
    expectTypeOf<z.infer<typeof PracticeConfigSchema>>().toEqualTypeOf<PracticeConfig>();
    expectTypeOf<z.infer<typeof SubscriptionLifecycleStatusSchema>>().toEqualTypeOf<SubscriptionLifecycleStatus>();
  });

  it('client wire types match z.infer of their schemas', () => {
    expectTypeOf<z.infer<typeof BackendUserDetailSchema>>().toEqualTypeOf<BackendUserDetail>();
    expectTypeOf<z.infer<typeof BackendUserDetailAddressSchema>>().toEqualTypeOf<BackendUserDetailAddress>();
    expectTypeOf<z.infer<typeof BackendUserDetailMemoSchema>>().toEqualTypeOf<BackendUserDetailMemo>();
    expectTypeOf<z.infer<typeof UserDetailStatusSchema>>().toEqualTypeOf<UserDetailStatus>();
  });

  it('activity wire types match z.infer of their schemas', () => {
    expectTypeOf<z.infer<typeof BackendActivityEventSchema>>().toEqualTypeOf<BackendActivityEvent>();
    expectTypeOf<z.infer<typeof BackendActivityActorTypeSchema>>().toEqualTypeOf<BackendActivityActorType>();
    expectTypeOf<z.infer<typeof BackendActivityEventTypeSchema>>().toEqualTypeOf<BackendActivityEventType>();
    expectTypeOf<z.infer<typeof BackendActivityListResponseSchema>>().toEqualTypeOf<BackendActivityListResponse>();
  });
});
