/* global WebSocketPair, WebSocket */
import type {
  DurableObjectState,
  SqlStorageValue,
  WebSocket as WorkerWebSocket,
} from '@cloudflare/workers-types';
import type { Env } from '../types.js';
import { dispatchToolCall, isOk, listTools } from '../routes/mcp/tools/dispatch.js';

/**
 * McpSession — one Durable Object per authorized MCP session.
 *
 * Cloudflare DO hibernation works with WebSockets (`acceptWebSocket`) but
 * NOT with long-lived SSE — SSE keeps a request handler open and pins the
 * DO in memory. The plan deliberately uses WebSocket for the server->client
 * push channel and Streamable-HTTP request/response (POST /api/mcp) for
 * client->server. MCP `2025-11-25` permits both transports.
 *
 * SQLite storage holds the 7-day event replay buffer. Per-session scope keeps
 * replay queries fast and avoids global D1 write contention under
 * Stripe-webhook bursts. U8 wires the Backend->Worker internal events
 * route to call this DO's `/internal/event` POST handler.
 *
 * This file is U6 scaffolding. Tools land in U9-U11; auth in U7; real event
 * fan-out in U8.
 *
 * See docs/plans/2026-05-15-002-feat-blawby-mcp-agent-surface-plan.md.
 */

export const SUPPORTED_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18'] as const;
export type McpProtocolVersion = (typeof SUPPORTED_PROTOCOL_VERSIONS)[number];

const SERVER_INFO = {
  name: 'blawby-mcp',
  version: '0.1.0-scaffold',
} as const;

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const REPLAY_BUFFER_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_REPLAY_PAGE = 1000;
const MAX_FRAME_BYTES = 64 * 1024;

interface SessionMetadata {
  session_id: string;
  practice_id: string;
  user_id: string;
  jti: string;
  scopes: string[];
  protocol_version: McpProtocolVersion;
  client_name: string | null;
  created_at: string;
}

interface SocketAttachment {
  session_id: string;
  last_activity_at: number;
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification;

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface ReplayEventRow extends Record<string, SqlStorageValue> {
  event_id: number;
  event_type: string;
  payload: string;
  created_at: number;
}

const STORAGE_KEY_METADATA = 'session:metadata';

const isJsonRpcMessage = (value: unknown): value is JsonRpcMessage => {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return record.jsonrpc === '2.0' && typeof record.method === 'string';
};

const isJsonRpcRequest = (value: JsonRpcMessage): value is JsonRpcRequest => {
  return 'id' in value && value.id !== undefined;
};

export class McpSession {
  private readonly state: DurableObjectState;
  private readonly env: Env;
  private metadataCache: SessionMetadata | null = null;
  private schemaInitialized = false;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/initialize' && request.method === 'POST') {
      return this.handleInitialize(request);
    }

    if (url.pathname === '/rpc' && request.method === 'POST') {
      return this.handleRpc(request);
    }

    if (url.pathname === '/ws' && request.method === 'GET') {
      return this.handleWebSocketUpgrade(request);
    }

    if (url.pathname === '/terminate' && request.method === 'DELETE') {
      return this.handleTerminate();
    }

    if (url.pathname === '/internal/event' && request.method === 'POST') {
      return this.handleInternalEvent(request);
    }

