-- Append-only per-turn intake event timeline.
-- See U4 of docs/plans/2026-05-18-002-feat-strengthen-intake-ai-observability-plan.md.
--
-- Every intake turn writes one row capturing the full diagnostic context:
-- mode resolution trace, user message, model request/response, tool calls/results,
-- and failure reason. Provenance tags every turn so engineers can distinguish
-- a normal AI intake from a safety rail, an AI failure, or a mode-resolution
-- defect.

CREATE TABLE IF NOT EXISTS intake_events (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  practice_id TEXT NOT NULL,
  -- Monotonic per-conversation sequence. UNIQUE constraint below is the race
  -- guard for concurrent writes within a conversation.
  turn_seq INTEGER NOT NULL,
  -- Closed enum at schema level: new provenance values require a migration,
  -- not a free-text addition (R8). Matches the report_deliveries.status pattern.
  provenance TEXT NOT NULL CHECK (provenance IN (
    'ai_intake',
    'ai_intake_no_tool_call',
    'safety_rail.legal_disclaimer',
    'ai_failure',
    'submit_intake',
    'mode_unresolved'
  )),
  mode_resolution_json TEXT,
  user_message TEXT,
  model_request_json TEXT,
  model_response_json TEXT,
  tool_calls_json TEXT,
  tool_results_json TEXT,
  failure_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (conversation_id, turn_seq)
);

CREATE INDEX IF NOT EXISTS idx_intake_events_conversation_seq
  ON intake_events(conversation_id, turn_seq);

CREATE INDEX IF NOT EXISTS idx_intake_events_practice_created
  ON intake_events(practice_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_intake_events_provenance
  ON intake_events(provenance, created_at DESC);
