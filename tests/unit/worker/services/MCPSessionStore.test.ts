import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MCPSessionStore } from '../../../../worker/services/MCPSessionStore.js';
import type { Env } from '../../../../worker/types.js';

type PreparedCall = { sql: string; bindings: unknown[] };

interface SpyEnv {
  env: Env;
  prepared: PreparedCall[];
  setFirstResult: (row: Record<string, unknown> | null) => void;
  setAllResults: (rows: Array<Record<string, unknown>>) => void;
}

const createSpyEnv = (): SpyEnv => {
  const prepared: PreparedCall[] = [];
  const state = {
    firstResult: null as Record<string, unknown> | null,
    allResults: [] as Array<Record<string, unknown>>,
  };

  const first = vi.fn(() => Promise.resolve(state.firstResult));
  const all = vi.fn(() => Promise.resolve({ results: state.allResults }));
  const run = vi.fn(() => Promise.resolve({ meta: {} }));

  const bind = vi.fn((...args: unknown[]) => {
    prepared[prepared.length - 1].bindings = args;
    return { first, all, run };
  });

  const prepare = vi.fn((sql: string) => {
    prepared.push({ sql, bindings: [] });
    return { bind };
  });

  const env = { DB: { prepare } as unknown as Env['DB'] } as Env;

  return {
    env,
    prepared,
    setFirstResult: (row) => {
      state.firstResult = row;
    },
    setAllResults: (rows) => {
      state.allResults = rows;
    },
  };
};

describe('MCPSessionStore.upsert', () => {
  beforeEach(() => vi.resetAllMocks());

  it('persists scopes as JSON and timestamps both columns', async () => {
    const spy = createSpyEnv();
    const store = new MCPSessionStore(spy.env);
    await store.upsert({
      session_id: 'sess-1',
      practice_id: 'practice-1',
      user_id: 'user-1',
      jti: 'jti-1',
      scopes: ['intakes:read', 'events:subscribe'],
      protocol_version: '2025-11-25',
      client_name: 'Claude Desktop',
      last_event_id: 0,
    });
    expect(spy.prepared).toHaveLength(1);
    expect(spy.prepared[0].sql).toContain('INSERT INTO mcp_sessions');
    expect(spy.prepared[0].sql).toContain('ON CONFLICT(session_id) DO UPDATE');
    // scopes_json is the 5th bound parameter
    expect(spy.prepared[0].bindings[4]).toBe(
      JSON.stringify(['intakes:read', 'events:subscribe']),
    );
    // last 2 bindings are both ISO timestamps (created_at, last_seen)
    const created = spy.prepared[0].bindings[8];
    const lastSeen = spy.prepared[0].bindings[9];
    expect(typeof created).toBe('string');
    expect(created).toBe(lastSeen);
  });
});

describe('MCPSessionStore.touch', () => {
  beforeEach(() => vi.resetAllMocks());

  it('updates only last_seen when lastEventId is not provided', async () => {
    const spy = createSpyEnv();
    const store = new MCPSessionStore(spy.env);
    await store.touch('sess-1');
    expect(spy.prepared).toHaveLength(1);
    expect(spy.prepared[0].sql).toContain('UPDATE mcp_sessions SET last_seen = ?');
    expect(spy.prepared[0].sql).not.toContain('last_event_id');
  });

  it('updates last_seen + last_event_id when lastEventId is supplied', async () => {
    const spy = createSpyEnv();
    const store = new MCPSessionStore(spy.env);
    await store.touch('sess-1', 42);
    expect(spy.prepared[0].sql).toContain('last_event_id = ?');
    expect(spy.prepared[0].bindings[1]).toBe(42);
    expect(spy.prepared[0].bindings[2]).toBe('sess-1');
  });
});

