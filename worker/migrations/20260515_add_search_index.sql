-- Global search foundation (issue #571).
--
-- Background:
--   Storage layer for the Cmd/Ctrl+K global search palette. The FTS5 virtual
--   table is the keyword index. SQLite FTS5 cannot expose ordinary indexes on
--   UNINDEXED columns, so a sidecar table mirrors the foreign keys we need to
--   filter and cascade-delete by (practice, client, matter, file). The query
--   log feeds ranking heuristics and the M7 nightly purge cron.
--
--   M1 lands schema only — producers, consumers, routes, and UI ship in M2+.
--   All three CREATE statements are idempotent so re-running this migration
--   against an already-migrated database is a no-op.

CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
  entity_type,
  entity_id,
  practice_id UNINDEXED,
  title,
  subtitle,
  body,
  metadata UNINDEXED,
  tokenize = 'porter unicode61'
);

CREATE TABLE IF NOT EXISTS search_index_refs (
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  practice_id TEXT NOT NULL,
  client_id TEXT,
  matter_id TEXT,
  file_id TEXT,
  fts_rowid INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_search_practice
  ON search_index_refs(practice_id, entity_type);

CREATE INDEX IF NOT EXISTS idx_search_refs_client
  ON search_index_refs(client_id) WHERE client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_search_refs_matter
  ON search_index_refs(matter_id) WHERE matter_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_search_refs_file
  ON search_index_refs(file_id) WHERE file_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS search_query_log (
  id TEXT PRIMARY KEY,
  practice_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  query TEXT NOT NULL,
  scopes_json TEXT NOT NULL DEFAULT '[]',
  filters_json TEXT NOT NULL DEFAULT '{}',
  result_count INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_query_log_practice_ts
  ON search_query_log(practice_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_query_log_user_ts
  ON search_query_log(user_id, created_at DESC);
