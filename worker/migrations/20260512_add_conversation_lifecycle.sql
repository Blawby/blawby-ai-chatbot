-- Conversation visibility lifecycle.
--
-- Background:
--   Conversations are created freely (new-conversation picker, anonymous widget,
--   draft compose). Until an intake is accepted by the practice, the row should
--   exist in D1 but be excluded from any inbox list. Once the backend reports
--   an accepted intake referencing the conversation, the worker flips
--   lifecycle_status to 'visible' on the next list pass.
--
--   Per-request "client joined the practice/org" check (better-auth org
--   membership for the requester) is enforced in the route handler via
--   AuthContext.activeOrganizationId — it is not stored per-row, since it is a
--   property of the viewer, not the conversation.
--
-- See: project_conversation_visibility memory.

ALTER TABLE conversations
  ADD COLUMN lifecycle_status TEXT NOT NULL DEFAULT 'pending_visibility'
  CHECK (lifecycle_status IN ('pending_visibility', 'visible', 'archived'));

ALTER TABLE conversations
  ADD COLUMN intake_accepted_at DATETIME;

CREATE INDEX IF NOT EXISTS idx_conversations_lifecycle
  ON conversations(practice_id, lifecycle_status);