describe('MCPSessionStore.getBySessionId', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns null when the row does not exist', async () => {
    const spy = createSpyEnv();
    spy.setFirstResult(null);
    const store = new MCPSessionStore(spy.env);
    const result = await store.getBySessionId('absent');
    expect(result).toBeNull();
  });

  it('parses scopes_json back into an array', async () => {
    const spy = createSpyEnv();
    spy.setFirstResult({
      session_id: 'sess-1',
      practice_id: 'practice-1',
      user_id: 'user-1',
      jti: 'jti-1',
      scopes_json: JSON.stringify(['matters:read', 'invoices:send']),
      protocol_version: '2025-11-25',
      client_name: 'Claude Desktop',
      last_event_id: 7,
      created_at: '2026-05-20T00:00:00.000Z',
      last_seen: '2026-05-20T01:00:00.000Z',
    });
    const store = new MCPSessionStore(spy.env);
    const result = await store.getBySessionId('sess-1');
    expect(result?.scopes).toEqual(['matters:read', 'invoices:send']);
    expect(result?.last_event_id).toBe(7);
  });

  it('returns an empty scope list when scopes_json is malformed', async () => {
    const spy = createSpyEnv();
    spy.setFirstResult({
      session_id: 'sess-1',
      practice_id: 'practice-1',
      user_id: 'user-1',
      jti: 'jti-1',
      scopes_json: '{not json',
      protocol_version: '2025-11-25',
      client_name: null,
      last_event_id: 0,
      created_at: '2026-05-20T00:00:00.000Z',
      last_seen: '2026-05-20T00:00:00.000Z',
    });
    const store = new MCPSessionStore(spy.env);
    const result = await store.getBySessionId('sess-1');
    expect(result?.scopes).toEqual([]);
  });

  it('returns null (and does not throw) when a row contains an unsupported protocol version', async () => {
    const spy = createSpyEnv();
    spy.setFirstResult({
      session_id: 'sess-1',
      practice_id: 'practice-1',
      user_id: 'user-1',
      jti: 'jti-1',
      scopes_json: JSON.stringify(['matters:read']),
      protocol_version: '2024-01-01',
      client_name: null,
      last_event_id: 0,
      created_at: '2026-05-20T00:00:00.000Z',
      last_seen: '2026-05-20T00:00:00.000Z',
    });
    const store = new MCPSessionStore(spy.env);
    const result = await store.getBySessionId('sess-1');
    expect(result).toBeNull();
  });
});

describe('MCPSessionStore.deleteByJti', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns the deleted session_ids in a single atomic DELETE ... RETURNING', async () => {
    const spy = createSpyEnv();
    spy.setAllResults([{ session_id: 's1' }, { session_id: 's2' }]);
    const store = new MCPSessionStore(spy.env);
    const result = await store.deleteByJti('jti-target');
    expect(result).toEqual(['s1', 's2']);
    expect(spy.prepared).toHaveLength(1);
    expect(spy.prepared[0].sql).toContain('DELETE FROM mcp_sessions');
    expect(spy.prepared[0].sql).toContain('RETURNING session_id');
  });

  it('returns an empty array when no rows match', async () => {
    const spy = createSpyEnv();
    spy.setAllResults([]);
    const store = new MCPSessionStore(spy.env);
    const result = await store.deleteByJti('jti-absent');
    expect(result).toEqual([]);
    expect(spy.prepared).toHaveLength(1);
    expect(spy.prepared[0].sql).toContain('DELETE FROM mcp_sessions');
  });
});

describe('MCPSessionStore.listByPractice', () => {
  beforeEach(() => vi.resetAllMocks());

  it('orders results by last_seen DESC', async () => {
    const spy = createSpyEnv();
    spy.setAllResults([]);
    const store = new MCPSessionStore(spy.env);
    await store.listByPractice('practice-1');
    expect(spy.prepared[0].sql).toContain('ORDER BY last_seen DESC');
    expect(spy.prepared[0].bindings).toEqual(['practice-1']);
  });
});
