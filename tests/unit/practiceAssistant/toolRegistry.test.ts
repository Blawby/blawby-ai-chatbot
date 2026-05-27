import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildTurnMetadata, uniqueBySource } from '../../../worker/services/practiceAssistant/messageAdapter.js';
import { practiceAssistantTools, toOpenAiTools } from '../../../worker/services/practiceAssistant/toolRegistry.js';
import { PracticeAssistantDataService } from '../../../worker/services/practiceAssistant/dataService.js';
import { buildPracticeTool } from '../../../worker/services/practiceAssistant/types.js';
import {
  validateActionPayload,
  getEntityConfig,
  ENTITY_REGISTRY,
  validateFieldValue,
  verifyOperations,
  type FieldValidator,
  type WritableField,
} from '../../../worker/services/practiceAssistant/EntityRegistry.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('practice assistant tool registry', () => {
  const readTools = [
    'search_practice',
    'query_practice',
    'get_entity',
    'list_entities',
    'get_related_entities',
  ];
  const mutationTools = [
    'create_entity',
    'update_entity',
    'delete_entity',
    'run_entity_action',
  ];
  const expectedTools = [...readTools, ...mutationTools];

  const oldScriptedTools = [
    'get_today_work',
    'get_intake',
    'get_matter',
    'get_engagement',
    'list_matters',
    'list_open_tasks',
    'list_overdue_invoices',
    'get_report_summary',
    'get_wip_summary',
    'draft_engagement_from_intake',
    'create_engagement_from_draft',
    'propose_task_list',
    'create_matter_tasks',
    'propose_action',
    'update_practice_settings',
  ];

  it('registers only the capability-oriented primitives', async () => {
    const toolsByName = new Map(practiceAssistantTools.map((tool) => [tool.name, tool]));

    expect(practiceAssistantTools.map((tool) => tool.name)).toEqual(expectedTools);

    for (const name of readTools) {
      const tool = toolsByName.get(name);
      expect(tool?.isReadOnly({})).toBe(true);
      expect(tool?.isConcurrencySafe({})).toBe(true);
      expect(tool?.requiredRole).toBe('paralegal');
      expect(tool?.isDestructive({})).toBe(false);
    }

    for (const name of mutationTools) {
      const tool = toolsByName.get(name);
      expect(tool?.isReadOnly({})).toBe(false);
      expect(tool?.isConcurrencySafe({})).toBe(false);
      expect(tool?.isDestructive({})).toBe(false);
      expect(tool?.requiredRole).toBe('paralegal');
      await expect(tool?.checkPermissions({}, {} as never)).resolves.toEqual({ decision: 'requires_approval' });
      expect(tool?.renderApprovalSummary).toBeTypeOf('function');
    }

    for (const name of oldScriptedTools) expect(toolsByName.has(name)).toBe(false);
  });

  it('buildPracticeTool defaults fail closed for safety metadata', async () => {
    const tool = buildPracticeTool({
      name: 'test_tool',
      description: 'Test tool',
      inputSchema: { parse: (value: unknown) => value } as never,
      requiredRole: 'paralegal',
      call: async () => ({ ok: true }),
    });
    expect(tool.isEnabled()).toBe(true);
    expect(tool.isReadOnly({})).toBe(false);
    expect(tool.isConcurrencySafe({})).toBe(false);
    expect(tool.isDestructive({})).toBe(false);
    await expect(tool.checkPermissions({}, {} as never)).resolves.toEqual({ decision: 'requires_approval' });
  });

  it('exports JSON-schema tool definitions for the model runtime', () => {
    const openAiTools = toOpenAiTools();
    expect(openAiTools).toHaveLength(expectedTools.length);
    expect(openAiTools.every((tool) => tool.type === 'function')).toBe(true);
    expect(openAiTools.map((tool) => tool.function.name)).toEqual(expectedTools);
    for (const name of oldScriptedTools) {
      expect(openAiTools.map((tool) => tool.function.name)).not.toContain(name);
    }
  });

  it('mutation tools do not accept model-authored title, description, or payload wrapper', () => {
    for (const toolName of mutationTools) {
      const tool = toOpenAiTools().find((t) => t.function.name === toolName);
      const schema = tool?.function.parameters as { required?: string[] };
      expect(schema.required ?? []).not.toContain('title');
      expect(schema.required ?? []).not.toContain('description');
      expect(schema.required ?? []).not.toContain('payload');
    }
  });

  it('update_entity rejects unknown action types and missing required fields', () => {
    expect(() => validateActionPayload({ actionType: 'update_entity' })).toThrow();
    expect(() => validateActionPayload({ actionType: 'update_entity', entityType: 'matter' })).toThrow();
    expect(() => validateActionPayload({
      actionType: 'update_entity',
      entityType: 'matter',
      id: 'm1',
      operations: [],
    })).toThrow();
    expect(() => validateActionPayload({
      actionType: 'update_entity',
      entityType: 'unsupported_entity',
      id: 'x1',
      operations: [{ op: 'set', field: 'title', value: 'X' }],
    })).toThrow();
  });

  it('update_entity accepts valid payload', () => {
    const payload = validateActionPayload({
      actionType: 'update_entity',
      entityType: 'matter',
      id: 'm1',
      operations: [{ op: 'set', field: 'title', value: 'New Title' }],
      rationale: 'User asked to rename the matter.',
    });
    expect(payload.actionType).toBe('update_entity');
  });

  it('create_entity accepts valid payload', () => {
    const payload = validateActionPayload({
      actionType: 'create_entity',
      entityType: 'matter',
      data: { title: 'New Matter', client_id: 'c1' },
      rationale: 'Create a matter for the client.',
    });
    expect(payload.actionType).toBe('create_entity');
  });

  it('delete_entity accepts valid payload', () => {
    const payload = validateActionPayload({
      actionType: 'delete_entity',
      entityType: 'matter',
      id: 'm1',
      rationale: 'Matter closed, removing record.',
    });
    expect(payload.actionType).toBe('delete_entity');
  });

  it('run_entity_action accepts valid payload', () => {
    const payload = validateActionPayload({
      actionType: 'run_entity_action',
      entityType: 'invoice',
      id: 'inv1',
      action: 'send',
      rationale: 'Send invoice to client.',
    });
    expect(payload.actionType).toBe('run_entity_action');
  });

  it('rejects arbitrary unknown action types', () => {
    expect(() => validateActionPayload({ actionType: 'make_magic' })).toThrow();
    expect(() => validateActionPayload({ actionType: 'update_practice_settings' })).toThrow();
  });

  it('keeps sources available on every read primitive schema', () => {
    for (const tool of practiceAssistantTools.filter((candidate) => candidate.isReadOnly({}))) {
      const schema = JSON.stringify(toOpenAiTools().find((candidate) => candidate.function.name === tool.name)?.function.parameters);
      expect(schema).toContain('includeSources');
    }
  });

  it('query_practice returns partial results with sourceErrors when a backend fails', async () => {
    vi.spyOn(PracticeAssistantDataService.prototype, 'searchPractice').mockResolvedValue({
      results: [{ id: 's1', title: 'Search hit' }],
      sources: [{ type: 'search', id: 's1', label: 'Search hit' }],
    });
    vi.spyOn(PracticeAssistantDataService.prototype, 'listEntities').mockImplementation(async (entityType) => {
      if (entityType === 'invoice') throw new Error('Invoices unavailable');
      return {
        records: [{ id: 'm1', title: 'Matter 1' }],
        sources: [{ type: 'matter', id: 'matter', label: 'Matters' }],
      };
    });
    const tool = practiceAssistantTools.find((candidate) => candidate.name === 'query_practice')!;
    const result = await tool.call({
      question: 'What needs attention?',
      entityTypes: ['matter', 'invoice'],
      includeSources: true,
    }, {
      env: {} as never,
      request: new Request('https://example.com'),
      auth: { userId: 'u1', memberRole: 'paralegal' } as never,
      practiceId: 'p1',
      practiceSlug: 'practice',
      conversationId: 'c1',
      userId: 'u1',
      emitProgress: vi.fn(),
    }, 'toolu_1');
    const data = result.data as { sourceErrors: Array<{ source: string; error: string }>; sources: unknown[] };
    expect(result.ok).toBe(true);
    expect(data.sourceErrors).toEqual([{ source: 'Invoices', error: 'Invoices unavailable' }]);
    expect(data.sources.length).toBeGreaterThan(0);
  });

  it('query_practice uses small inferred defaults instead of querying every entity type', async () => {
    vi.spyOn(PracticeAssistantDataService.prototype, 'searchPractice').mockResolvedValue({
      results: [],
      sources: [],
    });
    const listed: string[] = [];
    vi.spyOn(PracticeAssistantDataService.prototype, 'listEntities').mockImplementation(async (entityType) => {
      listed.push(entityType);
      return { records: [], sources: [] };
    });
    const tool = practiceAssistantTools.find((candidate) => candidate.name === 'query_practice')!;
    await tool.call({
      question: 'What needs attention today?',
      includeSources: true,
    }, {
      env: {} as never,
      request: new Request('https://example.com'),
      auth: { userId: 'u1', memberRole: 'paralegal' } as never,
      practiceId: 'p1',
      practiceSlug: 'practice',
      conversationId: 'c1',
      userId: 'u1',
      emitProgress: vi.fn(),
    }, 'toolu_defaults');
    expect(listed.sort()).toEqual(['invoice', 'matter', 'task']);
    expect(listed).not.toContain('file');
    expect(listed).not.toContain('note');
    expect(listed).not.toContain('conversation');
    expect(listed).not.toContain('engagement');
  });

  it('addresses the current practice as a singleton without search', async () => {
    const searchSpy = vi.spyOn(PracticeAssistantDataService.prototype, 'searchPractice');
    vi.spyOn(PracticeAssistantDataService.prototype, 'fetchBackend').mockImplementation(async (path) => {
      if (path === '/api/practice/p1') return { id: 'p1', slug: 'practice' };
      if (path === '/api/practice/p1/details') return { services: [{ key: 'FAMILY_LAW', name: 'Family Law' }] };
      throw new Error(`Unexpected path: ${path}`);
    });
    const tool = practiceAssistantTools.find((candidate) => candidate.name === 'get_entity')!;
    const result = await tool.call({
      entityType: 'practice',
      id: 'current',
      includeSources: true,
    }, {
      env: {} as never,
      request: new Request('https://example.com'),
      auth: { userId: 'u1', memberRole: 'paralegal' } as never,
      practiceId: 'p1',
      practiceSlug: 'practice',
      conversationId: 'c1',
      userId: 'u1',
      emitProgress: vi.fn(),
    }, 'toolu_2');
    expect(result.ok).toBe(true);
    expect(searchSpy).not.toHaveBeenCalled();
    expect(result.sources).toEqual([{ type: 'practice', id: 'current', label: 'practice', href: undefined }]);
  });

  it('update_entity derives approval copy from operations', async () => {
    const tool = practiceAssistantTools.find((candidate) => candidate.name === 'update_entity')!;
    const summary = await tool.renderApprovalSummary!({
      actionType: 'update_entity',
      entityType: 'practice_details',
      id: 'current',
      operations: [{ op: 'set', field: 'services', value: [{ key: 'PERSONAL_INJURY', name: 'Personal Injury' }] }],
      rationale: 'User asked to add personal injury as a practice area.',
      sources: [],
    }, {
      env: {} as never,
      request: new Request('https://example.com'),
      auth: { userId: 'u1', memberRole: 'paralegal' } as never,
      practiceId: 'p1',
      practiceSlug: 'practice',
      conversationId: 'c1',
      userId: 'u1',
      emitProgress: vi.fn(),
    });
    expect(summary.title).toBe('Update practice details');
    expect(summary.description).toContain('services');
    expect(summary.payload).toMatchObject({
      actionType: 'update_entity',
      entityType: 'practice_details',
      id: 'current',
    });
  });

  it('does not expose unsupported entity types for get/list/relation operations', () => {
    const getEntity = JSON.stringify(toOpenAiTools().find((tool) => tool.function.name === 'get_entity')?.function.parameters);
    const listEntities = JSON.stringify(toOpenAiTools().find((tool) => tool.function.name === 'list_entities')?.function.parameters);
    const related = JSON.stringify(toOpenAiTools().find((tool) => tool.function.name === 'get_related_entities')?.function.parameters);
    // Search-only types that have no CRUD routes — must never appear in read tool schemas
    for (const searchOnly of ['file', 'note', 'payment']) {
      expect(getEntity).not.toContain(`"${searchOnly}"`);
      expect(listEntities).not.toContain(`"${searchOnly}"`);
      expect(related).not.toContain(`"${searchOnly}"`);
    }
    // client and conversation ARE in EntityRegistry and must be accessible via read tools
    expect(getEntity).toContain('"client"');
    expect(listEntities).toContain('"client"');
    expect(getEntity).toContain('"conversation"');
    // search_practice exposes search-only types but not 'practice' itself
    const searchPractice = JSON.stringify(toOpenAiTools().find((tool) => tool.function.name === 'search_practice')?.function.parameters);
    expect(searchPractice).toContain('"client"');
    expect(searchPractice).toContain('"file"');
    expect(searchPractice).toContain('"report"');
    expect(searchPractice).not.toContain('"practice"');
  });

  it('list_entities with parent routes time_entry through the registry URL, not the WIP report', async () => {
    let capturedPath = '';
    vi.spyOn(PracticeAssistantDataService.prototype, 'fetchBackend').mockImplementation(async (path) => {
      capturedPath = path as string;
      return { time_entries: [{ id: 'te1', duration_minutes: 60 }] };
    });
    const tool = practiceAssistantTools.find((t) => t.name === 'list_entities')!;
    const result = await tool.call({
      entityType: 'time_entry',
      parent: { entityType: 'matter', id: 'matter-123' },
    }, {
      env: {} as never,
      request: new Request('https://example.com'),
      auth: { userId: 'u1', memberRole: 'paralegal' } as never,
      practiceId: 'p1',
      practiceSlug: 'practice',
      conversationId: 'c1',
      userId: 'u1',
      emitProgress: vi.fn(),
    }, 'toolu_list_te');
    expect(result.ok).toBe(true);
    expect(capturedPath).toBe('/api/matters/p1/matter-123/time-entries');
    expect(capturedPath).not.toContain('/wip');
    const data = result.data as { records: unknown[] };
    expect(data.records).toHaveLength(1);
  });

  it('list_entities rejects time_entry without parent', async () => {
    const service = new PracticeAssistantDataService({} as never, new Request('https://example.com'), 'p1', 'practice');
    await expect(service.listEntities('time_entry')).rejects.toThrow(/requires parent/);
  });

  it('get_entity with parent routes time_entry read through the registry URL', async () => {
    let capturedPath = '';
    vi.spyOn(PracticeAssistantDataService.prototype, 'fetchBackend').mockImplementation(async (path) => {
      capturedPath = path as string;
      return { id: 'te1', duration_minutes: 90 };
    });
    const tool = practiceAssistantTools.find((t) => t.name === 'get_entity')!;
    const result = await tool.call({
      entityType: 'time_entry',
      id: 'te1',
      parent: { entityType: 'matter', id: 'matter-456' },
    }, {
      env: {} as never,
      request: new Request('https://example.com'),
      auth: { userId: 'u1', memberRole: 'paralegal' } as never,
      practiceId: 'p1',
      practiceSlug: 'practice',
      conversationId: 'c1',
      userId: 'u1',
      emitProgress: vi.fn(),
    }, 'toolu_get_te');
    expect(result.ok).toBe(true);
    expect(capturedPath).toBe('/api/matters/p1/matter-456/time-entries/te1');
  });

  it('get_related_entities matter → time_entry uses parent scope, not matter_id filter', async () => {
    let capturedPath = '';
    vi.spyOn(PracticeAssistantDataService.prototype, 'fetchBackend').mockImplementation(async (path) => {
      capturedPath = path as string;
      return { time_entries: [{ id: 'te2', duration_minutes: 30 }] };
    });
    const service = new PracticeAssistantDataService({} as never, new Request('https://example.com'), 'p1', 'practice');
    const result = await service.getRelatedEntities('matter', 'matter-789', 'time_entry');
    expect(result.sourceErrors).toHaveLength(0);
    expect(capturedPath).toBe('/api/matters/p1/matter-789/time-entries');
    expect(capturedPath).not.toContain('/wip');
  });

  it('does not silently fall back to search for unsupported list operations', async () => {
    const searchSpy = vi.spyOn(PracticeAssistantDataService.prototype, 'searchPractice');
    const service = new PracticeAssistantDataService({} as never, new Request('https://example.com'), 'p1', 'practice');
    await expect(service.listEntities('client' as never)).rejects.toThrow();
    expect(searchSpy).not.toHaveBeenCalled();
  });

  it('returns relationship sourceErrors as metadata instead of fake records', async () => {
    vi.spyOn(PracticeAssistantDataService.prototype, 'listEntities').mockImplementation(async (entityType) => {
      if (entityType === 'invoice') throw new Error('Invoices unavailable');
      return { records: [{ id: 't1' }], sources: [{ type: 'task', id: 'task', label: 'Tasks' }] };
    });
    const service = new PracticeAssistantDataService({} as never, new Request('https://example.com'), 'p1', 'practice');
    const result = await service.getRelatedEntities('matter', 'm1');
    expect(result.sourceErrors).toEqual([{ source: 'invoice', error: 'Invoices unavailable' }]);
    expect(result.records).not.toContainEqual(expect.objectContaining({ sourceErrors: expect.anything() }));
  });

  it('rejects unsupported relationship pairs instead of guessing foreign keys', async () => {
    const service = new PracticeAssistantDataService({} as never, new Request('https://example.com'), 'p1', 'practice');
    await expect(service.getRelatedEntities('invoice', 'i1', 'matter')).rejects.toThrow('Unsupported relation');
  });

  it('removes old phrase-to-tool routing from the practice assistant prompt', () => {
    const routeSource = readFileSync(resolve(process.cwd(), 'worker/routes/practiceAssistant.ts'), 'utf8');
    const engineSource = readFileSync(resolve(process.cwd(), 'worker/services/practiceAssistant/PracticeAssistantQueryEngine.ts'), 'utf8');
    expect(routeSource).not.toContain('get_today_work');
    expect(routeSource).not.toContain('list_overdue_invoices');
    expect(routeSource).not.toContain('get_wip_summary');
    expect(routeSource).not.toContain('TOOL SELECTION RULES');
    expect(engineSource).toContain('Use capability-oriented practice tools');
    expect(engineSource).toContain('create_entity');
    expect(engineSource).toContain('update_entity');
    expect(engineSource).not.toContain('update_practice_settings');
    expect(engineSource).not.toContain('propose_action');
    expect(engineSource).toContain('never use search_practice to locate it');
    expect(routeSource).toContain('PracticeAssistantQueryEngine');
    expect(routeSource).not.toContain('requestChatCompletions');
    expect(routeSource).not.toContain('executePracticeAssistantTools');
  });

  it('sends conversation history through the query engine instead of keeping fake memory', () => {
    const routeSource = readFileSync(resolve(process.cwd(), 'worker/routes/aiChat.ts'), 'utf8');
    const engineSource = readFileSync(resolve(process.cwd(), 'worker/services/practiceAssistant/PracticeAssistantQueryEngine.ts'), 'utf8');
    expect(routeSource).toContain('messages: body.messages.map');
    expect(engineSource).toContain('loadMessages');
    expect(engineSource).toContain('...conversationMessages');
    expect(engineSource).not.toContain("private readonly messages: Array<{ role: 'user' | 'assistant'; content: string }> = []");
  });

  it('has a real abort path and does not poll model streams', () => {
    const engineSource = readFileSync(resolve(process.cwd(), 'worker/services/practiceAssistant/PracticeAssistantQueryEngine.ts'), 'utf8');
    expect(engineSource).toContain('new AbortController');
    expect(engineSource).toContain('this.abortController.abort');
    expect(engineSource).toContain('this.abortController.signal');
    expect(engineSource).not.toContain('setTimeout');
  });

  it('records action creation separately from permission decisions', () => {
    const actionServiceSource = readFileSync(resolve(process.cwd(), 'worker/services/practiceAssistant/actionService.ts'), 'utf8');
    expect(actionServiceSource).toContain('practice_assistant.action_created');
    expect(actionServiceSource).not.toContain("VALUES (?, ?, ?, 'practice_assistant.permission_decision', 'system', NULL, ?, ?)");
  });
});

