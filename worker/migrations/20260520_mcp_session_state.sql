-- MCP session metadata in D1, queryable from any isolate.
-- One row per active Claude Desktop / MCP client session.
--
-- The per-session event replay buffer (7-day window) lives inside each
-- McpSession Durable Object's SQLite storage instead of D1. That keeps
-- replay queries scoped to the session and avoids global D1 write
-- contention under Stripe-webhook bursts. See U8 of
-- docs/plans/2026-05-15-002-feat-blawby-mcp-agent-surface-plan.md.
--
-- This table is the cross-isolate lookup surface only:
--   * fan-out: practice_id -> list of sessions whose granted_scopes cover an event class
--   * revocation: jti -> session_id (drop matching row, increment epoch)
--   * settings UI: practice_id + user_id -> list active sessions
CREATE TABLE IF NOT EXISTS mcp_sessions (
  session_id TEXT PRIMARY KEY,
  practice_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  jti TEXT NOT NULL,
  scopes_json TEXT NOT NULL,
  protocol_version TEXT NOT NULL,
  client_name TEXT,
  last_event_id INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_mcp_sessions_practice_last_seen
  ON mcp_sessions(practice_id, last_seen DESC);

CREATE INDEX IF NOT EXISTS idx_mcp_sessions_user_practice
  ON mcp_sessions(user_id, practice_id);

CREATE INDEX IF NOT EXISTS idx_mcp_sessions_jti
  ON mcp_sessions(jti);
