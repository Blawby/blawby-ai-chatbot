-- Migration: Add inbox fields to conversations table
-- Date: 2025-12-02
-- Description: Add fields needed for team inbox functionality:
--   - assigned_to: User ID of practice member assigned to conversation
--   - priority: Conversation priority (low, normal, high, urgent)
--   - tags: JSON array of tags for filtering/categorization
--   - internal_notes: Internal notes for practice members (not visible to clients)
--   - last_message_at: Timestamp of last message (for sorting by recency)
--   - first_response_at: Timestamp of first practice member response (for SLA tracking)

PRAGMA foreign_keys = OFF;

-- Add inbox fields to conversations table
-- Note: assigned_to references user IDs managed by remote API (no local FK constraint possible)
ALTER TABLE conversations ADD COLUMN assigned_to TEXT;
-- Priority with CHECK constraint to enforce valid values
ALTER TABLE conversations ADD COLUMN priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent'));
-- Tags stored as JSON array - validation handled at application level for flexibility
ALTER TABLE conversations ADD COLUMN tags TEXT; -- JSON array
ALTER TABLE conversations ADD COLUMN internal_notes TEXT;
ALTER TABLE conversations ADD COLUMN last_message_at DATETIME;
ALTER TABLE conversations ADD COLUMN first_response_at DATETIME;

-- Create indexes for inbox queries
CREATE INDEX IF NOT EXISTS idx_conversations_assigned ON conversations(practice_id, assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_conversations_priority ON conversations(practice_id, priority, status);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON conversations(practice_id, last_message_at DESC);

-- Update existing conversations: set last_message_at to actual last message timestamp
-- Uses subquery to get MAX(created_at) from chat_messages for accuracy
-- Falls back to updated_at only if no messages exist (subquery returns NULL)
UPDATE conversations 
SET last_message_at = COALESCE(
  (SELECT MAX(created_at) FROM chat_messages WHERE chat_messages.conversation_id = conversations.id),
  updated_at
)
WHERE last_message_at IS NULL;

PRAGMA foreign_keys = ON;

