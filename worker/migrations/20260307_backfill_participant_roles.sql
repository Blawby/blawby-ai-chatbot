-- Backfill conversation participant roles and enforce chat message defaults

UPDATE conversation_participants
SET role = 'member'
WHERE role IS NULL;

CREATE TRIGGER IF NOT EXISTS trg_chat_messages_require_seq_client
BEFORE INSERT ON chat_messages
FOR EACH ROW
WHEN NEW.seq IS NULL OR NEW.client_id IS NULL OR NEW.client_id = ''
BEGIN
  SELECT RAISE(ABORT, 'seq and client_id must be provided by application');
END;
