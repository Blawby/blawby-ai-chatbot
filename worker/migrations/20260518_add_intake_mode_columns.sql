-- Add intake-mode persistence and AI-failure marker columns to conversations.
-- See docs/plans/2026-05-18-002-feat-strengthen-intake-ai-observability-plan.md (U1, U6).
-- Note: SQLite/D1 does not support IF NOT EXISTS on ALTER TABLE ADD COLUMN;
-- re-execution protection lives in the d1_migrations tracking table.

-- intake_mode_activated_at: timestamp set when a conversation enters intake mode
-- (the canonical replacement for the brittle per-message mode signal that previously
-- relied on the inbound message body carrying mode: 'REQUEST_CONSULTATION').
ALTER TABLE conversations ADD COLUMN intake_mode_activated_at TEXT;

-- ai_failed_at: timestamp set when the intake AI is marked as failed for this
-- conversation. Subsequent message turns short-circuit without re-invoking AI.
-- Cleared via the admin clearAiFailed escape hatch (see U6).
ALTER TABLE conversations ADD COLUMN ai_failed_at TEXT;

-- Backfill: mark existing intake conversations as intake-mode-active so the
-- new predicate (isPublic && intake_mode_activated_at IS NOT NULL) does not
-- silently route them to general QA mode after the predicate change in
-- worker/routes/aiChat.ts. The conditions below mirror the legacy fallback
-- signals (consultation present, slim contact draft present, intake brief
-- active, stored intake conversation state) that this column replaces.
UPDATE conversations
SET intake_mode_activated_at = COALESCE(updated_at, created_at)
WHERE intake_mode_activated_at IS NULL
  AND (
    json_extract(user_info, '$.consultation.status') IN ('collecting_case', 'ready_to_submit')
    OR json_extract(user_info, '$.consultation.contact.name') IS NOT NULL
    OR json_extract(user_info, '$.consultation.contact.email') IS NOT NULL
    OR json_extract(user_info, '$.consultation.contact.phone') IS NOT NULL
    OR json_extract(user_info, '$.intakeSlimContactDraft.name') IS NOT NULL
    OR json_extract(user_info, '$.intakeSlimContactDraft.email') IS NOT NULL
    OR json_extract(user_info, '$.intakeSlimContactDraft.phone') IS NOT NULL
    OR json_extract(user_info, '$.intakeAiBriefActive') = 1
    OR json_extract(user_info, '$.intakeConversationState') IS NOT NULL
  );

CREATE INDEX IF NOT EXISTS idx_conversations_practice_intake_mode
  ON conversations(practice_id, intake_mode_activated_at);

CREATE INDEX IF NOT EXISTS idx_conversations_practice_ai_failed
  ON conversations(practice_id, ai_failed_at);
