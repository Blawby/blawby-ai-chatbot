-- Migration: Drop payment_history and organization_events tables
-- Date: 2025-12-02
-- Description: Drop payment_history and organization_events tables. Both are now handled by the remote API
-- (staging-api.blawby.com) instead of local database storage.
-- 
-- Tables being removed:
-- - payment_history (payment tracking now handled by remote API)
-- - organization_events (organization event logging now handled by remote API)
--
-- Note: Payment history and organization events are now managed by the remote API.
-- The chatbot no longer stores this data locally.

PRAGMA foreign_keys = OFF;

-- Drop organization_events index first
DROP INDEX IF EXISTS idx_org_events_org_created;

-- Drop organization_events table
DROP TABLE IF EXISTS organization_events;

-- Drop payment_history table
DROP TABLE IF EXISTS payment_history;

PRAGMA foreign_keys = ON;