describe('EntityRegistry contract', () => {
  it('all writable fields declare allowedOps explicitly (fail-closed)', () => {
    for (const [entityType, config] of Object.entries(ENTITY_REGISTRY)) {
      for (const field of config.writableFields ?? []) {
        expect(Array.isArray(field.allowedOps), `${entityType}.${field.field} missing allowedOps`).toBe(true);
        expect(field.validator, `${entityType}.${field.field} missing validator`).toBeDefined();
        expect(field.validator.kind, `${entityType}.${field.field} validator missing kind`).toBeTruthy();
      }
    }
  });

  it('sub-entity listRoute includes both practiceId and parentId', () => {
    const config = ENTITY_REGISTRY['matter_task'];
    const url = config.listRoute!({ practiceId: 'p1', parentId: 'matter-abc' });
    expect(url).toBe('/api/matters/p1/matter-abc/tasks');
    expect(url).toContain('p1');
    expect(url).toContain('matter-abc');
  });

  it('sub-entity read/update/delete routes use structured practiceId + parentId instead of composite string ID', () => {
    const config = ENTITY_REGISTRY['matter_task'];
    const scope = { practiceId: 'p1', id: 'task-456', parentId: 'matter-123' };
    expect(config.readRoute!(scope)).toBe('/api/matters/p1/matter-123/tasks/task-456');
    expect(config.updateRoute!(scope)).toBe('/api/matters/p1/matter-123/tasks/task-456');
    expect(config.deleteRoute!(scope)).toBe('/api/matters/p1/matter-123/tasks/task-456');
    // The task ID must appear verbatim — no slash-splitting of composite strings.
    expect(config.readRoute!(scope)).toContain('/tasks/task-456');
    expect(config.readRoute!({ practiceId: 'p1', id: 'task-789', parentId: 'matter-123' })).toMatch(/\/tasks\/task-789$/);
  });

  it('client_memo routes include both practiceId and parentId (clientId)', () => {
    const config = ENTITY_REGISTRY['client_memo'];
    const scope = { practiceId: 'p1', id: 'memo-1', parentId: 'client-2' };
    expect(config.readRoute!(scope)).toBe('/api/clients/p1/client-2/memos/memo-1');
    expect(config.listRoute!({ practiceId: 'p1', parentId: 'client-2' })).toBe('/api/clients/p1/client-2/memos');
  });

  it('preference routes use id as category name, not practiceId', () => {
    const config = ENTITY_REGISTRY['preference'];
    expect(config.readRoute!({ practiceId: 'UNUSED', id: 'billing' })).toBe('/api/preferences/billing');
    expect(config.listRoute!({ practiceId: 'UNUSED' })).toBe('/api/preferences');
  });

  it('worker-owned entities are marked with owner: "worker"', () => {
    expect(getEntityConfig('conversation').owner).toBe('worker');
    expect(getEntityConfig('matter').owner).toBe('backend');
    expect(getEntityConfig('invoice').owner).toBe('backend');
  });

  it('worker-owned conversation routes do not reference practiceId', () => {
    const config = ENTITY_REGISTRY['conversation'];
    const readUrl = config.readRoute!({ practiceId: 'UNUSED', id: 'conv-1' });
    expect(readUrl).toBe('/api/conversations/conv-1');
    expect(readUrl).not.toContain('UNUSED');
  });

  it('sub-entities declare parentEntityType', () => {
    const subEntities = ['matter_task', 'matter_note', 'matter_milestone', 'matter_expense', 'time_entry', 'matter_file_link', 'client_memo'];
    for (const entityType of subEntities) {
      const config = getEntityConfig(entityType);
      expect(config.parentEntityType, `${entityType} should have parentEntityType`).toBeTruthy();
    }
    expect(getEntityConfig('matter').parentEntityType).toBeUndefined();
    expect(getEntityConfig('invoice').parentEntityType).toBeUndefined();
  });

  it('lifecycle actions with structured input require a matching inputSchema', () => {
    const reorder = ENTITY_REGISTRY['matter_milestone'].lifecycleActions!.find((a) => a.action === 'reorder')!;
    expect(reorder.inputSchema).toBeDefined();
    expect(reorder.inputSchema!.safeParse({ ids: ['m1', 'm2'] }).success).toBe(true);
    expect(reorder.inputSchema!.safeParse({ ids: [] }).success).toBe(false);
    expect(reorder.inputSchema!.safeParse({}).success).toBe(false);
    expect(reorder.inputSchema!.safeParse({ ids: [1, 2] }).success).toBe(false);
  });

  it('intake convert action validates target field', () => {
    const convert = ENTITY_REGISTRY['intake'].lifecycleActions!.find((a) => a.action === 'convert')!;
    expect(convert.inputSchema!.safeParse({ target: 'matter' }).success).toBe(true);
    expect(convert.inputSchema!.safeParse({ target: 'engagement' }).success).toBe(true);
    expect(convert.inputSchema!.safeParse({ target: 'something_else' }).success).toBe(false);
    expect(convert.inputSchema!.safeParse({}).success).toBe(false);
  });

  it('deleteSemantics distinguishes unlink from hard delete', () => {
    expect(ENTITY_REGISTRY['matter_file_link'].deleteSemantics).toBe('unlink');
    expect(ENTITY_REGISTRY['matter'].deleteSemantics).toBe('delete');
    expect(ENTITY_REGISTRY['invoice'].deleteSemantics).toBe('delete');
  });

  it('update_entity schema accepts parent for sub-entity payloads', () => {
    const payload = validateActionPayload({
      actionType: 'update_entity',
      entityType: 'matter_task',
      id: 'task-1',
      parent: { entityType: 'matter', id: 'm1' },
      operations: [{ op: 'set', field: 'title', value: 'New title' }],
    });
    expect(payload.actionType).toBe('update_entity');
    if (payload.actionType === 'update_entity') {
      expect(payload.parent).toEqual({ entityType: 'matter', id: 'm1' });
    }
  });

  it('create_entity schema accepts parent for sub-entity payloads', () => {
    const payload = validateActionPayload({
      actionType: 'create_entity',
      entityType: 'matter_task',
      parent: { entityType: 'matter', id: 'm1' },
      data: { title: 'New task', status: 'pending' },
    });
    expect(payload.actionType).toBe('create_entity');
    if (payload.actionType === 'create_entity') {
      expect(payload.parent).toEqual({ entityType: 'matter', id: 'm1' });
    }
  });

  it('delete_entity schema accepts parent and reflects semantics in copy', () => {
    const payload = validateActionPayload({
      actionType: 'delete_entity',
      entityType: 'matter_file_link',
      id: 'upload-1',
      parent: { entityType: 'matter', id: 'm1' },
    });
    expect(payload.actionType).toBe('delete_entity');
  });

  it('run_entity_action schema rejects unknown action types at schema level', () => {
    expect(() => validateActionPayload({
      actionType: 'run_entity_action',
      entityType: 'invoice',
      id: 'inv-1',
      action: '',
    })).toThrow();
  });

  it('update_entity schema accepts all expanded op types', () => {
    const ops = [
      { op: 'set', field: 'title', value: 'x' },
      { op: 'replace', field: 'description', value: 'y' },
      { op: 'append', field: 'notes', value: 'z' },
      { op: 'add_to_set', field: 'tags', value: 'a' },
      { op: 'remove_from_set', field: 'tags', value: 'b' },
      { op: 'increment', field: 'hourly_rate', delta: 10 },
    ];
    for (const op of ops) {
      expect(() => validateActionPayload({
        actionType: 'update_entity',
        entityType: 'matter',
        id: 'm1',
        operations: [op],
      }), `op "${op.op}" should be accepted`).not.toThrow();
    }
  });

  it('increment op requires delta not value', () => {
    expect(() => validateActionPayload({
      actionType: 'update_entity',
      entityType: 'matter',
      id: 'm1',
      operations: [{ op: 'increment', field: 'hourly_rate', value: 10 } as never],
    })).toThrow();
    expect(() => validateActionPayload({
      actionType: 'update_entity',
      entityType: 'matter',
      id: 'm1',
      operations: [{ op: 'increment', field: 'hourly_rate', delta: 10 }],
    })).not.toThrow();
  });

  it('deriveActionCopy uses op-specific verbs', async () => {
    const { deriveActionCopy } = await import('../../../worker/services/practiceAssistant/EntityRegistry.js');
    const appendCopy = deriveActionCopy({
      actionType: 'update_entity',
      entityType: 'matter_note',
      id: 'n1',
      operations: [{ op: 'append', field: 'content', value: 'More text' }],
    });
    expect(appendCopy.description).toContain('Append to content');

    const incrementCopy = deriveActionCopy({
      actionType: 'update_entity',
      entityType: 'matter',
      id: 'm1',
      operations: [{ op: 'increment', field: 'hourly_rate', delta: 25 }],
    });
    expect(incrementCopy.description).toContain('Increment hourly_rate by +25');

    const unlinkCopy = deriveActionCopy({
      actionType: 'delete_entity',
      entityType: 'matter_file_link',
      id: 'f1',
    });
    expect(unlinkCopy.title).toContain('Unlink');
    expect(unlinkCopy.title).not.toContain('Permanently delete');
  });
});

