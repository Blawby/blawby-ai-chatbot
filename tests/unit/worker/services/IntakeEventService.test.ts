import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IntakeEventService } from '../../../../worker/services/IntakeEventService.js';
import {
  INTAKE_EVENT_PROVENANCES,
  type IntakeEventProvenance,
} from '../../../../worker/types/intakeEvent.js';
import type { Env } from '../../../../worker/types.js';

type PreparedCall = { sql: string; bindings: unknown[] };

interface SpyEnv {
  env: Env;
  prepared: PreparedCall[];
  setFirstResult: (row: Record<string, unknown> | null) => void;
  setAllResults: (rows: Array<Record<string, unknown>>) => void;
  setRunMeta: (meta: { changes?: number } | null) => void;
}

const createSpyEnv = (): SpyEnv => {
  const prepared: PreparedCall[] = [];
  const state: {
    firstResult: Record<string, unknown> | null;
    allResults: Array<Record<string, unknown>>;
    runMeta: { changes?: number } | null;
  } = {
    firstResult: null,
    allResults: [],
    runMeta: null,
  };

  const first = vi.fn(() => Promise.resolve(state.firstResult));
  const all = vi.fn(() => Promise.resolve({ results: state.allResults }));
  const run = vi.fn(() => Promise.resolve({ meta: state.runMeta ?? {} }));

  const bind = vi.fn((...args: unknown[]) => {
    prepared[prepared.length - 1].bindings = args;
    return { first, all, run };
  });

  const prepare = vi.fn((sql: string) => {
    prepared.push({ sql, bindings: [] });
    return { bind };
  });

  const env = {
    DB: { prepare } as unknown as Env['DB'],
    CHAT_SESSIONS: {} as Env['CHAT_SESSIONS'],
  } as Env;

  return {
    env,
    prepared,
    setFirstResult: (row) => { state.firstResult = row; },
    setAllResults: (rows) => { state.allResults = rows; },
    setRunMeta: (meta) => { state.runMeta = meta; },
  };
};

describe('INTAKE_EVENT_PROVENANCES', () => {
  it('lists the six provenance tags from the plan', () => {
    expect(INTAKE_EVENT_PROVENANCES).toEqual([
      'ai_intake',
      'ai_intake_no_tool_call',
      'safety_rail.legal_disclaimer',
      'ai_failure',
      'submit_intake',
      'mode_unresolved',
    ]);
  });
});

describe('IntakeEventService.getNextTurnSeq', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns 1 when no rows exist for the conversation', async () => {
    const spy = createSpyEnv();
    spy.setFirstResult({ max_seq: 0 });
    const service = new IntakeEventService(spy.env);

    const next = await service.getNextTurnSeq('conv-empty');

    expect(next).toBe(1);
    expect(spy.prepared[0].sql).toContain('MAX(turn_seq)');
    expect(spy.prepared[0].bindings).toEqual(['conv-empty']);
  });

  it('returns N+1 when N rows exist for the conversation', async () => {
    const spy = createSpyEnv();
    spy.setFirstResult({ max_seq: 4 });
    const service = new IntakeEventService(spy.env);

    expect(await service.getNextTurnSeq('conv-1')).toBe(5);
  });

  it('returns 1 when first() returns null (no row)', async () => {
    const spy = createSpyEnv();
    spy.setFirstResult(null);
    const service = new IntakeEventService(spy.env);

    expect(await service.getNextTurnSeq('conv-missing')).toBe(1);
  });
});

