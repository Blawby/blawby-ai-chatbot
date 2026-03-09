-- Restore conversations.is_anonymous after table rebuild migrations.
-- Required by ConversationService create/list paths.
ALTER TABLE conversations ADD COLUMN is_anonymous INTEGER NOT NULL DEFAULT 0;

UPDATE conversations
SET is_anonymous = COALESCE(
  (
    SELECT backup.is_anonymous
    FROM conversations_is_anonymous_backup AS backup
    WHERE backup.id = conversations.id
  ),
  0
)
WHERE EXISTS (
  SELECT 1
  FROM sqlite_master
  WHERE type = 'table' AND name = 'conversations_is_anonymous_backup'
);

DROP TABLE IF EXISTS conversations_is_anonymous_backup;

CREATE INDEX IF NOT EXISTS idx_conversations_practice_anonymous_updated
  ON conversations(practice_id, is_anonymous, updated_at DESC);
