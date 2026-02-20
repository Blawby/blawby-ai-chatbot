-- Migration: Remove local matters ownership from worker D1
-- Date: 2026-04-01
-- Description:
--   - Drop local matters and matter_questions tables
--   - Rebuild conversations/files to remove FK dependency on matters
--   - Rebuild matter_events to include practice_id for direct scoping

PRAGMA foreign_keys = OFF;

BEGIN TRANSACTION;

DROP TRIGGER IF EXISTS matters_after_update_timestamp;

DROP INDEX IF EXISTS idx_matters_practice;
DROP INDEX IF EXISTS idx_matters_user;
DROP INDEX IF EXISTS idx_matters_status;
DROP INDEX IF EXISTS idx_matters_practice_matter_number_unique;

DROP INDEX IF EXISTS idx_matter_questions_practice;
DROP INDEX IF EXISTS idx_matter_questions_matter;

DROP INDEX IF EXISTS idx_matter_events_practice;
DROP INDEX IF EXISTS idx_matter_events_matter;

CREATE TABLE IF NOT EXISTS conversations_new (
  id TEXT PRIMARY KEY,
  practice_id TEXT NOT NULL,
  user_id TEXT,
  matter_id TEXT,
  participants JSON,
  user_info JSON,
  status TEXT DEFAULT 'active',
  assigned_to TEXT,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  tags TEXT,
  internal_notes TEXT,
  last_message_at DATETIME,
  first_response_at DATETIME,
  closed_at DATETIME,
  latest_seq INTEGER NOT NULL DEFAULT 0,
  membership_version INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO conversations_new (
  id,
  practice_id,
  user_id,
  matter_id,
  participants,
  user_info,
  status,
  assigned_to,
  priority,
  tags,
  internal_notes,
  last_message_at,
  first_response_at,
  closed_at,
  latest_seq,
  membership_version,
  created_at,
  updated_at
)
SELECT
  id,
  practice_id,
  user_id,
  matter_id,
  participants,
  user_info,
  status,
  assigned_to,
  priority,
  tags,
  internal_notes,
  last_message_at,
  first_response_at,
  closed_at,
  latest_seq,
  membership_version,
  created_at,
  updated_at
FROM conversations;

DROP TABLE conversations;
ALTER TABLE conversations_new RENAME TO conversations;

CREATE INDEX IF NOT EXISTS idx_conversations_practice ON conversations(practice_id, status);
CREATE INDEX IF NOT EXISTS idx_conversations_matter ON conversations(matter_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_closed_at ON conversations(practice_id, closed_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_assigned ON conversations(practice_id, assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_conversations_priority ON conversations(practice_id, priority, status);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON conversations(practice_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS files_new (
  id TEXT PRIMARY KEY,
  practice_id TEXT NOT NULL,
  user_id TEXT,
  matter_id TEXT,
  conversation_id TEXT,
  original_name TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT,
  checksum TEXT,
  description TEXT,
  tags JSON,
  access_level TEXT DEFAULT 'private',
  shared_with JSON,
  version INTEGER DEFAULT 1,
  parent_file_id TEXT,
  is_deleted BOOLEAN DEFAULT FALSE,
  uploaded_by_lawyer_id TEXT,
  metadata JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME
);

INSERT INTO files_new (
  id,
  practice_id,
  user_id,
  matter_id,
  conversation_id,
  original_name,
  file_name,
  file_path,
  file_type,
  file_size,
  mime_type,
  checksum,
  description,
  tags,
  access_level,
  shared_with,
  version,
  parent_file_id,
  is_deleted,
  uploaded_by_lawyer_id,
  metadata,
  created_at,
  updated_at,
  deleted_at
)
SELECT
  id,
  practice_id,
  user_id,
  matter_id,
  conversation_id,
  original_name,
  file_name,
  file_path,
  file_type,
  file_size,
  mime_type,
  checksum,
  description,
  tags,
  access_level,
  shared_with,
  version,
  parent_file_id,
  is_deleted,
  uploaded_by_lawyer_id,
  metadata,
  created_at,
  updated_at,
  deleted_at
FROM files;

DROP TABLE files;
ALTER TABLE files_new RENAME TO files;

CREATE INDEX IF NOT EXISTS idx_files_practice ON files(practice_id);
CREATE INDEX IF NOT EXISTS idx_files_user ON files(user_id);
CREATE INDEX IF NOT EXISTS idx_files_matter ON files(matter_id);
CREATE INDEX IF NOT EXISTS idx_files_conversation ON files(conversation_id);

CREATE TABLE IF NOT EXISTS matter_events_new (
  id TEXT PRIMARY KEY,
  practice_id TEXT NOT NULL,
  matter_id TEXT,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  event_date DATETIME NOT NULL,
  created_by_lawyer_id TEXT,
  billable_time REAL DEFAULT 0,
  billing_rate INTEGER,
  amount INTEGER,
  tags JSON,
  metadata JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO matter_events_new (
  id,
  practice_id,
  matter_id,
  event_type,
  title,
  description,
  event_date,
  created_by_lawyer_id,
  billable_time,
  billing_rate,
  amount,
  tags,
  metadata,
  created_at,
  updated_at
)
SELECT
  me.id,
  m.practice_id,
  me.matter_id,
  me.event_type,
  me.title,
  me.description,
  me.event_date,
  me.created_by_lawyer_id,
  me.billable_time,
  me.billing_rate,
  me.amount,
  me.tags,
  me.metadata,
  me.created_at,
  me.updated_at
FROM matter_events me
INNER JOIN matters m ON m.id = me.matter_id;

DROP TABLE matter_events;
ALTER TABLE matter_events_new RENAME TO matter_events;

CREATE INDEX IF NOT EXISTS idx_matter_events_practice ON matter_events(practice_id, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_matter_events_matter ON matter_events(matter_id, event_date DESC);

DROP TABLE IF EXISTS matter_questions;
DROP TABLE IF EXISTS matters;

COMMIT;

PRAGMA foreign_keys = ON;
