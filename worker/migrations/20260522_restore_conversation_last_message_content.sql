-- Restore conversations.last_message_content on environments where
-- 20260401_remove_local_matters_tables.sql ran AFTER 20260318_add_conversation_last_message_content.sql.
--
-- 20260401 rebuilds the `conversations` table via INSERT INTO conversations_new SELECT … FROM conversations,
-- and its column list (lines 54-73) does NOT include `last_message_content`. On environments where the
-- 20260318 migration ran first (i.e. the column existed in `conversations` at the time of the rebuild),
-- the rebuild silently dropped the column. Staging escaped this because 20260401 had been applied months
-- earlier; 20260318 then added the column to the already-rebuilt table. Prod and any fresh env hit it.
--
-- This migration restores the column. Pre-applied to local and staging via INSERT into d1_migrations so
-- the tracker stays consistent without re-running ALTER (which would fail since the column already exists).

ALTER TABLE conversations ADD COLUMN last_message_content TEXT;
