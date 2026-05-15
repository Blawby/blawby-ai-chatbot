CREATE TABLE IF NOT EXISTS report_deliveries (
  id TEXT PRIMARY KEY,
  practice_id TEXT NOT NULL,
  report_type TEXT NOT NULL,
  filters_json TEXT NOT NULL DEFAULT '{}',
  recipients_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL,
  storage_key TEXT,
  byte_size INTEGER,
  error_message TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  scheduled_for TEXT,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_report_deliveries_practice_created
  ON report_deliveries(practice_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_report_deliveries_practice_status
  ON report_deliveries(practice_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_report_deliveries_practice_type
  ON report_deliveries(practice_id, report_type, created_at DESC);