describe('practice assistant message adapter', () => {
  it('deduplicates sources and carries ordered action metadata', () => {
    const sources = uniqueBySource([
      { type: 'intake', id: 'i1', label: 'Intake 1' },
      { type: 'intake', id: 'i1', label: 'Intake 1 duplicate' },
      { type: 'matter', id: 'm1', label: 'Matter 1' },
    ]);

    expect(sources).toEqual([
      { type: 'intake', id: 'i1', label: 'Intake 1' },
      { type: 'matter', id: 'm1', label: 'Matter 1' },
    ]);

    const metadata = buildTurnMetadata([
      {
        toolUseId: 't1',
        toolName: 'update_entity',
        ok: true,
        sources,
        action: {
          actionId: 'a1',
          toolUseId: 't1',
          toolName: 'update_entity',
          title: 'Update matter',
          description: 'Set title on matter m1.',
          status: 'pending',
          payload: {},
          sources,
        },
      },
    ], []);

    expect(metadata.source).toBe('practice_assistant');
    expect(metadata.sources).toHaveLength(2);
    expect(metadata.assistantActions[0].actionId).toBe('a1');
    expect(metadata.actions).toEqual([
      {
        type: 'practice_assistant_decision',
        label: 'Reject',
        actionId: 'a1',
        decision: 'reject',
        variant: 'secondary',
      },
      {
        type: 'practice_assistant_decision',
        label: 'Approve',
        actionId: 'a1',
        decision: 'approve',
        variant: 'primary',
      },
    ]);
  });
});

