-- Backfill missing notifications columns introduced after initial rollout

ALTER TABLE notifications ADD COLUMN payload TEXT;
ALTER TABLE notifications ADD COLUMN source_event_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_user_source_event
  ON notifications(user_id, source_event_id);
