-- Ensure source_event_id dedupe only when present

DROP INDEX IF EXISTS idx_notifications_user_source_event;
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_user_source_event
  ON notifications(user_id, source_event_id)
  WHERE source_event_id IS NOT NULL;
