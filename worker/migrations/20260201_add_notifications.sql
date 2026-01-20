-- Add notifications + OneSignal destinations

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  practice_id TEXT,
  category TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  sender_name TEXT,
  sender_avatar_url TEXT,
  severity TEXT,
  metadata TEXT,
  payload TEXT,
  dedupe_key TEXT,
  source_event_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  read_at TEXT
);

CREATE TABLE IF NOT EXISTS notification_destinations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'onesignal',
  onesignal_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  external_user_id TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen_at TEXT,
  disabled_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_user_dedupe
  ON notifications(user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_user_source_event
  ON notifications(user_id, source_event_id)
  WHERE source_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_category ON notifications(user_id, category, read_at, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_destinations_provider_id ON notification_destinations(provider, onesignal_id);
CREATE INDEX IF NOT EXISTS idx_notification_destinations_user ON notification_destinations(user_id, updated_at DESC);
