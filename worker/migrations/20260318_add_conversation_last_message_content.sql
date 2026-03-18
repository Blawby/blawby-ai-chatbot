-- Add last_message_content to conversations for materialized previews
ALTER TABLE conversations ADD COLUMN last_message_content TEXT;

-- Backfill existing conversations with the latest non-system message
-- Add an index on (conversation_id, seq) to make the preview lookup efficient
CREATE INDEX IF NOT EXISTS idx_chat_messages_prev_lookup ON chat_messages(conversation_id, seq);

-- Backfill existing conversations with the latest non-system message, batched to avoid long locks (deterministic chunks)
UPDATE conversations
SET last_message_content = COALESCE((
  SELECT content 
  FROM chat_messages 
  WHERE conversation_id = conversations.id 
    AND role != 'system' 
    AND TRIM(COALESCE(content, '')) <> '' 
  ORDER BY seq DESC 
  LIMIT 1
), '')
WHERE id IN (
  SELECT id FROM conversations 
  WHERE last_message_content IS NULL 
  ORDER BY id 
  LIMIT 1000
);

UPDATE conversations
SET last_message_content = COALESCE((
  SELECT content 
  FROM chat_messages 
  WHERE conversation_id = conversations.id 
    AND role != 'system' 
    AND TRIM(COALESCE(content, '')) <> '' 
  ORDER BY seq DESC 
  LIMIT 1
), '')
WHERE id IN (
  SELECT id FROM conversations 
  WHERE last_message_content IS NULL 
  ORDER BY id 
  LIMIT 1000
);

UPDATE conversations
SET last_message_content = COALESCE((
  SELECT content 
  FROM chat_messages 
  WHERE conversation_id = conversations.id 
    AND role != 'system' 
    AND TRIM(COALESCE(content, '')) <> '' 
  ORDER BY seq DESC 
  LIMIT 1
), '')
WHERE id IN (
  SELECT id FROM conversations 
  WHERE last_message_content IS NULL 
  ORDER BY id 
  LIMIT 1000
);

UPDATE conversations
SET last_message_content = COALESCE((
  SELECT content 
  FROM chat_messages 
  WHERE conversation_id = conversations.id 
    AND role != 'system' 
    AND TRIM(COALESCE(content, '')) <> '' 
  ORDER BY seq DESC 
  LIMIT 1
), '')
WHERE id IN (
  SELECT id FROM conversations 
  WHERE last_message_content IS NULL 
  ORDER BY id 
  LIMIT 1000
);

UPDATE conversations
SET last_message_content = COALESCE((
  SELECT content 
  FROM chat_messages 
  WHERE conversation_id = conversations.id 
    AND role != 'system' 
    AND TRIM(COALESCE(content, '')) <> '' 
  ORDER BY seq DESC 
  LIMIT 1
), '')
WHERE id IN (
  SELECT id FROM conversations 
  WHERE last_message_content IS NULL 
  ORDER BY id 
  LIMIT 1000
);
