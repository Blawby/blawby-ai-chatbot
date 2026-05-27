import type { D1Database } from '@cloudflare/workers-types';
import type { Env } from '../types.js';
import {
  SUPPORTED_PROTOCOL_VERSIONS,
  type McpProtocolVersion,
} from '../durable-objects/McpSession.js';

/**
 * MCPSessionStore — D1-backed cross-isolate session lookup.
 *
 * The Durable Object owns live transport state (WebSocket, SQLite replay
 * buffer, cursor). This D1 table is for queries that need to happen
 * outside a specific DO context:
 *
 *   * Fan-out (U8): given a backend event for practice P, find every
 *     session whose granted scopes cover the event class.
 *   * Revocation (U7): given a jti to deny, find the session row and
 *     close it.
 *   * Settings UI (U5/web): list a user's active MCP sessions.
 *
 * U6 scaffolds the read/write surface so U7 and U8 can wire it without
 * inventing the schema late.
 */

export interface MCPSessionRecord {
  session_id: string;
  practice_id: string;
  user_id: string;
  jti: string;
  scopes: string[];
  protocol_version: McpProtocolVersion;
  client_name: string | null;
  last_event_id: number;
  created_at: string;
  last_seen: string;
}

interface MCPSessionRow {
  session_id: string;
  practice_id: string;
  user_id: string;
  jti: string;
  scopes_json: string;
  protocol_version: string;
  client_name: string | null;
  last_event_id: number;
  created_at: string;
  last_seen: string;
}

const isValidProtocolVersion = (value: string): value is McpProtocolVersion =>
  (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(value);

const rowToRecord = (row: MCPSessionRow): MCPSessionRecord => {
  if (!isValidProtocolVersion(row.protocol_version)) {
    throw new Error(`Invalid MCP protocol version in session row: ${row.protocol_version}`);
  }

  return {
    session_id: row.session_id,
    practice_id: row.practice_id,
    user_id: row.user_id,
    jti: row.jti,
    scopes: parseScopes(row.scopes_json),
    protocol_version: row.protocol_version,
    client_name: row.client_name,
    last_event_id: row.last_event_id,
    created_at: row.created_at,
    last_seen: row.last_seen,
  };
};

const parseScopes = (json: string): string[] => {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s): s is string => typeof s === 'string');
  } catch {
    return [];
  }
};

export class MCPSessionStore {
  private readonly db: D1Database;

  constructor(env: Env) {
    this.db = env.DB;
  }

  async upsert(record: Omit<MCPSessionRecord, 'created_at' | 'last_seen'>): Promise<void> {
    const scopesJson = JSON.stringify(record.scopes);
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `INSERT INTO mcp_sessions
          (session_id, practice_id, user_id, jti, scopes_json, protocol_version, client_name, last_event_id, created_at, last_seen)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(session_id) DO UPDATE SET
           practice_id = excluded.practice_id,
           user_id = excluded.user_id,
           jti = excluded.jti,
           scopes_json = excluded.scopes_json,
           protocol_version = excluded.protocol_version,
           client_name = excluded.client_name,
           last_event_id = excluded.last_event_id,
           last_seen = excluded.last_seen`,
      )
      .bind(
        record.session_id,
        record.practice_id,
        record.user_id,
        record.jti,
        scopesJson,
        record.protocol_version,
        record.client_name,
        record.last_event_id,
        now,
        now,
      )
      .run();
  }

  async touch(sessionId: string, lastEventId?: number): Promise<void> {
    const now = new Date().toISOString();
    if (typeof lastEventId === 'number') {
      await this.db
        .prepare(`UPDATE mcp_sessions SET last_seen = ?, last_event_id = ? WHERE session_id = ?`)
        .bind(now, lastEventId, sessionId)
        .run();
      return;
    }
    await this.db
      .prepare(`UPDATE mcp_sessions SET last_seen = ? WHERE session_id = ?`)
      .bind(now, sessionId)
      .run();
  }

  async getBySessionId(sessionId: string): Promise<MCPSessionRecord | null> {
    const row = await this.db
      .prepare(`SELECT * FROM mcp_sessions WHERE session_id = ?`)
      .bind(sessionId)
      .first<MCPSessionRow>();
    return row ? rowToRecord(row) : null;
  }

  async listByPractice(practiceId: string): Promise<MCPSessionRecord[]> {
    const result = await this.db
      .prepare(`SELECT * FROM mcp_sessions WHERE practice_id = ? ORDER BY last_seen DESC`)
      .bind(practiceId)
      .all<MCPSessionRow>();
    const rows = result.results ?? [];
    return rows.map(rowToRecord);
  }

  async listByUser(userId: string, practiceId: string): Promise<MCPSessionRecord[]> {
    const result = await this.db
      .prepare(
        `SELECT * FROM mcp_sessions WHERE user_id = ? AND practice_id = ? ORDER BY last_seen DESC`,
      )
      .bind(userId, practiceId)
      .all<MCPSessionRow>();
    const rows = result.results ?? [];
    return rows.map(rowToRecord);
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.db
      .prepare(`DELETE FROM mcp_sessions WHERE session_id = ?`)
      .bind(sessionId)
      .run();
  }

  async deleteByJti(jti: string): Promise<string[]> {
    const result = await this.db
      .prepare(`DELETE FROM mcp_sessions WHERE jti = ? RETURNING session_id`)
      .bind(jti)
      .all<{ session_id: string }>();
    return (result.results ?? []).map((r) => r.session_id);
  }
}
