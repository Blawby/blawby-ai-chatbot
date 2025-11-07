-- Conversations feature schema
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  matter_id TEXT,
  type TEXT NOT NULL CHECK (type IN ('ai','human','mixed')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','locked','archived')),
  title TEXT,
  created_by_user_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_message_at DATETIME,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (matter_id) REFERENCES matters(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_conversations_org_status
  ON conversations(organization_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_matter
  ON conversations(matter_id);

CREATE TABLE IF NOT EXISTS conversation_participants (
  conversation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('client','paralegal','attorney','admin','owner')),
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  left_at DATETIME,
  is_muted INTEGER DEFAULT 0,
  last_read_message_id TEXT,
  PRIMARY KEY (conversation_id, user_id),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_participants_user_org
  ON conversation_participants(user_id, organization_id);

CREATE INDEX IF NOT EXISTS idx_participants_conv
  ON conversation_participants(conversation_id);

CREATE TABLE IF NOT EXISTS conversation_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  sender_user_id TEXT,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT,
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text','system','file','matter_update')),
  reply_to_message_id TEXT,
  metadata TEXT,
  is_edited INTEGER DEFAULT 0,
  edited_at DATETIME,
  is_deleted INTEGER DEFAULT 0,
  deleted_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_conv_created
  ON conversation_messages(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_sender_org
  ON conversation_messages(sender_user_id, organization_id);

CREATE INDEX IF NOT EXISTS idx_messages_reply_to
  ON conversation_messages(reply_to_message_id);

CREATE TABLE IF NOT EXISTS conversation_files (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (message_id) REFERENCES conversation_messages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_files_conv
  ON conversation_files(conversation_id);

-- Existing table index enhancements
CREATE INDEX IF NOT EXISTS idx_files_org_session ON files(organization_id, session_id);
CREATE INDEX IF NOT EXISTS idx_files_conversation ON files(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_org_session_created
  ON chat_messages(organization_id, session_id, created_at);
