import { afterEach, describe, expect, it, vi } from 'vitest';

import { PracticeAssistantActionService } from '../../../worker/services/practiceAssistant/actionService.js';
import { PracticeAssistantAuditService } from '../../../worker/services/practiceAssistant/auditService.js';
import { PracticeAssistantDataService } from '../../../worker/services/practiceAssistant/dataService.js';
import { ENTITY_REGISTRY } from '../../../worker/services/practiceAssistant/EntityRegistry.js';
import { executePracticeAssistantTools } from '../../../worker/services/practiceAssistant/toolExecutor.js';
import type { PracticeAssistantContext, PracticeAssistantToolCall } from '../../../worker/services/practiceAssistant/types.js';

const context = (): PracticeAssistantContext => ({
  env: {} as never,
  request: new Request('https://example.com'),
  auth: { userId: 'owner-1', memberRole: 'owner' } as never,
  practiceId: 'practice-1',
  practiceSlug: 'billing-practice',
  conversationId: 'conversation-1',
  userId: 'owner-1',
  emitProgress: vi.fn(),
});

const call = (name: string, args: Record<string, unknown>, index = 0): PracticeAssistantToolCall => ({
  id: `tool-${index + 1}`,
  name,
  arguments: JSON.stringify(args),
  index,
});

const validDraft = {
  client_id: 'client-1',
  matter_id: 'matter-1',
  connected_account_id: 'account-1',
  invoice_type: 'flat_fee',
  line_items: [
    {
      type: 'time_entry',
      description: 'Draft demand letter',
      quantity: 1,
      unit_price: 25_000,
      time_entry_id: 'time-1',
    },
  ],
  time_entry_ids: ['time-1'],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('practice assistant billing workflow', () => {
  it('maps invoice draft fields to the backend create contract', () => {
    const invoice = ENTITY_REGISTRY.invoice;
    expect(invoice.requiredCreateFields).toEqual(['client_id', 'connected_account_id', 'line_items']);
    expect(invoice.creatableFields?.map((field) => field.field)).toEqual([
      'client_id',
      'matter_id',
      'connected_account_id',
      'invoice_number',
      'invoice_type',
      'due_date',
      'notes',
      'memo',
      'line_items',
      'time_entry_ids',
      'expense_ids',
      'milestone_id',
    ]);
  });

  it('reads unbilled time without creating an action', async () => {
    vi.spyOn(PracticeAssistantAuditService.prototype, 'record').mockResolvedValue(undefined);
    vi.spyOn(PracticeAssistantDataService.prototype, 'listEntities').mockResolvedValue({
      records: [{ id: 'time-1', description: 'Draft demand letter', duration_minutes: 60, billable: true }],
      sources: [{ type: 'matter', id: 'matter-1', label: 'Matter matter-1' }],
    });
    const createPending = vi.spyOn(PracticeAssistantActionService.prototype, 'createPending');

    const [result] = await executePracticeAssistantTools([
      call('list_entities', {
        entityType: 'time_entry',
        parent: { entityType: 'matter', id: 'matter-1' },
        includeSources: true,
      }),
    ], context());

    expect(result.ok).toBe(true);
    expect(result.action).toBeUndefined();
    expect(createPending).not.toHaveBeenCalled();
  });

  it('stages a valid invoice draft without writing to the backend', async () => {
    vi.spyOn(PracticeAssistantAuditService.prototype, 'record').mockResolvedValue(undefined);
    const createPending = vi.spyOn(PracticeAssistantActionService.prototype, 'createPending').mockResolvedValue({
      actionId: 'action-draft',
      toolUseId: 'tool-1',
      toolName: 'create_entity',
      title: 'Create invoice',
      description: 'Create a new invoice record.',
      status: 'pending',
      payload: { actionType: 'create_entity', entityType: 'invoice', data: validDraft },
      sources: [{ type: 'matter', id: 'matter-1', label: 'Matter matter-1' }],
    });

    const [result] = await executePracticeAssistantTools([
      call('create_entity', {
        actionType: 'create_entity',
        entityType: 'invoice',
        data: validDraft,
        rationale: 'Prepare a draft from approved unbilled work.',
        sources: [{ type: 'matter', id: 'matter-1', label: 'Matter matter-1' }],
      }),
    ], context());

    expect(result.ok).toBe(true);
    expect(result.action).toMatchObject({ actionId: 'action-draft', status: 'pending' });
    expect(createPending).toHaveBeenCalledOnce();
  });

  it('rejects an invalid invoice proposal before asking for approval', async () => {
    vi.spyOn(PracticeAssistantAuditService.prototype, 'record').mockResolvedValue(undefined);
    const createPending = vi.spyOn(PracticeAssistantActionService.prototype, 'createPending');

    const [result] = await executePracticeAssistantTools([
      call('create_entity', {
        actionType: 'create_entity',
        entityType: 'invoice',
        data: { client_id: 'client-1', line_items: [] },
      }),
    ], context());

    expect(result.ok).toBe(false);
    expect(result.error).toContain('connected_account_id');
    expect(createPending).not.toHaveBeenCalled();
  });

  it('stages send as a second owner-approved action', async () => {
    vi.spyOn(PracticeAssistantAuditService.prototype, 'record').mockResolvedValue(undefined);
    vi.spyOn(PracticeAssistantActionService.prototype, 'createPending').mockResolvedValue({
      actionId: 'action-send',
      toolUseId: 'tool-1',
      toolName: 'run_entity_action',
      title: 'send invoice',
      description: 'Run "send" on invoice invoice-1.',
      status: 'pending',
      payload: { actionType: 'run_entity_action', entityType: 'invoice', id: 'invoice-1', action: 'send' },
      sources: [{ type: 'invoice', id: 'invoice-1', label: 'Invoice invoice-1' }],
    });

    const [result] = await executePracticeAssistantTools([
      call('run_entity_action', {
        actionType: 'run_entity_action',
        entityType: 'invoice',
        id: 'invoice-1',
        action: 'send',
        rationale: 'The owner asked to send the reviewed draft.',
        sources: [{ type: 'invoice', id: 'invoice-1', label: 'Invoice invoice-1' }],
      }),
    ], context());

    expect(result.ok).toBe(true);
    expect(result.action).toMatchObject({ actionId: 'action-send', status: 'pending' });
  });
});
