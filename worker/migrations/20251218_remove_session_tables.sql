-- Migration: Remove session tables and migrate to conversations
-- Date: 2025-12-18
-- Description: Remove chat_sessions table and migrate session_audit_events to use conversation_id
-- 
-- Changes:
-- 1. Drop chat_sessions table (no longer needed - using conversations instead)
-- 2. Create session_audit_events table with conversation_id (if it doesn't exist)
-- 3. Drop any indexes on chat_sessions
-- 4. Create indexes on session_audit_events for conversation_id lookups
--
-- Note: session_audit_events table is kept but now uses conversation_id instead of session_id
-- The table name remains session_audit_events for backward compatibility but it now tracks conversation events
-- Existing data in session_audit_events with session_id cannot be migrated automatically
-- New events will use conversation_id going forward

PRAGMA foreign_keys = OFF;

-- Drop chat_sessions table (no longer needed)
DROP TABLE IF EXISTS chat_sessions;

-- Drop any indexes on chat_sessions
DROP INDEX IF EXISTS idx_chat_sessions_org;
DROP INDEX IF EXISTS idx_chat_sessions_token;
DROP INDEX IF EXISTS idx_chat_sessions_user;
DROP INDEX IF EXISTS idx_chat_sessions_organization;

-- Create session_audit_events table if it doesn't exist (with conversation_id)
-- If the table already exists with session_id, it will need to be recreated
-- Note: This will fail if table exists with different schema - manual migration may be needed
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

-- Create indexes on session_audit_events for conversation_id lookups
CREATE INDEX IF NOT EXISTS idx_session_audit_events_conversation ON session_audit_events(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_session_audit_events_practice ON session_audit_events(practice_id, created_at);

PRAGMA foreign_keys = ON;
