CREATE TABLE IF NOT EXISTS notification_delivery_results (
  id TEXT PRIMARY KEY,
  notification_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL,
  error_message TEXT,
  external_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_notification_delivery_user_created
  ON notification_delivery_results(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_delivery_notification
  ON notification_delivery_results(notification_id, created_at DESC);
