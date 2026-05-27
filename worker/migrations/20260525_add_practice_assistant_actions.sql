CREATE TABLE IF NOT EXISTS practice_assistant_actions (
  id TEXT PRIMARY KEY,
  practice_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  tool_use_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'failed')),
  approval_summary_json TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  result_json TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  approved_at TEXT,
  rejected_at TEXT,
  executed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_practice_assistant_actions_practice_status
ON practice_assistant_actions(practice_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_practice_assistant_actions_conversation
ON practice_assistant_actions(conversation_id, created_at DESC);
