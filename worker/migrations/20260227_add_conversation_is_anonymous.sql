ALTER TABLE conversations ADD COLUMN is_anonymous INTEGER NOT NULL DEFAULT 0;

UPDATE conversations
SET is_anonymous = CASE WHEN user_id IS NULL THEN 1 ELSE 0 END
WHERE is_anonymous IS NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_practice_anonymous_updated
  ON conversations(practice_id, is_anonymous, updated_at DESC);
