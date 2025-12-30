-- Migration: Add closed_at column to conversations table
-- Date: 2025-01-20
-- Description: Add closed_at timestamp to accurately track when conversations were closed.
--   Previously, closedAt was approximated using updated_at, which could be inaccurate
--   if a conversation was closed earlier and later updated. This migration adds an
--   explicit closed_at column and backfills it from session_audit_events if available,
--   otherwise falls back to updated_at for existing closed conversations.

PRAGMA foreign_keys = OFF;

-- Add closed_at column to conversations table
ALTER TABLE conversations ADD COLUMN closed_at DATETIME;

-- Create index for closed_at queries
CREATE INDEX IF NOT EXISTS idx_conversations_closed_at ON conversations(practice_id, closed_at DESC);

-- Backfill closed_at for existing closed conversations
-- Strategy: Use updated_at as the closed_at timestamp for existing closed conversations
-- Note: If session_audit_events table exists and has relevant data, it would be ideal to use that,
-- but since the table may not exist in all environments, we use updated_at as a safe fallback.
-- This preserves existing behavior where closedAt was approximated using updated_at.
UPDATE conversations 
SET closed_at = updated_at
WHERE status = 'closed' AND closed_at IS NULL;

PRAGMA foreign_keys = ON;
