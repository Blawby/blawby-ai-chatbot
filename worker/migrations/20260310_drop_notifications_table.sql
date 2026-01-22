-- Migration: Drop legacy notifications table
-- Date: 2026-03-10
-- Description: Remove in-app notifications storage; keep destinations + delivery results.

BEGIN TRANSACTION;

DROP TABLE IF EXISTS notifications;
DROP INDEX IF EXISTS idx_notifications_user_dedupe;
DROP INDEX IF EXISTS idx_notifications_user_source_event;
DROP INDEX IF EXISTS idx_notifications_user_created;
DROP INDEX IF EXISTS idx_notifications_user_category;

COMMIT;
