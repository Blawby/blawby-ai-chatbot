import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  DurableObjectState,
  WebSocket as WorkerWebSocket,
} from '@cloudflare/workers-types';
import type { Env } from '../../../../worker/types.js';

const mocks = vi.hoisted(() => ({
  dispatchToolCall: vi.fn(),
  listTools: vi.fn(() => ({ ok: true, result: { tools: [] } })),
}));

vi.mock('../../../../worker/routes/mcp/tools/dispatch.js', () => ({
  dispatchToolCall: mocks.dispatchToolCall,
  listTools: mocks.listTools,
  isOk: (outcome: { ok: boolean }) => outcome.ok === true,
}));

import {
  McpSession,
  negotiateProtocolVersion,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '../../../../worker/durable-objects/McpSession.js';

type ReplayRow = {
  event_id: number;
  event_type: string;
  payload: string;
  created_at: number;
};

class FakeSqlResult<T> {
  constructor(private readonly rows: T[]) {}

  toArray(): T[] {
    return this.rows;
  }
}

class FakeSqlStorage {
  rows: ReplayRow[] = [];

  exec<T>(sql: string, ...bindings: unknown[]): FakeSqlResult<T> {
    if (sql.includes('CREATE TABLE') || sql.includes('CREATE INDEX')) {
      return new FakeSqlResult<T>([]);
    }

    if (sql.includes('SELECT event_id FROM event_replay_buffer WHERE event_id = ? LIMIT 1')) {
      const eventId = bindings[0] as number;
      const row = this.rows.find((candidate) => candidate.event_id === eventId);
      return new FakeSqlResult<T>(row ? ([{ event_id: row.event_id }] as T[]) : []);
    }

    if (sql.includes('INSERT OR IGNORE INTO event_replay_buffer')) {
      const [eventId, eventType, payload, createdAt] = bindings as [number, string, string, number];
      if (!this.rows.some((row) => row.event_id === eventId)) {
        this.rows.push({
          event_id: eventId,
          event_type: eventType,
          payload,
          created_at: createdAt,
        });
        this.rows.sort((left, right) => left.event_id - right.event_id);
      }
      return new FakeSqlResult<T>([]);
    }

    if (sql.includes('SELECT event_id, created_at FROM event_replay_buffer ORDER BY event_id ASC LIMIT 1')) {
      const row = this.rows[0];
      return new FakeSqlResult<T>(row ? ([{ event_id: row.event_id, created_at: row.created_at }] as T[]) : []);
    }

    if (sql.includes('SELECT event_id, created_at FROM event_replay_buffer WHERE created_at >= ? ORDER BY event_id ASC LIMIT 1')) {
      const cutoff = bindings[0] as number;
      const row = this.rows.find((candidate) => candidate.created_at >= cutoff);
      return new FakeSqlResult<T>(row ? ([{ event_id: row.event_id, created_at: row.created_at }] as T[]) : []);
    }

    if (sql.includes('SELECT COUNT(*) as count FROM event_replay_buffer WHERE event_id <= ? AND created_at >= ?')) {
      const [eventId, cutoff] = bindings as [number, number];
      const count = this.rows.filter(
        (candidate) => candidate.event_id <= eventId && candidate.created_at >= cutoff,
      ).length;
      return new FakeSqlResult<T>([{ count } as T]);
    }

    if (sql.includes('SELECT event_id, event_type, payload, created_at')) {
      const [cursor, cutoff, limit] = bindings as [number, number, number];
      const rows = this.rows
        .filter((candidate) => candidate.event_id > cursor && candidate.created_at >= cutoff)
        .slice(0, limit) as T[];
      return new FakeSqlResult<T>(rows);
    }

    if (sql.includes('DELETE FROM event_replay_buffer WHERE created_at < ?')) {
      const cutoff = bindings[0] as number;
      this.rows = this.rows.filter((candidate) => candidate.created_at >= cutoff);
      return new FakeSqlResult<T>([]);
    }

    throw new Error(`Unhandled SQL in test double: ${sql}`);
  }

  clear(): void {
    this.rows = [];
  }
}

class FakeStorage {
  readonly values = new Map<string, unknown>();
  readonly sql = new FakeSqlStorage();
  lastAlarm: Date | null = null;
  setAlarmCalls: Date[] = [];
  deleteAlarmCalls = 0;

  async put(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
  }

  async get<T>(key: string): Promise<T | null> {
    return (this.values.get(key) as T | undefined) ?? null;
  }

  async deleteAll(): Promise<void> {
    this.values.clear();
    this.sql.clear();
  }

  async setAlarm(at: Date): Promise<void> {
    this.lastAlarm = at;
    this.setAlarmCalls.push(at);
  }

  async deleteAlarm(): Promise<void> {
    this.lastAlarm = null;
    this.deleteAlarmCalls += 1;
  }
}

class FakeWebSocket {
  readonly sent: string[] = [];
  closed = false;
  closeArgs: { code?: number; reason?: string } = {};
  tags: string[] = [];
  private attachment: unknown = null;

  serializeAttachment(value: unknown): void {
    this.attachment = value;
  }

  deserializeAttachment(): unknown {
    return this.attachment;
  }

  send(message: string): void {
    if (this.closed) throw new Error('socket closed');
    this.sent.push(message);
  }

  close(code?: number, reason?: string): void {
    this.closed = true;
    this.closeArgs = { code, reason };
  }
}

class FakeState {
  readonly storage = new FakeStorage();
  readonly sockets: FakeWebSocket[] = [];
  readonly id = { toString: () => '12345678-1234-1234-1234-123456789abc' };

  acceptWebSocket(ws: WebSocket, tags?: string[]): void {
    const socket = ws as unknown as FakeWebSocket;
    socket.tags = tags ?? [];
    this.sockets.push(socket);
  }

  getWebSockets(tag?: string): WorkerWebSocket[] {
    return this.sockets
      .filter((socket) => !socket.closed)
      .filter((socket) => (tag ? socket.tags.includes(tag) : true)) as unknown as WorkerWebSocket[];
  }
}

const buildInitializeRequest = (
  overrides: {
    protocolVersion?: string;
    headers?: Record<string, string>;
    body?: string;
  } = {},
): Request => {
  const body = overrides.body ?? JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: overrides.protocolVersion ?? '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'Claude Desktop' },
    },
  });
  return new Request('https://mcp-do/initialize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Mcp-Practice-Id': 'practice-1',
      'X-Mcp-User-Id': 'user-1',
      'X-Mcp-Jti': 'jti-1',
      'X-Mcp-Scopes': 'intakes:read,events:subscribe',
      ...(overrides.headers ?? {}),
    },
    body,
  });
};