describe('IntakeEventService.recordTurn', () => {
  beforeEach(() => vi.resetAllMocks());

  it('inserts a row with all expected columns and server-generated id', async () => {
    const spy = createSpyEnv();
    spy.setFirstResult({ max_seq: 0 });
    const service = new IntakeEventService(spy.env);

    const before = Date.now();
    const result = await service.recordTurn({
      conversationId: 'conv-1',
      practiceId: 'practice-1',
      provenance: 'ai_intake',
      modeResolution: { isPublic: true, isIntakeMode: true },
      userMessage: 'I need help with a contract dispute',
      modelRequest: { model: 'gpt-4', messages: [] },
      modelResponse: { content: 'Sure, tell me more' },
      toolCalls: [{ name: 'save_case_details' }],
      toolResults: [{ ok: true }],
      failureReason: null,
    });
    const after = Date.now();

    expect(result.turn_seq).toBe(1);
    expect(result.provenance).toBe('ai_intake');
    expect(result.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    const createdMs = new Date(result.created_at).getTime();
    expect(createdMs).toBeGreaterThanOrEqual(before);
    expect(createdMs).toBeLessThanOrEqual(after);

    // Two SQL calls: getNextTurnSeq SELECT, then INSERT
    expect(spy.prepared).toHaveLength(2);
    expect(spy.prepared[1].sql).toContain('INSERT INTO intake_events');
    const [
      id,
      conversationId,
      practiceId,
      turnSeq,
      provenance,
      modeResolutionJson,
      userMessage,
      modelRequestJson,
      modelResponseJson,
      toolCallsJson,
      toolResultsJson,
      failureReason,
      createdAt,
    ] = spy.prepared[1].bindings;

    expect(id).toBe(result.id);
    expect(conversationId).toBe('conv-1');
    expect(practiceId).toBe('practice-1');
    expect(turnSeq).toBe(1);
    expect(provenance).toBe('ai_intake');
    expect(JSON.parse(modeResolutionJson as string)).toEqual({ isPublic: true, isIntakeMode: true });
    expect(userMessage).toBe('I need help with a contract dispute');
    expect(JSON.parse(modelRequestJson as string)).toEqual({ model: 'gpt-4', messages: [] });
    expect(JSON.parse(modelResponseJson as string)).toEqual({ content: 'Sure, tell me more' });
    expect(JSON.parse(toolCallsJson as string)).toEqual([{ name: 'save_case_details' }]);
    expect(JSON.parse(toolResultsJson as string)).toEqual([{ ok: true }]);
    expect(failureReason).toBeNull();
    expect(createdAt).toBe(result.created_at);
  });

  it('stores JSON fields as null when not provided', async () => {
    const spy = createSpyEnv();
    spy.setFirstResult({ max_seq: 0 });
    const service = new IntakeEventService(spy.env);

    await service.recordTurn({
      conversationId: 'conv-1',
      practiceId: 'practice-1',
      provenance: 'mode_unresolved',
    });

    const bindings = spy.prepared[1].bindings;
    // mode_resolution_json, user_message, model_request_json, model_response_json,
    // tool_calls_json, tool_results_json, failure_reason all null
    expect(bindings[5]).toBeNull();
    expect(bindings[6]).toBeNull();
    expect(bindings[7]).toBeNull();
    expect(bindings[8]).toBeNull();
    expect(bindings[9]).toBeNull();
    expect(bindings[10]).toBeNull();
    expect(bindings[11]).toBeNull();
  });

  it('increments turn_seq based on the conversation max', async () => {
    const spy = createSpyEnv();
    spy.setFirstResult({ max_seq: 7 });
    const service = new IntakeEventService(spy.env);

    const result = await service.recordTurn({
      conversationId: 'conv-1',
      practiceId: 'practice-1',
      provenance: 'submit_intake',
    });

    expect(result.turn_seq).toBe(8);
    expect(spy.prepared[1].bindings[3]).toBe(8);
  });

  it('propagates D1 INSERT errors to the caller (caller decides fire-and-forget vs awaited)', async () => {
    const prepared: PreparedCall[] = [];
    const first = vi.fn(() => Promise.resolve({ max_seq: 0 }));
    const run = vi.fn(() => Promise.reject(new Error('CHECK constraint failed: provenance')));
    const bind = vi.fn(() => ({ first, run }));
    const prepare = vi.fn((sql: string) => {
      prepared.push({ sql, bindings: [] });
      return { bind };
    });
    const env = {
      DB: { prepare } as unknown as Env['DB'],
      CHAT_SESSIONS: {} as Env['CHAT_SESSIONS'],
    } as Env;
    const service = new IntakeEventService(env);

    await expect(
      service.recordTurn({
        conversationId: 'conv-1',
        practiceId: 'practice-1',
        // intentionally cast through unknown to simulate enum violation
        provenance: 'bogus_provenance' as unknown as IntakeEventProvenance,
      })
    ).rejects.toThrow(/CHECK constraint failed/);
  });
});

describe('IntakeEventService.listByConversation', () => {
  beforeEach(() => vi.resetAllMocks());

  it('parses JSON columns back into structured values, in turn_seq order', async () => {
    const spy = createSpyEnv();
    spy.setAllResults([
      {
        id: 'evt-1',
        conversation_id: 'conv-1',
        practice_id: 'practice-1',
        turn_seq: 1,
        provenance: 'ai_intake',
        mode_resolution_json: JSON.stringify({ isIntakeMode: true }),
        user_message: 'hello',
        model_request_json: JSON.stringify({ model: 'gpt-4' }),
        model_response_json: JSON.stringify({ content: 'hi' }),
        tool_calls_json: null,
        tool_results_json: null,
        failure_reason: null,
        created_at: '2026-05-18T10:00:00.000Z',
      },
      {
        id: 'evt-2',
        conversation_id: 'conv-1',
        practice_id: 'practice-1',
        turn_seq: 2,
        provenance: 'safety_rail.legal_disclaimer',
        mode_resolution_json: null,
        user_message: 'do I have a case?',
        model_request_json: null,
        model_response_json: null,
        tool_calls_json: null,
        tool_results_json: null,
        failure_reason: null,
        created_at: '2026-05-18T10:00:05.000Z',
      },
    ]);

    const service = new IntakeEventService(spy.env);
    const rows = await service.listByConversation('conv-1');

    expect(rows).toHaveLength(2);
    expect(rows[0].turn_seq).toBe(1);
    expect(rows[0].mode_resolution).toEqual({ isIntakeMode: true });
    expect(rows[0].model_request).toEqual({ model: 'gpt-4' });
    expect(rows[1].provenance).toBe('safety_rail.legal_disclaimer');
    expect(rows[1].mode_resolution).toBeNull();
    expect(spy.prepared[0].sql).toContain('ORDER BY turn_seq ASC');
    expect(spy.prepared[0].bindings).toEqual(['conv-1']);
  });

  it('returns [] when D1 returns no results', async () => {
    const spy = createSpyEnv();
    spy.setAllResults([]);
    const service = new IntakeEventService(spy.env);

    expect(await service.listByConversation('conv-empty')).toEqual([]);
  });

  it('tolerates malformed JSON in a column without crashing the whole list', async () => {
    const spy = createSpyEnv();
    spy.setAllResults([
      {
        id: 'evt-1',
        conversation_id: 'conv-1',
        practice_id: 'practice-1',
        turn_seq: 1,
        provenance: 'ai_intake',
        mode_resolution_json: '{ not valid json',
        user_message: 'hello',
        model_request_json: null,
        model_response_json: null,
        tool_calls_json: null,
        tool_results_json: null,
        failure_reason: null,
        created_at: '2026-05-18T10:00:00.000Z',
      },
    ]);

    const service = new IntakeEventService(spy.env);
    const rows = await service.listByConversation('conv-1');

    expect(rows[0].mode_resolution).toBeNull();
    expect(rows[0].user_message).toBe('hello');
  });
});

describe('IntakeEventService.deleteByConversation', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns the meta.changes count from the DELETE', async () => {
    const spy = createSpyEnv();
    spy.setRunMeta({ changes: 3 });
    const service = new IntakeEventService(spy.env);

    expect(await service.deleteByConversation('conv-1')).toBe(3);
    expect(spy.prepared[0].sql).toContain('DELETE FROM intake_events');
    expect(spy.prepared[0].bindings).toEqual(['conv-1']);
  });

  it('returns 0 when D1 reports no meta.changes', async () => {
    const spy = createSpyEnv();
    spy.setRunMeta(null);
    const service = new IntakeEventService(spy.env);

    expect(await service.deleteByConversation('conv-1')).toBe(0);
  });
});
