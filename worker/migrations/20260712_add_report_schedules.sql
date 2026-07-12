CREATE TABLE IF NOT EXISTS report_schedules (
  id TEXT PRIMARY KEY,
  practice_id TEXT NOT NULL,
  report_type TEXT NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  day_of_week INTEGER CHECK (day_of_week IS NULL OR day_of_week BETWEEN 0 AND 6),
  day_of_month INTEGER CHECK (day_of_month IS NULL OR day_of_month BETWEEN 1 AND 28),
  hour_utc INTEGER NOT NULL CHECK (hour_utc BETWEEN 0 AND 23),
  recipients_json TEXT NOT NULL DEFAULT '[]',
  filters_json TEXT NOT NULL DEFAULT '{}',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  next_delivery_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_report_schedules_practice_created
  ON report_schedules(practice_id, created_at ASC, id ASC);

CREATE INDEX IF NOT EXISTS idx_report_schedules_due
  ON report_schedules(active, next_delivery_at ASC);

CREATE TABLE IF NOT EXISTS search_pins (
  id TEXT PRIMARY KEY,
  practice_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_search_pins_practice_user_created
  ON search_pins(practice_id, user_id, created_at ASC, id ASC);
