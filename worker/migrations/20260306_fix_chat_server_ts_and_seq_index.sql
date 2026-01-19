-- Fix server_ts backfill and enforce unique sequence per conversation

BEGIN TRANSACTION;

-- If this fails, check for duplicate (conversation_id, seq) pairs before retrying.
CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_messages_conv_seq ON chat_messages(conversation_id, seq);
DROP INDEX IF EXISTS ix_chat_messages_conv_seq;

-- server_ts is stored as TEXT; empty string is a sentinel for backfill.
UPDATE chat_messages
SET server_ts = created_at
WHERE server_ts IS NULL OR server_ts = '' OR server_ts > created_at;

COMMIT;
