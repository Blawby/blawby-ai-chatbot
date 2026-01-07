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

-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  practice_id TEXT NOT NULL,
  user_id TEXT,
  matter_id TEXT, -- Optional: link to specific matter for tighter integration
  participants JSON, -- Array of user IDs: ["userId1", "userId2"]
  user_info JSON,
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

-- Matters table to represent legal matters
CREATE TABLE IF NOT EXISTS matters (
  id TEXT PRIMARY KEY,
  practice_id TEXT NOT NULL,
  organization_id TEXT,
  user_id TEXT,
  client_name TEXT NOT NULL,
  client_email TEXT,
  client_phone TEXT,
  matter_type TEXT NOT NULL, -- e.g., 'Family Law', 'Employment Law', etc.
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'lead', -- 'lead', 'open', 'in_progress', 'completed', 'archived'
  priority TEXT NOT NULL DEFAULT 'normal', -- 'low', 'normal', 'high' - maps from urgency
  assigned_lawyer_id TEXT,
  lead_source TEXT, -- 'website', 'referral', 'advertising', etc.
  estimated_value INTEGER, -- in cents
  billable_hours REAL DEFAULT 0,
  flat_fee INTEGER, -- in cents, if applicable
  retainer_amount INTEGER, -- in cents
  retainer_balance INTEGER DEFAULT 0, -- in cents
  statute_of_limitations DATE,
  court_jurisdiction TEXT,
  opposing_party TEXT,
  matter_number TEXT, -- Changed from case_number to matter_number
  tags JSON, -- Array of tags for categorization
  custom_fields JSON, -- Flexible metadata storage
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  closed_at DATETIME
);

-- Matter events table for matter activity logs
CREATE TABLE IF NOT EXISTS matter_events (
  id TEXT PRIMARY KEY,
  matter_id TEXT NOT NULL,
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
  matter_id TEXT, -- Optional: link to specific matter
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

-- Matter questions table for Q&A pairs from intake
CREATE TABLE IF NOT EXISTS matter_questions (
  id TEXT PRIMARY KEY,
  matter_id TEXT,
  practice_id TEXT NOT NULL, -- Aligned with other tables: practice scoping required
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  source TEXT DEFAULT 'ai-form', -- 'ai-form' | 'human-entry' | 'followup'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
  metadata TEXT,
  token_count INTEGER,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
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

-- Create indexes for chat_messages
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_practice ON chat_messages(practice_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user ON chat_messages(user_id);

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

-- Create indexes for matters
CREATE INDEX IF NOT EXISTS idx_matters_practice ON matters(practice_id);
CREATE INDEX IF NOT EXISTS idx_matters_user ON matters(user_id);
CREATE INDEX IF NOT EXISTS idx_matters_status ON matters(status);

-- Create indexes for files
CREATE INDEX IF NOT EXISTS idx_files_practice ON files(practice_id);
CREATE INDEX IF NOT EXISTS idx_files_user ON files(user_id);
CREATE INDEX IF NOT EXISTS idx_files_matter ON files(matter_id);
CREATE INDEX IF NOT EXISTS idx_files_conversation ON files(conversation_id);

-- Create indexes for contact_forms
CREATE INDEX IF NOT EXISTS idx_contact_forms_practice ON contact_forms(practice_id);
CREATE INDEX IF NOT EXISTS idx_contact_forms_conversation ON contact_forms(conversation_id);

-- Create indexes for matter_questions
CREATE INDEX IF NOT EXISTS idx_matter_questions_practice ON matter_questions(practice_id);
CREATE INDEX IF NOT EXISTS idx_matter_questions_matter ON matter_questions(matter_id);

-- Create indexes for ai_feedback
CREATE INDEX IF NOT EXISTS idx_ai_feedback_practice ON ai_feedback(practice_id);

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
