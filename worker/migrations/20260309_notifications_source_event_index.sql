-- Ensure source_event_id dedupe only when present

-- Remove duplicates, keeping the most recent rowid per user/source_event_id.
DELETE FROM notifications
WHERE source_event_id IS NOT NULL
  AND rowid NOT IN (
    SELECT MAX(rowid)
    FROM notifications
    WHERE source_event_id IS NOT NULL
    GROUP BY user_id, source_event_id
  );

DROP INDEX IF EXISTS idx_notifications_user_source_event;
CREATE UNIQUE INDEX idx_notifications_user_source_event
  ON notifications(user_id, source_event_id)
  WHERE source_event_id IS NOT NULL;