// ─── validateFieldValue ────────────────────────────────────────────────────────

describe('validateFieldValue', () => {
  it('accepts a valid email', () => {
    expect(() => validateFieldValue({ kind: 'email' }, 'user@example.com')).not.toThrow();
  });

  it('rejects an invalid email', () => {
    expect(() => validateFieldValue({ kind: 'email' }, 'not-an-email', 'email'))
      .toThrow(/email/i);
  });

  it('rejects a non-string as email', () => {
    expect(() => validateFieldValue({ kind: 'email' }, 42)).toThrow();
  });

  it('accepts a valid enum value', () => {
    const v: FieldValidator = { kind: 'enum', values: ['open', 'closed'] };
    expect(() => validateFieldValue(v, 'open')).not.toThrow();
  });

  it('rejects an invalid enum value', () => {
    const v: FieldValidator = { kind: 'enum', values: ['open', 'closed'] };
    expect(() => validateFieldValue(v, 'pending', 'status')).toThrow(/open, closed/);
  });

  it('accepts a non-negative money value', () => {
    expect(() => validateFieldValue({ kind: 'money', min: 0 }, 150)).not.toThrow();
  });

  it('rejects a negative money value when min is 0', () => {
    expect(() => validateFieldValue({ kind: 'money', min: 0 }, -1, 'hourly_rate'))
      .toThrow(/>= 0/);
  });

  it('rejects a non-number as money', () => {
    expect(() => validateFieldValue({ kind: 'money' }, '100')).toThrow();
  });

  it('accepts a valid ISO date string', () => {
    expect(() => validateFieldValue({ kind: 'date' }, '2025-01-15')).not.toThrow();
  });

  it('rejects an invalid date string', () => {
    expect(() => validateFieldValue({ kind: 'date' }, 'not-a-date', 'due_date'))
      .toThrow(/date/i);
  });

  it('rejects a non-string as date', () => {
    expect(() => validateFieldValue({ kind: 'date' }, 12345)).toThrow();
  });

  it('accepts a valid string within length bounds', () => {
    expect(() => validateFieldValue({ kind: 'string', minLength: 1, maxLength: 10 }, 'hello')).not.toThrow();
  });

  it('rejects a string below minLength', () => {
    expect(() => validateFieldValue({ kind: 'string', minLength: 5 }, 'hi', 'title'))
      .toThrow(/at least 5/);
  });

  it('accepts a boolean', () => {
    expect(() => validateFieldValue({ kind: 'boolean' }, true)).not.toThrow();
  });

  it('rejects a non-boolean for boolean field', () => {
    expect(() => validateFieldValue({ kind: 'boolean' }, 'true')).toThrow(/boolean/i);
  });

  it('accepts a valid array', () => {
    expect(() => validateFieldValue({ kind: 'array', items: { kind: 'string' } }, ['a', 'b'])).not.toThrow();
  });

  it('rejects a non-array for array field', () => {
    expect(() => validateFieldValue({ kind: 'array' }, 'not-array')).toThrow(/array/i);
  });

  it('validates array items recursively', () => {
    expect(() =>
      validateFieldValue({ kind: 'array', items: { kind: 'email' } }, ['bad-email'], 'emails'),
    ).toThrow(/email/i);
  });

  it('accepts a valid object', () => {
    expect(() => validateFieldValue({ kind: 'object' }, { key: 'val' })).not.toThrow();
  });

  it('rejects an array as object', () => {
    expect(() => validateFieldValue({ kind: 'object' }, [1, 2])).toThrow(/object/i);
  });

  it('rejects null as object', () => {
    expect(() => validateFieldValue({ kind: 'object' }, null)).toThrow(/object/i);
  });
});

