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
-- Strategy:
-- 1. Try to get the earliest status_change event to 'closed' from session_audit_events
-- 2. If no audit event exists, use updated_at as fallback (preserves existing behavior)
-- Note: This assumes session_audit_events.payload contains status information
-- If the audit events don't track status changes, we fall back to updated_at
UPDATE conversations 
SET closed_at = COALESCE(
  (
    SELECT MIN(created_at)
    FROM session_audit_events
    WHERE session_audit_events.conversation_id = conversations.id
      AND session_audit_events.event_type = 'status_change'
      AND (
        json_extract(session_audit_events.payload, '$.status') = 'closed'
        OR json_extract(session_audit_events.payload, '$.toStatus') = 'closed'
      )
  ),
  -- Fallback: Use updated_at if conversation is currently closed
  CASE 
    WHEN status = 'closed' THEN updated_at
    ELSE NULL
  END
)
WHERE status = 'closed' AND closed_at IS NULL;

PRAGMA foreign_keys = ON;