const buildRpcRequest = (body: string): Request =>
  new Request('https://mcp-do/rpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

const buildEventRequest = (body: string): Request =>
  new Request('https://mcp-do/internal/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

const initializeSession = async (session: McpSession): Promise<void> => {
  const response = await session.fetch(buildInitializeRequest());
  expect(response.status).toBe(200);
};

describe('negotiateProtocolVersion', () => {
  it('returns the requested version verbatim when supported', () => {
    expect(negotiateProtocolVersion('2025-11-25')).toBe('2025-11-25');
    expect(negotiateProtocolVersion('2025-06-18')).toBe('2025-06-18');
  });

  it('falls back to the newest supported version for unknown future versions', () => {
    expect(negotiateProtocolVersion('2099-01-01')).toBe(SUPPORTED_PROTOCOL_VERSIONS[0]);
  });

  it('falls back when the requested version string is empty', () => {
    expect(negotiateProtocolVersion('')).toBe(SUPPORTED_PROTOCOL_VERSIONS[0]);
  });
});

describe('SUPPORTED_PROTOCOL_VERSIONS', () => {
  it('lists 2025-11-25 first (newest) per plan key technical decision', () => {
    expect(SUPPORTED_PROTOCOL_VERSIONS[0]).toBe('2025-11-25');
    expect(SUPPORTED_PROTOCOL_VERSIONS).toContain('2025-06-18');
  });
});

describe('McpSession', () => {
  let state: FakeState;
  let session: McpSession;
  let originalPair: unknown;

  beforeEach(() => {
    mocks.dispatchToolCall.mockReset();
    mocks.listTools.mockReset();
    mocks.listTools.mockReturnValue({ ok: true, result: { tools: [] } });
    state = new FakeState();
    session = new McpSession(state as unknown as DurableObjectState, {} as Env);
    const wsGlobal = globalThis as unknown as { WebSocketPair?: unknown };
    originalPair = wsGlobal.WebSocketPair;
    wsGlobal.WebSocketPair = class {
      0: FakeWebSocket;
      1: FakeWebSocket;

      constructor() {
        this[0] = new FakeWebSocket();
        this[1] = new FakeWebSocket();
      }
    };
  });

  afterEach(() => {
    const wsGlobal = globalThis as unknown as { WebSocketPair?: unknown };
    wsGlobal.WebSocketPair = originalPair;
    vi.useRealTimers();
  });

  it('handleInitialize negotiates protocol, validates identity headers, and persists metadata', async () => {
    const response = await session.fetch(buildInitializeRequest({ protocolVersion: '2099-01-01' }));
    expect(response.status).toBe(200);
    expect(response.headers.get('Mcp-Protocol-Version')).toBe(SUPPORTED_PROTOCOL_VERSIONS[0]);
    expect(response.headers.get('Mcp-Session-Id')).toBe('12345678-1234-1234-1234-123456789abc');

    const body = await response.json() as { result: { protocolVersion: string } };
    expect(body.result.protocolVersion).toBe(SUPPORTED_PROTOCOL_VERSIONS[0]);

    const metadata = await state.storage.get<Record<string, unknown>>('session:metadata');
    expect(metadata).toMatchObject({
      session_id: '12345678-1234-1234-1234-123456789abc',
      practice_id: 'practice-1',
      user_id: 'user-1',
      jti: 'jti-1',
      protocol_version: SUPPORTED_PROTOCOL_VERSIONS[0],
      client_name: 'Claude Desktop',
    });
  });

  it('handleInitialize rejects malformed JSON and missing identity metadata', async () => {
    const malformed = await session.fetch(buildInitializeRequest({ body: '{' }));
    expect((await malformed.json() as { error: { code: number } }).error.code).toBe(-32700);

    const missingIdentity = await session.fetch(buildInitializeRequest({
      headers: { 'X-Mcp-Practice-Id': '', 'X-Mcp-User-Id': '', 'X-Mcp-Jti': '' },
    }));
    const missingBody = await missingIdentity.json() as { error: { code: number } };
    expect(missingBody.error.code).toBe(-32001);
  });

  it('handleRpc routes tools/call through dispatch and returns JSON-RPC errors for invalid requests', async () => {
    await initializeSession(session);
    mocks.dispatchToolCall.mockResolvedValueOnce({
      ok: true,
      result: { structuredContent: { ok: true } },
    });

    const okResponse = await session.fetch(buildRpcRequest(JSON.stringify({
      jsonrpc: '2.0',
      id: 'rpc-1',
      method: 'tools/call',
      params: { name: 'list_intakes', arguments: { limit: 3 } },
    })));
    const okBody = await okResponse.json() as { result: { structuredContent: { ok: boolean } } };
    expect(okBody.result.structuredContent.ok).toBe(true);
    expect(mocks.dispatchToolCall).toHaveBeenCalledWith(
      'list_intakes',
      { limit: 3 },
      expect.objectContaining({
        session_id: '12345678-1234-1234-1234-123456789abc',
        practice_id: 'practice-1',
        user_id: 'user-1',
        jti: 'jti-1',
        tool_call_seq: 'rpc-1',
      }),
    );

    const invalidRequest = await session.fetch(buildRpcRequest(JSON.stringify({ nope: true })));
    expect((await invalidRequest.json() as { error: { code: number } }).error.code).toBe(-32600);

    const malformed = await session.fetch(buildRpcRequest('{'));
    expect((await malformed.json() as { error: { code: number } }).error.code).toBe(-32700);
  });

  it('handleRpc returns session-not-initialized and method-not-found JSON-RPC errors', async () => {
    const beforeInit = await session.fetch(buildRpcRequest(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'ping',
    })));
    expect((await beforeInit.json() as { error: { code: number } }).error.code).toBe(-32004);

    await initializeSession(session);
    const methodMissing = await session.fetch(buildRpcRequest(JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'unknown/method',
    })));
    expect((await methodMissing.json() as { error: { code: number } }).error.code).toBe(-32601);
  });

  it('handleWebSocketUpgrade replays truncation + buffered events, attaches the socket, and schedules an alarm', async () => {
    vi.useFakeTimers();
    const now = new Date('2026-05-27T00:00:00.000Z');
    vi.setSystemTime(now);
    await initializeSession(session);

    state.storage.sql.rows = [
      {
        event_id: 5,
        event_type: 'old.event',
        payload: JSON.stringify({ old: true }),
        created_at: now.getTime() - (7 * 24 * 60 * 60 * 1000) - 1,
      },
      {
        event_id: 10,
        event_type: 'matter.updated',
        payload: JSON.stringify({ matter_id: 'mat_1' }),
        created_at: now.getTime(),
      },
    ];

    await expect(session.fetch(new Request('https://mcp-do/ws', {
      method: 'GET',
      headers: {
        Upgrade: 'websocket',
        'Last-Event-ID': '1',
      },
    }))).rejects.toThrow(/range of 200 to 599/);

    expect(state.sockets).toHaveLength(1);
    const serverSocket = state.sockets[0];
    expect(serverSocket.deserializeAttachment()).toMatchObject({
      session_id: '12345678-1234-1234-1234-123456789abc',
    });
    expect(serverSocket.sent).toHaveLength(2);
    expect(JSON.parse(serverSocket.sent[0])).toMatchObject({
      type: 'events.truncated',
      resume_from: 10,
    });
    expect(JSON.parse(serverSocket.sent[1])).toMatchObject({
      type: 'event',
      event_id: 10,
      event_type: 'matter.updated',
    });
    expect(state.storage.setAlarmCalls).toHaveLength(1);
  });

  it('handleWebSocketUpgrade supports multiple live sockets after initialization', async () => {
    await initializeSession(session);

    await expect(session.fetch(new Request('https://mcp-do/ws', {
      method: 'GET',
      headers: { Upgrade: 'websocket' },
    }))).rejects.toThrow(/range of 200 to 599/);
    await expect(session.fetch(new Request('https://mcp-do/ws', {
      method: 'GET',
      headers: { Upgrade: 'websocket' },
    }))).rejects.toThrow(/range of 200 to 599/);

    expect(state.sockets).toHaveLength(2);
    expect(state.getWebSockets('mcp')).toHaveLength(2);
  });

  it('handleInternalEvent inserts into the replay buffer, fans out once, and deduplicates duplicate events', async () => {
    await initializeSession(session);
    await expect(session.fetch(new Request('https://mcp-do/ws', {
      method: 'GET',
      headers: { Upgrade: 'websocket' },
    }))).rejects.toThrow(/range of 200 to 599/);
    await expect(session.fetch(new Request('https://mcp-do/ws', {
      method: 'GET',
      headers: { Upgrade: 'websocket' },
    }))).rejects.toThrow(/range of 200 to 599/);

    const requestBody = JSON.stringify({
      event_id: 11,
      event_type: 'matter.updated',
      payload: { matter_id: 'mat_11' },
    });
    const first = await session.fetch(buildEventRequest(requestBody));
    const duplicate = await session.fetch(buildEventRequest(requestBody));

    expect(first.status).toBe(200);
    expect(duplicate.status).toBe(200);
    expect(state.storage.sql.rows).toHaveLength(1);
    expect(state.sockets.map((socket) => socket.sent.length)).toEqual([1, 1]);
    expect(JSON.parse(state.sockets[0].sent[0])).toMatchObject({
      event_id: 11,
      event_type: 'matter.updated',
    });
  });

  it('handleInternalEvent returns 404 before initialization and 400 on malformed JSON', async () => {
    const beforeInit = await session.fetch(buildEventRequest(JSON.stringify({ event_id: 1 })));
    expect(beforeInit.status).toBe(404);

    await initializeSession(session);
    const malformed = await session.fetch(buildEventRequest('{'));
    expect(malformed.status).toBe(400);
  });

  it('alarm closes idle sockets and prunes expired replay rows', async () => {
    vi.useFakeTimers();
    const now = new Date('2026-05-27T00:00:00.000Z');
    vi.setSystemTime(now);
    await initializeSession(session);
    await expect(session.fetch(new Request('https://mcp-do/ws', {
      method: 'GET',
      headers: { Upgrade: 'websocket' },
    }))).rejects.toThrow(/range of 200 to 599/);

    state.storage.sql.rows.push(
      {
        event_id: 1,
        event_type: 'old.event',
        payload: JSON.stringify({ old: true }),
        created_at: now.getTime() - (7 * 24 * 60 * 60 * 1000) - 1,
      },
      {
        event_id: 2,
        event_type: 'fresh.event',
        payload: JSON.stringify({ fresh: true }),
        created_at: now.getTime(),
      },
    );

    vi.setSystemTime(now.getTime() + (31 * 60 * 1000));
    await session.alarm();

    expect(state.sockets[0].closed).toBe(true);
    expect(state.sockets[0].closeArgs).toEqual({ code: 4410, reason: 'idle_timeout' });
    expect(state.storage.sql.rows.map((row) => row.event_id)).toEqual([2]);
    expect(state.storage.deleteAlarmCalls).toBe(1);
  });
});

