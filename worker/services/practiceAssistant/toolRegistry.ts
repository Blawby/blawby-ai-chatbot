import { z } from 'zod';
import { buildPracticeTool, type PracticeAssistantTool } from './types.js';
import { PracticeAssistantActionService } from './actionService.js';
import {
  ENTITY_REGISTRY,
  createEntitySchema,
  updateEntitySchema,
  deleteEntitySchema,
  runEntityActionSchema,
  validateActionPayload,
  deriveActionCopy,
} from './EntityRegistry.js';
import type { PracticeAssistantSource } from './types.js';
import {
  PracticeAssistantDataService,
  type PracticeSearchEntityType,
} from './dataService.js';

// All registry entity types plus 'task' (report-only, lives in ENTITY_CONFIG not the registry)
const registryEntityTypes = Object.keys(ENTITY_REGISTRY) as [string, ...string[]];
const allEntityTypes: [string, ...string[]] = registryEntityTypes.includes('task')
  ? registryEntityTypes
  : [...registryEntityTypes, 'task'] as [string, ...string[]];
const entityTypeSchema = z.enum(allEntityTypes);

const parentScopeSchema = z.object({
  entityType: z.string().min(1),
  id: z.string().min(1),
}).optional();

const searchEntityTypeSchema = z.enum([
  'matter',
  'client',
  'intake',
  'invoice',
  'file',
  'note',
  'report',
  'task',
  'conversation',
  'engagement',
  'time_entry',
  'payment',
]);

const filterSchema = z.object({
  field: z.string().min(1),
  op: z.enum(['eq', 'neq', 'in', 'not_in', 'contains', 'before', 'after', 'on_or_before', 'on_or_after', 'exists']),
  value: z.unknown().optional(),
});

const sortSchema = z.object({
  field: z.string().min(1),
  direction: z.enum(['asc', 'desc']).optional(),
});

const listOptionsSchema = z.object({
  filters: z.array(filterSchema).optional(),
  dateRange: z.object({
    field: z.string().min(1).optional(),
    from: z.string().min(1).optional(),
    to: z.string().min(1).optional(),
  }).optional(),
  sort: z.array(sortSchema).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
  includeSources: z.boolean().optional(),
});

const dataService = (context: Parameters<PracticeAssistantTool['call']>[1]) =>
  new PracticeAssistantDataService(context.env, context.request, context.practiceId, context.practiceSlug);

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

const readTool = <TInput>(
  tool: Omit<PracticeAssistantTool<TInput>, 'isReadOnly' | 'isConcurrencySafe' | 'isDestructive' | 'requiredRole' | 'isEnabled' | 'checkPermissions'>
): PracticeAssistantTool<TInput> => buildPracticeTool({
  ...tool,
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  isDestructive: () => false,
  requiredRole: 'paralegal',
  checkPermissions: async () => ({ decision: 'allow' }),
});

const approvalTool = <TInput>(
  tool: Omit<PracticeAssistantTool<TInput>, 'isReadOnly' | 'isConcurrencySafe' | 'isDestructive' | 'requiredRole' | 'isEnabled' | 'checkPermissions'>
): PracticeAssistantTool<TInput> => buildPracticeTool({
  ...tool,
  isReadOnly: () => false,
  isConcurrencySafe: () => false,
  isDestructive: () => false,
  requiredRole: 'paralegal',
  checkPermissions: async () => ({ decision: 'requires_approval' }),
});

const renderEntityApproval = async (
  input: unknown,
  _context: Parameters<PracticeAssistantTool['call']>[1],
): Promise<{ title: string; description: string; payload: Record<string, unknown>; sources: PracticeAssistantSource[] }> => {
  const parsed = asRecord(input);
  const payload = validateActionPayload(parsed);
  const derived = deriveActionCopy(payload);
  return {
    title: derived.title,
    description: derived.description,
    payload: parsed,
    sources: Array.isArray(parsed.sources) ? parsed.sources as PracticeAssistantSource[] : [],
  };
};

