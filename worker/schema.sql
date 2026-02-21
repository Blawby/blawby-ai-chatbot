-- Blawby Conversation System Database Schema

-- Enable foreign key constraints
PRAGMA foreign_keys = ON;

-- Organizations table removed
-- All practice data is now managed by remote API (staging-api.blawby.com)
-- Conversation config for practices is stored in practice.metadata.conversationConfig
-- Workspaces use hardcoded defaults with no storage needed
-- Better Auth sessions are managed by staging API at /api/auth/get-session endpoint
--
-- ========================================
-- REFERENTIAL INTEGRITY STRATEGY
-- ========================================
-- practice_id columns are TEXT NOT NULL (no FK constraints) because practices are managed
-- by remote API. Application-layer validation is required:
--
-- 1. VALIDATION: All services MUST validate practice_id exists via RemoteApiService.validatePractice()
--    before INSERT/UPDATE operations. This prevents orphaned records.
--
-- 2. ORPHAN HANDLING: If a practice is deleted in remote API, local records become orphaned.
--    - Queries filter by practice_id, so orphaned records are effectively hidden
--    - No automatic cascade delete (remote API doesn't notify us)
--    - Consider periodic cleanup job to archive/delete orphaned records
--
-- 3. CONSISTENCY: All practice_id columns are NOT NULL for consistent practice scoping.
--    This ensures all records can be properly filtered by practice.
--
-- 4. MONITORING: Log warnings when practice validation fails during writes.
--    This helps detect data integrity issues early.
--
-- See: worker/services/RemoteApiService.validatePractice()
-- See: worker/services/ConversationService (validates before inserts)
--
-- NOTE: We do not store organization_id locally. practice_id is the sole external
-- reference for scoping, and any organization data should be derived via remote API
-- using the practice_id when needed.

-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  practice_id TEXT NOT NULL,
  user_id TEXT,
  matter_id TEXT, -- Optional remote matter reference
  participants JSON, -- Array of user IDs: ["userId1", "userId2"]
  user_info JSON,
  status TEXT DEFAULT 'active',
  assigned_to TEXT,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  tags TEXT, -- JSON array
  internal_notes TEXT,
  last_message_at DATETIME,
  first_response_at DATETIME,
  closed_at DATETIME,
  latest_seq INTEGER NOT NULL DEFAULT 0,
  membership_version INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- D1 migrations table (wrangler expects an id column)
CREATE TABLE IF NOT EXISTS d1_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Conversation participants table
CREATE TABLE IF NOT EXISTS conversation_participants (
  conversation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT,
  PRIMARY KEY (conversation_id, user_id)
);

-- Conversation read state table
CREATE TABLE IF NOT EXISTS conversation_read_state (
  conversation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  last_read_seq INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (conversation_id, user_id)
);

-- Contact form submissions table
CREATE TABLE IF NOT EXISTS contact_forms (
  id TEXT PRIMARY KEY,
  conversation_id TEXT,
  practice_id TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  email TEXT NOT NULL,
  matter_details TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- 'pending', 'contacted', 'closed'
  assigned_lawyer TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);



-- Counters table for atomic sequences per practice
CREATE TABLE IF NOT EXISTS counters (
  practice_id TEXT NOT NULL,
  name TEXT NOT NULL,
  next_value INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (practice_id, name)
);

-- Matter events table for matter activity logs
CREATE TABLE IF NOT EXISTS matter_events (
  id TEXT PRIMARY KEY,
  practice_id TEXT NOT NULL,
  matter_id TEXT,
  event_type TEXT NOT NULL, -- 'note', 'call', 'email', 'meeting', 'filing', 'payment', 'status_change'
  title TEXT NOT NULL,
  description TEXT,
  event_date DATETIME NOT NULL,
  created_by_lawyer_id TEXT,
  billable_time REAL DEFAULT 0, -- hours
  billing_rate INTEGER, -- in cents per hour
  amount INTEGER, -- in cents, for expenses/payments
  tags JSON, -- Array of tags
  metadata JSON, -- Additional structured data
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Files table (replaces uploaded_files) - general-purpose file management
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  practice_id TEXT NOT NULL,
  user_id TEXT,
  matter_id TEXT, -- Optional remote matter reference
  conversation_id TEXT, -- Optional: link to conversation
  original_name TEXT NOT NULL,
  file_name TEXT NOT NULL, -- Storage filename
  file_path TEXT, -- Full storage path
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT,
  checksum TEXT, -- For integrity verification
  description TEXT,
  tags JSON, -- Array of tags for categorization
  access_level TEXT DEFAULT 'private', -- 'public', 'private', 'organization', 'client'
  shared_with JSON, -- Array of user IDs who have access
  version INTEGER DEFAULT 1,
  parent_file_id TEXT, -- For versioning
  is_deleted BOOLEAN DEFAULT FALSE,
  uploaded_by_lawyer_id TEXT,
  metadata JSON, -- Additional file metadata
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME
);

-- AI feedback table for user quality ratings and intent tags
CREATE TABLE IF NOT EXISTS ai_feedback (
  id TEXT PRIMARY KEY,
  practice_id TEXT NOT NULL, -- Aligned with other tables: practice scoping required
  rating INTEGER, -- 1-5 scale
  thumbs_up BOOLEAN,
  comments TEXT,
  intent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);


-- ========================================
-- DEFAULT PRACTICE
-- ========================================
-- The critical public/default practice `blawby-ai` (ID: 01K0TNGNKTM4Q0AG0XF0A8ST0Q)
-- is managed by the remote API at staging-api.blawby.com
-- This practice MUST exist across all environments for public chat defaults.

-- Chat messages table for storing conversation messages
-- Note: chat_sessions table removed - Better Auth sessions managed by staging API
-- Note: session_id removed from chat_messages - messages linked to conversations only
-- Note: session_audit_events table now uses conversation_id instead of session_id
CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  practice_id TEXT NOT NULL,
  user_id TEXT,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  reply_to_message_id TEXT,
  metadata TEXT,
  token_count INTEGER,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  seq INTEGER NOT NULL,
  client_id TEXT NOT NULL,
  server_ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Sample data removed - organizations are managed by remote API

-- ========================================
-- AUTH TABLES REMOVED
-- ========================================
-- Auth tables (users, accounts, sessions, verifications) are now managed by remote API
-- Only chatbot-related tables remain below

-- Note: The users table has been removed - user management is handled by remote API
-- The organizations table has been removed - all organization data is managed by remote API
-- Chatbot tables use practice_id as TEXT reference only (no FK constraint)
-- Better Auth sessions are managed by staging API - no local session storage needed

-- Stripe subscription table removed - subscription management is handled by remote API
-- Payment history table removed - payment tracking is handled by remote API
-- Organization events table removed - organization event logging is handled by remote API

-- Auth tables (sessions, accounts, verifications) removed - managed by remote API

-- Create indexes for conversations
CREATE INDEX IF NOT EXISTS idx_conversations_practice ON conversations(practice_id, status);
CREATE INDEX IF NOT EXISTS idx_conversations_matter ON conversations(matter_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_closed_at ON conversations(practice_id, closed_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_assigned ON conversations(practice_id, assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_conversations_priority ON conversations(practice_id, priority, status);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON conversations(practice_id, last_message_at DESC);

-- Create indexes for chat_messages
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_practice ON chat_messages(practice_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user ON chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_reply_to ON chat_messages(reply_to_message_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_messages_conv_client ON chat_messages(conversation_id, client_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_messages_conv_seq ON chat_messages(conversation_id, seq);

-- Message reactions table for emoji reactions
CREATE TABLE IF NOT EXISTS chat_message_reactions (
  message_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  emoji TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_chat_message_reactions_message ON chat_message_reactions(message_id);

-- Session audit events table (now uses conversation_id instead of session_id)
-- Note: Table name kept as session_audit_events for backward compatibility
-- but it now tracks conversation events, not session events
CREATE TABLE IF NOT EXISTS session_audit_events (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  practice_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor_type TEXT,
  actor_id TEXT,
  payload TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for session_audit_events
CREATE INDEX IF NOT EXISTS idx_session_audit_events_conversation ON session_audit_events(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_session_audit_events_practice ON session_audit_events(practice_id, created_at);

-- Create indexes for files
CREATE INDEX IF NOT EXISTS idx_files_practice ON files(practice_id);
CREATE INDEX IF NOT EXISTS idx_files_user ON files(user_id);
CREATE INDEX IF NOT EXISTS idx_files_matter ON files(matter_id);
CREATE INDEX IF NOT EXISTS idx_files_conversation ON files(conversation_id);

-- Create indexes for contact_forms
CREATE INDEX IF NOT EXISTS idx_contact_forms_practice ON contact_forms(practice_id);
CREATE INDEX IF NOT EXISTS idx_contact_forms_conversation ON contact_forms(conversation_id);

-- Create indexes for matter_events
CREATE INDEX IF NOT EXISTS idx_matter_events_practice ON matter_events(practice_id, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_matter_events_matter ON matter_events(matter_id, event_date DESC);

-- Create indexes for ai_feedback
CREATE INDEX IF NOT EXISTS idx_ai_feedback_practice ON ai_feedback(practice_id);

-- ========================================
-- NOTIFICATIONS
-- ========================================
CREATE TABLE IF NOT EXISTS notification_destinations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'onesignal',
  onesignal_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  external_user_id TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen_at TEXT,
  disabled_at TEXT
);

CREATE TABLE IF NOT EXISTS notification_delivery_results (
  id TEXT PRIMARY KEY,
  notification_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL,
  error_message TEXT,
  external_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_destinations_provider_id ON notification_destinations(provider, onesignal_id);
CREATE INDEX IF NOT EXISTS idx_notification_destinations_user ON notification_destinations(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_delivery_user_created ON notification_delivery_results(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_delivery_notification ON notification_delivery_results(notification_id, created_at DESC);

-- Chat message integrity triggers
CREATE TRIGGER IF NOT EXISTS trg_chat_messages_require_seq_client
BEFORE INSERT ON chat_messages
FOR EACH ROW
WHEN NEW.seq IS NULL OR NEW.seq = 0 OR NEW.client_id IS NULL OR NEW.client_id = ''
BEGIN
  SELECT RAISE(ABORT, 'seq and client_id must be provided by application');
END;

CREATE TRIGGER IF NOT EXISTS trg_chat_messages_require_seq_client_update
BEFORE UPDATE ON chat_messages
FOR EACH ROW
WHEN NEW.seq IS NULL OR NEW.seq = 0 OR NEW.client_id IS NULL OR NEW.client_id = ''
BEGIN
  SELECT RAISE(ABORT, 'seq and client_id cannot be set to null or empty');
END;

CREATE TRIGGER IF NOT EXISTS trg_chat_message_reactions_updated_at
AFTER UPDATE ON chat_message_reactions
FOR EACH ROW
WHEN OLD.updated_at = NEW.updated_at
BEGIN
  UPDATE chat_message_reactions
  SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE message_id = NEW.message_id AND user_id = NEW.user_id AND emoji = NEW.emoji;
END;

-- Auth views removed - user management is handled by remote API

-- ========================================
-- TRIGGERS FOR AUTOMATIC UPDATED_AT TIMESTAMPS
-- ========================================
-- These triggers ensure that updated_at columns are automatically updated
-- when rows are modified, using the same millisecond timestamp format
-- as the auth schema defaults: (strftime('%s', 'now') * 1000)

-- Auth table triggers removed - user management is handled by remote API

-- Organizations table trigger removed - organizations table no longer exists (managed by remote API)

-- Subscription table trigger removed - subscription management is handled by remote API