// ─── verifyOperations ─────────────────────────────────────────────────────────

describe('verifyOperations', () => {
  const fields: WritableField[] = [
    { field: 'status', validator: { kind: 'string' }, allowedOps: ['set'] },
    { field: 'tags', validator: { kind: 'array', items: { kind: 'string' } }, allowedOps: ['add_to_set', 'remove_from_set'] },
    { field: 'services', validator: { kind: 'array', items: { kind: 'object' } }, allowedOps: ['add_to_set', 'remove_from_set'], setIdentityKey: 'key' },
    { field: 'count', validator: { kind: 'number' }, allowedOps: ['increment'] },
    { field: 'notes', validator: { kind: 'string' }, allowedOps: ['append'] },
  ];

  it('returns no failures when set matches', () => {
    const failures = verifyOperations(
      [{ op: 'set', field: 'status', value: 'open' }],
      { status: 'open' },
      fields,
    );
    expect(failures).toHaveLength(0);
  });

  it('returns a failure when set value does not match', () => {
    const failures = verifyOperations(
      [{ op: 'set', field: 'status', value: 'open' }],
      { status: 'closed' },
      fields,
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatch(/status/);
  });

  it('returns no failures for add_to_set when primitive is present', () => {
    const failures = verifyOperations(
      [{ op: 'add_to_set', field: 'tags', value: 'urgent' }],
      { tags: ['important', 'urgent'] },
      fields,
    );
    expect(failures).toHaveLength(0);
  });

  it('returns a failure for add_to_set when primitive is absent', () => {
    const failures = verifyOperations(
      [{ op: 'add_to_set', field: 'tags', value: 'urgent' }],
      { tags: ['important'] },
      fields,
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatch(/tags/);
  });

  it('returns no failures for add_to_set on object array when identity key matches', () => {
    const failures = verifyOperations(
      [{ op: 'add_to_set', field: 'services', value: { key: 'family', name: 'Family Law' } }],
      { services: [{ key: 'family', name: 'Family Law' }] },
      fields,
    );
    expect(failures).toHaveLength(0);
  });

  it('returns a failure for add_to_set on object array when identity key absent', () => {
    const failures = verifyOperations(
      [{ op: 'add_to_set', field: 'services', value: { key: 'family', name: 'Family Law' } }],
      { services: [] },
      fields,
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatch(/services/);
  });

  it('returns no failures for remove_from_set when primitive is gone', () => {
    const failures = verifyOperations(
      [{ op: 'remove_from_set', field: 'tags', value: 'urgent' }],
      { tags: ['important'] },
      fields,
    );
    expect(failures).toHaveLength(0);
  });

  it('returns a failure for remove_from_set when primitive is still present', () => {
    const failures = verifyOperations(
      [{ op: 'remove_from_set', field: 'tags', value: 'urgent' }],
      { tags: ['important', 'urgent'] },
      fields,
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatch(/tags/);
  });

  it('skips increment (indeterminate expected value)', () => {
    const failures = verifyOperations(
      [{ op: 'increment', field: 'count', delta: 5 }],
      { count: 99 },
      fields,
    );
    expect(failures).toHaveLength(0);
  });

  it('skips append (indeterminate expected value)', () => {
    const failures = verifyOperations(
      [{ op: 'append', field: 'notes', value: ' more text' }],
      { notes: 'original text more text' },
      fields,
    );
    expect(failures).toHaveLength(0);
  });
});

// ─── EntityRegistry enforcement contracts ─────────────────────────────────────

describe('EntityRegistry enforcement contracts — new fields', () => {
  it('matter_file_link declares creatableFields with upload_id', () => {
    const config = getEntityConfig('matter_file_link');
    expect(config.creatableFields).toBeDefined();
    expect(config.creatableFields!.some((f) => f.field === 'upload_id')).toBe(true);
  });

  it('matter_file_link declares requiredCreateFields including upload_id', () => {
    const config = getEntityConfig('matter_file_link');
    expect(config.requiredCreateFields).toContain('upload_id');
  });

  it('practice_details.services has setIdentityKey "key"', () => {
    const config = getEntityConfig('practice_details');
    const servicesField = config.writableFields?.find((f) => f.field === 'services');
    expect(servicesField?.setIdentityKey).toBe('key');
  });

  it('WritableField interface carries setIdentityKey when declared', () => {
    // spot-check: every field that has kind:"array" items:"object" should declare setIdentityKey
    for (const [entityType, config] of Object.entries(ENTITY_REGISTRY)) {
      for (const field of config.writableFields ?? []) {
        if (
          field.validator.kind === 'array' &&
          field.validator.items?.kind === 'object' &&
          (field.allowedOps.includes('add_to_set') || field.allowedOps.includes('remove_from_set'))
        ) {
          expect(
            field.setIdentityKey,
            `${entityType}.${field.field} uses set ops on object array but has no setIdentityKey`,
          ).toBeDefined();
        }
      }
    }
  });
});
