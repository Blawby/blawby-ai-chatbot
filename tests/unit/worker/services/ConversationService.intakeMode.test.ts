import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConversationService } from '../../../../worker/services/ConversationService.js';
import type { Env } from '../../../../worker/types.js';

/**
 * Back-fill for U1 / U6 of docs/plans/2026-05-18-002-feat-strengthen-intake-ai-observability-plan.md.
 * Covers the intake-mode signal lifecycle on the ConversationService:
 *   - markIntakeModeActivated (U1) — idempotent first-write-wins
 *   - markAiFailed (U6) — last-write-wins per-conversation failure marker
 *   - clearAiFailed (U6) — engineer escape hatch
 *   - getIntakeModeSignals (U1/U6) — focused read of both columns
 */

type SqlSpy = {
  env: Env;
  prepared: Array<{ sql: string; bindings: unknown[] }>;
  setFirstResult: (row: Record<string, unknown> | null) => void;
};

const createSqlSpy = (): SqlSpy => {
  const prepared: Array<{ sql: string; bindings: unknown[] }> = [];
  const state: { firstResult: Record<string, unknown> | null } = { firstResult: null };

  const first = vi.fn(() => Promise.resolve(state.firstResult));
  const run = vi.fn(() => Promise.resolve({ meta: {} }));
  const bind = vi.fn((...args: unknown[]) => {
    prepared[prepared.length - 1].bindings = args;
    return { first, run };
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
  };
};

describe('ConversationService.markIntakeModeActivated (U1)', () => {
  beforeEach(() => vi.resetAllMocks());

  it('issues a guarded UPDATE that only sets the timestamp when currently NULL', async () => {
    const spy = createSqlSpy();
    const service = new ConversationService(spy.env);

    await service.markIntakeModeActivated('conv-1', 'practice-1');

    expect(spy.prepared).toHaveLength(1);
    const sql = spy.prepared[0].sql;
    expect(sql).toMatch(/UPDATE conversations/i);
    expect(sql).toMatch(/SET intake_mode_activated_at = \?/);
    // The guard — first activation wins.
    expect(sql).toMatch(/intake_mode_activated_at IS NULL/);
    // ISO timestamp + conversationId + practiceId order.
    const [timestamp, conversationId, practiceId] = spy.prepared[0].bindings;
    expect(typeof timestamp).toBe('string');
    expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO
    expect(conversationId).toBe('conv-1');
    expect(practiceId).toBe('practice-1');
  });

  it('always issues the UPDATE; idempotency is enforced by the WHERE clause', async () => {
    // Calling twice does not throw and issues two UPDATEs. D1 enforces
    // the first-write-wins via the WHERE clause; a second UPDATE is a no-op
    // at the row level when intake_mode_activated_at IS NOT NULL.
    const spy = createSqlSpy();
    const service = new ConversationService(spy.env);

    await service.markIntakeModeActivated('conv-1', 'practice-1');
    await service.markIntakeModeActivated('conv-1', 'practice-1');

    expect(spy.prepared).toHaveLength(2);
    // Both UPDATEs have the IS NULL guard — D1 makes the second a no-op.
    for (const call of spy.prepared) {
      expect(call.sql).toMatch(/intake_mode_activated_at IS NULL/);
    }
  });
});

describe('ConversationService.markAiFailed (U6)', () => {
  beforeEach(() => vi.resetAllMocks());

  it('issues an UPDATE without the IS NULL guard — last write wins on repeated failures', async () => {
    const spy = createSqlSpy();
    const service = new ConversationService(spy.env);

    await service.markAiFailed('conv-1', 'practice-1', 'upstream_transient_exhausted');

    expect(spy.prepared).toHaveLength(1);
    const sql = spy.prepared[0].sql;
    expect(sql).toMatch(/UPDATE conversations/i);
    expect(sql).toMatch(/SET ai_failed_at = \?/);
    // NO `ai_failed_at IS NULL` guard — repeated failure attempts overwrite
    // so the most recent failure timestamp is captured. Reason text is logged
    // separately on the intake_events timeline; the column is a marker only.
    expect(sql).not.toMatch(/ai_failed_at IS NULL/);
    expect(spy.prepared[0].bindings[1]).toBe('conv-1');
    expect(spy.prepared[0].bindings[2]).toBe('practice-1');
  });
});

describe('ConversationService.clearAiFailed (U6)', () => {
  beforeEach(() => vi.resetAllMocks());

  it('issues an UPDATE that sets ai_failed_at = NULL', async () => {
    const spy = createSqlSpy();
    const service = new ConversationService(spy.env);

    await service.clearAiFailed('conv-1', 'practice-1');

    expect(spy.prepared).toHaveLength(1);
    const sql = spy.prepared[0].sql;
    expect(sql).toMatch(/UPDATE conversations/i);
    expect(sql).toMatch(/SET ai_failed_at = NULL/);
    expect(spy.prepared[0].bindings).toEqual(['conv-1', 'practice-1']);
  });
});

describe('ConversationService.getIntakeModeSignals (U1/U6)', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns the two columns from the conversation row', async () => {
    const spy = createSqlSpy();
    spy.setFirstResult({
      intake_mode_activated_at: '2026-05-18T10:00:00.000Z',
      ai_failed_at: null,
    });
    const service = new ConversationService(spy.env);

    const result = await service.getIntakeModeSignals('conv-1', 'practice-1');

    expect(result).toEqual({
      intake_mode_activated_at: '2026-05-18T10:00:00.000Z',
      ai_failed_at: null,
    });
    expect(spy.prepared[0].sql).toMatch(/SELECT intake_mode_activated_at, ai_failed_at/);
    expect(spy.prepared[0].bindings).toEqual(['conv-1', 'practice-1']);
  });

  it('returns both nulls when conversation not found', async () => {
    const spy = createSqlSpy();
    spy.setFirstResult(null);
    const service = new ConversationService(spy.env);

    const result = await service.getIntakeModeSignals('missing-conv', 'practice-1');

    expect(result).toEqual({
      intake_mode_activated_at: null,
      ai_failed_at: null,
    });
  });

  it('returns both nulls when row exists but both columns are null', async () => {
    const spy = createSqlSpy();
    spy.setFirstResult({
      intake_mode_activated_at: null,
      ai_failed_at: null,
    });
    const service = new ConversationService(spy.env);

    expect(await service.getIntakeModeSignals('conv-1', 'practice-1')).toEqual({
      intake_mode_activated_at: null,
      ai_failed_at: null,
    });
  });

  it('surfaces ai_failed_at when set (U6 short-circuit signal)', async () => {
    const spy = createSqlSpy();
    spy.setFirstResult({
      intake_mode_activated_at: '2026-05-18T10:00:00.000Z',
      ai_failed_at: '2026-05-18T10:05:00.000Z',
    });
    const service = new ConversationService(spy.env);

    const result = await service.getIntakeModeSignals('conv-1', 'practice-1');

    expect(result.ai_failed_at).toBe('2026-05-18T10:05:00.000Z');
    expect(result.intake_mode_activated_at).toBe('2026-05-18T10:00:00.000Z');
  });
});
