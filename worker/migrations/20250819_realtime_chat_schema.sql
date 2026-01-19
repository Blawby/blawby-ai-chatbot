-- Add realtime chat sequencing + membership tables

BEGIN TRANSACTION;

ALTER TABLE conversations ADD COLUMN latest_seq INTEGER NOT NULL DEFAULT 0;
ALTER TABLE conversations ADD COLUMN membership_version INTEGER NOT NULL DEFAULT 0;

ALTER TABLE chat_messages ADD COLUMN seq INTEGER NOT NULL DEFAULT 0;
ALTER TABLE chat_messages ADD COLUMN client_id TEXT NOT NULL DEFAULT '';
ALTER TABLE chat_messages ADD COLUMN server_ts TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS conversation_read_state (
  conversation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  last_read_seq INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS conversation_participants (
  conversation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT,
  PRIMARY KEY (conversation_id, user_id)
);

INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id, role)
SELECT conversations.id, json_each.value, 'member'
FROM conversations, json_each(conversations.participants)
WHERE conversations.participants IS NOT NULL;

-- server_ts is stored as TEXT; empty string is a sentinel for backfill.
UPDATE chat_messages
SET server_ts = created_at
WHERE server_ts IS NULL OR server_ts = '';

UPDATE chat_messages
SET client_id = (
  lower(hex(randomblob(4))) || '-' ||
  lower(hex(randomblob(2))) || '-' ||
  lower(hex(randomblob(2))) || '-' ||
  lower(hex(randomblob(2))) || '-' ||
  lower(hex(randomblob(6)))
)
WHERE client_id IS NULL OR client_id = '';

WITH ordered AS (
  SELECT
    id,
    row_number() OVER (PARTITION BY conversation_id ORDER BY created_at ASC, id ASC) AS seq_value
  FROM chat_messages
)
UPDATE chat_messages
SET seq = (SELECT seq_value FROM ordered WHERE ordered.id = chat_messages.id)
WHERE id IN (SELECT id FROM ordered);

UPDATE conversations
SET latest_seq = COALESCE(
  (SELECT MAX(seq) FROM chat_messages WHERE chat_messages.conversation_id = conversations.id),
  0
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_messages_conv_client ON chat_messages(conversation_id, client_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_messages_conv_seq ON chat_messages(conversation_id, seq);

CREATE TRIGGER IF NOT EXISTS trg_chat_messages_require_seq_client
BEFORE INSERT ON chat_messages
FOR EACH ROW
WHEN NEW.seq = 0 OR NEW.client_id = ''
BEGIN
  SELECT RAISE(ABORT, 'seq and client_id must be provided by application');
END;

COMMIT;