describe('negotiateProtocolVersion', () => {
  it('returns the requested version verbatim when supported', () => {
    expect(negotiateProtocolVersion('2025-11-25')).toBe('2025-11-25');
    expect(negotiateProtocolVersion('2025-06-18')).toBe('2025-06-18');
  });

  it('falls back to the newest supported version for unknown future versions', () => {
    // Per MCP spec the server may pick when the client advertises a version
    // the server doesn't support.
    expect(negotiateProtocolVersion('2099-01-01')).toBe(SUPPORTED_PROTOCOL_VERSIONS[0]);
  });

  it('falls back when the requested version string is empty', () => {
    expect(negotiateProtocolVersion('')).toBe(SUPPORTED_PROTOCOL_VERSIONS[0]);
  });
});

describe('SUPPORTED_PROTOCOL_VERSIONS', () => {
  it('lists 2025-11-25 first (newest) per plan key technical decision', () => {
    // Plan: support both 2025-06-18 and 2025-11-25; respond with the lower
    // of client-advertised and server-supported. Listing newest-first lets
    // the negotiation fallback default to the newest.
    expect(SUPPORTED_PROTOCOL_VERSIONS[0]).toBe('2025-11-25');
    expect(SUPPORTED_PROTOCOL_VERSIONS).toContain('2025-06-18');
  });
});
