-- Add last_message_content to conversations for materialized previews
ALTER TABLE conversations ADD COLUMN last_message_content TEXT;

-- Backfill existing conversations with the latest non-system message
UPDATE conversations
SET last_message_content = (
  SELECT content 
  FROM chat_messages 
  WHERE conversation_id = conversations.id 
    AND role != 'system' 
    AND TRIM(COALESCE(content, '')) <> '' 
  ORDER BY seq DESC 
  LIMIT 1
);