    return new Response('Not found', { status: 404 });
  }

  private async handleInitialize(request: Request): Promise<Response> {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonRpcError(null, -32700, 'Parse error');
    }

    if (!isJsonRpcMessage(body) || body.method !== 'initialize' || !isJsonRpcRequest(body)) {
      return jsonRpcError(null, -32600, 'Expected JSON-RPC initialize request');
    }

    const params = (body.params ?? {}) as Record<string, unknown>;
    const requested = typeof params.protocolVersion === 'string' ? params.protocolVersion : '';
    const negotiated = negotiateProtocolVersion(requested);
    if (!negotiated) {
      return jsonRpcError(body.id, -32602, 'Unsupported protocol version', {
        supported: SUPPORTED_PROTOCOL_VERSIONS,
        requested,
      });
    }

    // U6 scaffolding: identity comes from headers planted by the route
    // handler (which in turn will be planted by U7's withMCPAuth). For now,
    // we accept whatever the route handler attached so the transport works
    // end-to-end in tests.
    const identity = readIdentityHeaders(request);
    if (!identity) {
      return jsonRpcError(body.id, -32001, 'Session identity headers missing', {
        hint: 'U7 wires Bearer JWT validation; until then route handler must set X-Mcp-Practice-Id, X-Mcp-User-Id, X-Mcp-Jti.',
      });
    }

    const clientInfo = isRecord(params.clientInfo) ? params.clientInfo : null;
    const clientName = typeof clientInfo?.name === 'string' ? clientInfo.name : null;

    const metadata: SessionMetadata = {
      session_id: this.state.id.toString(),
      practice_id: identity.practice_id,
      user_id: identity.user_id,
      jti: identity.jti,
      scopes: identity.scopes,
      protocol_version: negotiated,
      client_name: clientName,
      created_at: new Date().toISOString(),
    };

    await this.state.storage.put(STORAGE_KEY_METADATA, metadata);
    this.metadataCache = metadata;
    await this.ensureReplaySchema();

    const response: JsonRpcResponse = {
      jsonrpc: '2.0',
      id: body.id,
      result: {
        protocolVersion: negotiated,
        // U6 advertises no tools yet; U9-U11 fill these in.
        capabilities: {
          tools: { listChanged: false },
          // Server-side push events fan out via the WebSocket transport, not
          // the spec's `experimental` capability — U8 documents this.
        },
        serverInfo: SERVER_INFO,
      },
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Mcp-Session-Id': metadata.session_id,
        'Mcp-Protocol-Version': negotiated,
      },
    });
  }

  private async handleRpc(request: Request): Promise<Response> {
    const metadata = await this.getMetadata();
    if (!metadata) {
      return jsonRpcError(null, -32004, 'Session not initialized');
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonRpcError(null, -32700, 'Parse error');
    }

    if (!isJsonRpcMessage(body)) {
      return jsonRpcError(null, -32600, 'Invalid JSON-RPC message');
    }

    // Notifications carry no response.
    if (!isJsonRpcRequest(body)) {
      // `notifications/initialized` is the only one we expect during U6.
      // Anything else is silently dropped (per JSON-RPC spec).
      return new Response(null, { status: 202 });
    }

    switch (body.method) {
      case 'ping':
        return jsonRpcOk(body.id, {});
      case 'tools/list': {
        const outcome = listTools();
        return jsonRpcOk(body.id, outcome.result);
      }
      case 'tools/call': {
        const params = (body.params ?? {}) as Record<string, unknown>;
        const toolName = typeof params.name === 'string' ? params.name : '';
        const argsRaw = params.arguments;
        const args =
          argsRaw && typeof argsRaw === 'object' && !Array.isArray(argsRaw)
            ? (argsRaw as Record<string, unknown>)
            : {};
        if (!toolName) {
          return jsonRpcError(body.id, -32602, 'tools/call requires a `name` parameter');
        }
        const outcome = await dispatchToolCall(toolName, args, {
          session_id: metadata.session_id,
          practice_id: metadata.practice_id,
          user_id: metadata.user_id,
          jti: metadata.jti,
          scopes: new Set(metadata.scopes),
          env: this.env,
          tool_call_seq: body.id,
        });
        if (isOk(outcome)) {
          return jsonRpcOk(body.id, outcome.result);
        }
        return jsonRpcError(body.id, outcome.error.code, outcome.error.message, outcome.error.data);
      }
      default:
        return jsonRpcError(body.id, -32601, `Method not found: ${body.method}`);
    }
  }

  private async handleWebSocketUpgrade(request: Request): Promise<Response> {
    const metadata = await this.getMetadata();
    if (!metadata) {
      return new Response('Session not initialized', { status: 404 });
    }

    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0] as unknown as WorkerWebSocket;
    const server = pair[1] as unknown as WorkerWebSocket;

    const attachment: SocketAttachment = {
      session_id: metadata.session_id,
      last_activity_at: Date.now(),
    };
    server.serializeAttachment(attachment);

    // Replay any events newer than the cursor the client supplied via
    // Last-Event-ID. With no cursor, start fresh — live events only.
    // acceptWebSocket is deferred until after replay so the socket is
    // not visible to getWebSockets('mcp') during fan-out while we're
    // still writing buffered events to it.
    const cursorHeader = request.headers.get('Last-Event-ID');
    if (cursorHeader) {
      await this.replayBufferedEvents(server, cursorHeader);
    }
    this.state.acceptWebSocket(server as unknown as WebSocket, ['mcp']);
    await this.scheduleIdleAlarm();

    return new Response(null, { status: 101, webSocket: client as unknown as WebSocket });
  }

  private async handleTerminate(): Promise<Response> {
    await this.state.storage.deleteAll();
    for (const ws of this.state.getWebSockets()) {
      try {
        ws.close(1000, 'session_terminated');
      } catch {
        // Already closed — ignore.
      }
    }
    this.metadataCache = null;
    this.schemaInitialized = false;
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private async handleInternalEvent(request: Request): Promise<Response> {
    // U6 scaffolding: the route handler at /api/mcp/internal/events is the
    // entry point Backend will call. For now this DO handler accepts events
    // for the buffer but the Worker-side route still returns 501 until U8
    // wires the HMAC+bearer dual-factor auth and fan-out. Tests can exercise
    // this DO handler directly.
    const metadata = await this.getMetadata();
    if (!metadata) {
      return new Response('Session not initialized', { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response('Invalid JSON', { status: 400 });
    }

    if (!isRecord(body)) {
      return new Response('Invalid event payload', { status: 400 });
    }

    const eventIdRaw = body.event_id;
    const eventType = body.event_type;
    const payload = body.payload;

    if (typeof eventIdRaw !== 'number' || !Number.isInteger(eventIdRaw) || eventIdRaw <= 0) {
      return new Response('event_id must be a positive integer', { status: 400 });
    }
    if (typeof eventType !== 'string' || eventType.length === 0) {
      return new Response('event_type required', { status: 400 });
    }
    if (!isRecord(payload)) {
      return new Response('payload must be an object', { status: 400 });
    }

    await this.ensureReplaySchema();
    const payloadJson = JSON.stringify(payload);
    const now = Date.now();
    const existingRow = this.state.storage.sql
      .exec<{ event_id: number }>(
        `SELECT event_id FROM event_replay_buffer WHERE event_id = ? LIMIT 1`,
        eventIdRaw,
      )
      .toArray()[0];

    // INSERT OR IGNORE makes the buffer write idempotent. Backend's dispatcher
    // may re-POST a batch after a Worker 5xx, and the PK conflict drops
    // duplicates without surfacing an error.
    this.state.storage.sql.exec(
      `INSERT OR IGNORE INTO event_replay_buffer (event_id, event_type, payload, created_at)
       VALUES (?, ?, ?, ?)`,
      eventIdRaw,
      eventType,
      payloadJson,
      now,
    );

    // Fan out to any live WebSocket on this DO. The route table tags the
    // socket as 'mcp' on accept.
    const frame: Record<string, unknown> = {
      type: 'event',
      event_id: eventIdRaw,
      event_type: eventType,
      payload,
    };
    const encoded = JSON.stringify(frame);
    if (!existingRow && encoded.length <= MAX_FRAME_BYTES) {
      for (const ws of this.state.getWebSockets('mcp')) {
        try {
          ws.send(encoded);
        } catch {
          // Closed socket — hibernation reaper picks it up.
        }
      }
    }

    return new Response(JSON.stringify({ success: true, event_id: eventIdRaw }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async webSocketMessage(ws: WorkerWebSocket, message: string | ArrayBuffer): Promise<void> {
    // U6 scaffolding: the server->client WebSocket is push-only. Any inbound
    // message is unexpected for now; log and ignore.
    const attachment = this.getSocketAttachment(ws);
    if (!attachment) {
      try {
        ws.close(4400, 'invalid_payload');
      } catch {
        // ignore
      }
      return;
    }
    attachment.last_activity_at = Date.now();
    ws.serializeAttachment(attachment);
    void message; // U7+ may wire client-to-server frames; U6 ignores them.
    await this.scheduleIdleAlarm();
  }

  async webSocketClose(ws: WorkerWebSocket): Promise<void> {
    void ws;
    await this.scheduleIdleAlarm();
  }

  async webSocketError(ws: WorkerWebSocket): Promise<void> {
    void ws;
    await this.scheduleIdleAlarm();
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    for (const ws of this.state.getWebSockets()) {
      const attachment = this.getSocketAttachment(ws);
      if (!attachment) continue;
      if (now - attachment.last_activity_at > IDLE_TIMEOUT_MS) {
        try {
          ws.close(4410, 'idle_timeout');
        } catch {
          // ignore
        }
      }
    }
    // Opportunistic replay-buffer pruning. U8 will move this to a scheduled
    // cron, but doing a small sweep on each alarm keeps the buffer bounded
    // without a separate timer.
    await this.pruneReplayBuffer();
    await this.scheduleIdleAlarm();
  }

  private async ensureReplaySchema(): Promise<void> {
    if (this.schemaInitialized) return;
    this.state.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS event_replay_buffer (
        event_id INTEGER PRIMARY KEY,
        event_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);
    this.state.storage.sql.exec(`
      CREATE INDEX IF NOT EXISTS idx_event_buffer_created_at
      ON event_replay_buffer(created_at)
    `);
    this.schemaInitialized = true;
  }

  private async replayBufferedEvents(ws: WorkerWebSocket, cursorHeader: string): Promise<void> {
    const cursor = Number.parseInt(cursorHeader, 10);
    if (!Number.isFinite(cursor) || cursor < 0) return;
    await this.ensureReplaySchema();

    const cutoff = Date.now() - REPLAY_BUFFER_TTL_MS;
    const oldestOverallRow = this.state.storage.sql
      .exec<{ event_id: number; created_at: number }>(
        `SELECT event_id, created_at FROM event_replay_buffer ORDER BY event_id ASC LIMIT 1`,
      )
      .toArray()[0];
    const oldestRow = this.state.storage.sql
      .exec<{ event_id: number; created_at: number }>(
        `SELECT event_id, created_at FROM event_replay_buffer WHERE created_at >= ? ORDER BY event_id ASC LIMIT 1`,
        cutoff,
      )
      .toArray()[0];

    // If the client's cursor is older than the oldest buffered event AND that
    // oldest event predates the 7-day window's start, the gap is unrecoverable
    // — emit a single truncation marker before replaying.
    if (
      oldestOverallRow
      && oldestRow
      && cursor < oldestOverallRow.event_id
      && oldestOverallRow.created_at < cutoff
    ) {
      const skippedRow = this.state.storage.sql
        .exec<{ count: number }>(
          `SELECT COUNT(*) as count FROM event_replay_buffer WHERE event_id <= ? AND created_at >= ?`,
          oldestRow.event_id - 1,
          cutoff,
        )
        .toArray()[0];
      const truncationFrame = {
        type: 'events.truncated',
        skipped_count: (skippedRow?.count ?? 0) + Math.max(0, oldestRow.event_id - 1 - cursor),
        resume_from: oldestRow.event_id,
      };
      try {
        ws.send(JSON.stringify(truncationFrame));
      } catch {
        return;
      }
    }

    const rows = this.state.storage.sql
      .exec<ReplayEventRow>(
        `SELECT event_id, event_type, payload, created_at
         FROM event_replay_buffer
         WHERE event_id > ? AND created_at >= ?
         ORDER BY event_id ASC
         LIMIT ?`,
        cursor,
        cutoff,
        MAX_REPLAY_PAGE,
      )
      .toArray();

    for (const row of rows) {
      let payload: unknown;
      try {
        payload = JSON.parse(row.payload);
      } catch {
        continue;
      }
      const frame = {
        type: 'event',
        event_id: row.event_id,
        event_type: row.event_type,
        payload,
      };
      try {
        ws.send(JSON.stringify(frame));
      } catch {
        return;
      }
    }
  }

  private async pruneReplayBuffer(): Promise<void> {
    if (!this.schemaInitialized) return;
    const cutoff = Date.now() - REPLAY_BUFFER_TTL_MS;
    this.state.storage.sql.exec(
      `DELETE FROM event_replay_buffer WHERE created_at < ?`,
      cutoff,
    );
  }

  private async scheduleIdleAlarm(): Promise<void> {
    let next: number | null = null;
    for (const ws of this.state.getWebSockets()) {
      const attachment = this.getSocketAttachment(ws);
      if (!attachment) continue;
      const deadline = attachment.last_activity_at + IDLE_TIMEOUT_MS;
      if (next === null || deadline < next) next = deadline;
    }
    if (next === null) {
      await this.state.storage.deleteAlarm();
      return;
    }
    await this.state.storage.setAlarm(new Date(Math.max(next, Date.now())));
  }

  private async getMetadata(): Promise<SessionMetadata | null> {
    if (this.metadataCache) return this.metadataCache;
    const stored = await this.state.storage.get<SessionMetadata>(STORAGE_KEY_METADATA);
    if (!stored) return null;
    this.metadataCache = stored;
    return stored;
  }

  private getSocketAttachment(ws: WorkerWebSocket): SocketAttachment | null {
    const raw = ws.deserializeAttachment() as SocketAttachment | null;
    if (!raw || typeof raw.session_id !== 'string') return null;
    return raw;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const negotiateProtocolVersion = (requested: string): McpProtocolVersion | null => {
  if ((SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)) {
    return requested as McpProtocolVersion;
  }
  // Fallback: pin to the most recent supported version. MCP spec says
  // server may pick if the client's preferred version isn't supported.
  return SUPPORTED_PROTOCOL_VERSIONS[0];
};

interface IdentityHeaders {
  practice_id: string;
  user_id: string;
  jti: string;
  scopes: string[];
}

const readIdentityHeaders = (request: Request): IdentityHeaders | null => {
  const practiceId = request.headers.get('X-Mcp-Practice-Id');
  const userId = request.headers.get('X-Mcp-User-Id');
  const jti = request.headers.get('X-Mcp-Jti');
  const scopesRaw = request.headers.get('X-Mcp-Scopes');
  if (!practiceId || !userId || !jti) return null;
  const scopes = scopesRaw
    ? scopesRaw.split(',').map((s) => s.trim()).filter(Boolean)
    : [];
  return { practice_id: practiceId, user_id: userId, jti, scopes };
};

const jsonRpcOk = (id: string | number, result: unknown): Response => {
  const body: JsonRpcResponse = { jsonrpc: '2.0', id, result };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

const jsonRpcError = (
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown,
): Response => {
  const body: JsonRpcResponse = {
    jsonrpc: '2.0',
    id,
    error: { code, message, ...(data !== undefined ? { data } : {}) },
  };
  return new Response(JSON.stringify(body), {
    status: code === -32700 || code === -32600 ? 400 : 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