const makeEntityMutationCall = (toolName: string) =>
  async (input: unknown, context: Parameters<PracticeAssistantTool['call']>[1], toolUseId: string) => {
    const summary = await renderEntityApproval(input, context);
    const action = await new PracticeAssistantActionService(context.env).createPending({
      practiceId: context.practiceId,
      conversationId: context.conversationId,
      userId: context.userId,
      toolUseId,
      toolName,
      summary,
    });
    return {
      ok: true,
      data: { requiresApproval: true, actionType: asRecord(input).actionType ?? toolName },
      sources: action.sources,
      action,
      progressLabel: `Prepared ${toolName.replace(/_/g, ' ')} for approval`,
    };
  };

export const practiceAssistantTools: PracticeAssistantTool[] = [
  readTool({
    name: 'search_practice',
    description: 'Search across practice records when discovering relevant matters, clients, intakes, invoices, files, notes, reports, tasks, conversations, and engagements. Use this to find candidate records before fetching, listing, or relating them. Do not use this to locate the current practice; use get_entity with entityType "practice" and id "current".',
    inputSchema: z.object({
      query: z.string().min(1),
      entityTypes: z.array(searchEntityTypeSchema).optional(),
      limit: z.number().int().min(1).max(50).optional(),
      includeSources: z.boolean().optional(),
    }),
    call: async (input, context) => {
      const parsed = input as { query: string; entityTypes?: PracticeSearchEntityType[]; limit?: number; includeSources?: boolean };
      const result = await dataService(context).searchPractice(parsed.query, {
        entityTypes: parsed.entityTypes,
        limit: parsed.limit,
        includeSources: parsed.includeSources ?? true,
      });
      return { ok: true, data: { results: result.results }, sources: result.sources, progressLabel: 'Searched practice records' };
    },
  }),
  readTool({
    name: 'query_practice',
    description: 'Answer broad practice-owner questions by retrieving, filtering, aggregating, and relating practice records. Use this for analytical questions, prioritization, risk review, summaries, counts, and questions that need multiple entity types or partial results when some sources fail.',
    inputSchema: z.object({
      question: z.string().min(1),
      scope: z.string().optional(),
      entityTypes: z.array(entityTypeSchema).optional(),
      filters: z.array(filterSchema).optional(),
      dateRange: listOptionsSchema.shape.dateRange,
      sort: z.array(sortSchema).optional(),
      limit: z.number().int().min(1).max(100).optional(),
      offset: z.number().int().min(0).optional(),
      signals: z.array(z.string().min(1)).optional(),
      includeSources: z.boolean().optional(),
      sources: z.array(z.enum(['backend', 'search', 'reports'])).optional(),
    }),
    call: async (input, context) => {
      const parsed = input as Parameters<PracticeAssistantDataService['queryPractice']>[0];
      const result = await dataService(context).queryPractice({
        ...parsed,
        includeSources: parsed.includeSources ?? true,
      });
      return { ok: true, data: result, sources: result.sources, progressLabel: result.sourceErrors.length ? 'Queried practice with partial source results' : 'Queried practice data' };
    },
  }),
  readTool({
    name: 'get_entity',
    description: 'Fetch one known practice record by entity type and ID. Use get_entity({ entityType: "practice", id: "current" }) for the current tenant practice; do not search for it by name or text. For child entities (e.g. time_entry, matter_task) pass parent: { entityType: "matter", id: "<matterId>" }.',
    inputSchema: z.object({
      entityType: entityTypeSchema,
      id: z.string().min(1),
      parent: parentScopeSchema,
      includeSources: z.boolean().optional(),
    }),
    call: async (input, context) => {
      const parsed = input as { entityType: string; id: string; parent?: { entityType: string; id: string } };
      const result = await dataService(context).getEntity(parsed.entityType, parsed.id, parsed.parent);
      return { ok: true, data: { record: result.record }, sources: result.sources, progressLabel: 'Fetched practice record' };
    },
  }),
  readTool({
    name: 'list_entities',
    description: 'List records of one supported practice entity type with generic filters, sorting, pagination, and limits. Child entities (time_entry, matter_task, matter_note, matter_expense, matter_milestone, matter_file_link, client_memo) require parent: { entityType, id }.',
    inputSchema: z.object({
      entityType: entityTypeSchema,
      parent: parentScopeSchema,
      ...listOptionsSchema.shape,
    }),
    call: async (input, context) => {
      const parsed = input as { entityType: string; parent?: { entityType: string; id: string } } & Parameters<PracticeAssistantDataService['listEntities']>[1];
      const result = await dataService(context).listEntities(parsed.entityType, parsed);
      return { ok: true, data: { records: result.records }, sources: result.sources, progressLabel: 'Listed practice records' };
    },
  }),
  readTool({
    name: 'get_related_entities',
    description: 'Traverse explicit supported relationships between practice records. matter → time_entry, matter_task, matter_note, matter_expense, matter_milestone use parent-scoped reads. matter → task, invoice, engagement use filter-based reads. Unsupported pairs fail.',
    inputSchema: z.object({
      entityType: entityTypeSchema,
      id: z.string().min(1),
      relation: z.union([entityTypeSchema, z.string().min(1)]).optional(),
      ...listOptionsSchema.shape,
    }),
    call: async (input, context) => {
      const parsed = input as { entityType: string; id: string; relation?: string } & Parameters<PracticeAssistantDataService['getRelatedEntities']>[3];
      const result = await dataService(context).getRelatedEntities(parsed.entityType, parsed.id, parsed.relation, parsed);
      return { ok: true, data: { records: result.records, sourceErrors: result.sourceErrors }, sources: result.sources, progressLabel: 'Fetched related practice records' };
    },
  }),
  approvalTool({
    name: 'create_entity',
    description: 'Propose creating a new practice record (matter, invoice, engagement, etc.) for user approval before anything is written. Always requires approval.',
    inputSchema: createEntitySchema,
    renderApprovalSummary: renderEntityApproval as never,
    call: makeEntityMutationCall('create_entity') as never,
  }),
  approvalTool({
    name: 'update_entity',
    description: 'Propose updating fields on an existing practice record (practice, matter, client, invoice, engagement, etc.) for user approval before anything is written. Read current state first with get_entity to avoid overwriting values not intended to change. Always requires approval.',
    inputSchema: updateEntitySchema,
    renderApprovalSummary: renderEntityApproval as never,
    call: makeEntityMutationCall('update_entity') as never,
  }),
  approvalTool({
    name: 'delete_entity',
    description: 'Propose deleting a practice record for user approval before anything is removed. Always requires approval.',
    inputSchema: deleteEntitySchema,
    renderApprovalSummary: renderEntityApproval as never,
    call: makeEntityMutationCall('delete_entity') as never,
  }),
  approvalTool({
    name: 'run_entity_action',
    description: 'Propose a lifecycle action on a practice record (e.g. send invoice, void invoice, convert intake) for user approval before execution. Always requires approval.',
    inputSchema: runEntityActionSchema,
    renderApprovalSummary: renderEntityApproval as never,
    call: makeEntityMutationCall('run_entity_action') as never,
  }),
].map((tool) => ({
  ...tool,
  call: async (input, context, toolUseId, onProgress) => {
    const parsed = asRecord(input);
    return tool.call(parsed as never, context, toolUseId, onProgress);
  },
}));

export const practiceAssistantToolByName = new Map(practiceAssistantTools.map((tool) => [tool.name, tool]));

export const toOpenAiTools = () => practiceAssistantTools.map((tool) => ({
  type: 'function',
  function: {
    name: tool.name,
    description: tool.description,
    parameters: z.toJSONSchema(tool.inputSchema),
  },
}));
