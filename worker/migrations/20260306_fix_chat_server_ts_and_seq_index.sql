-- Fix server_ts backfill and enforce unique sequence per conversation

UPDATE chat_messages
SET server_ts = created_at
WHERE server_ts IS NULL OR server_ts = '' OR server_ts > created_at;

DROP INDEX IF EXISTS ix_chat_messages_conv_seq;
CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_messages_conv_seq ON chat_messages(conversation_id, seq);
