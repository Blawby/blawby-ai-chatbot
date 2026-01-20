-- Backfill missing notifications columns introduced after initial rollout

ALTER TABLE notifications ADD COLUMN payload TEXT;
ALTER TABLE notifications ADD COLUMN source_event_id TEXT;
