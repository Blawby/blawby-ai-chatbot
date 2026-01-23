-- Add updated_at trigger for chat message reactions

CREATE TRIGGER IF NOT EXISTS trg_chat_message_reactions_updated_at
AFTER UPDATE ON chat_message_reactions
FOR EACH ROW
BEGIN
  UPDATE chat_message_reactions
  SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE message_id = NEW.message_id AND user_id = NEW.user_id AND emoji = NEW.emoji;
END;
