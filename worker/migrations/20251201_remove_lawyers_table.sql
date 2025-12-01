-- Migration: Remove lawyers table (using external API instead)
-- Date: 2025-12-01
-- Description: Drop lawyers table - lawyer search now uses external API at search.blawby.com
-- 
-- ⚠️  IMPORTANT: Pre-migration validation required
-- 
-- BEFORE RUNNING THIS MIGRATION:
--   1. Run the validation script: npm run validate:lawyer-api-migration
--   2. Ensure the external API (search.blawby.com) is reachable and responding
--   3. Verify LAWYER_SEARCH_API_KEY is configured in environment variables
--   4. Test the /api/lawyers endpoint in the application
--   5. Monitor application logs after migration for any issues
--
-- ROLLBACK INSTRUCTIONS:
--   If the migration causes issues, you can restore the table structure from schema.sql:
--   See worker/schema.sql lines 51-70 for the original lawyers table definition
--
-- PHASED ROLLOUT RECOMMENDATION:
--   Phase 1: Deploy application changes to use external API (already done)
--   Phase 2: Monitor traffic and verify external API is serving all requests successfully
--   Phase 3: Run this migration to drop the local table (current step)
--
-- Note: assigned_lawyer_id and created_by_lawyer_id in matters table remain as TEXT fields
-- They can store any identifier (user IDs, external lawyer IDs, etc.)

PRAGMA foreign_keys = OFF;

-- Create a backup log entry before dropping (if you have a migration_log table)
-- This helps track when the migration was applied
-- INSERT INTO migration_log (migration_name, applied_at, notes) 
-- VALUES ('20251201_remove_lawyers_table', datetime('now'), 'Dropped lawyers table - using external API');

-- Drop lawyers table
-- This is safe because:
-- 1. The application code has been updated to use /api/lawyers endpoint
-- 2. The external API has been validated as available
-- 3. No foreign key constraints reference this table
DROP TABLE IF EXISTS lawyers;

-- Note: No foreign key constraints to drop since lawyers table had no foreign keys pointing to it
-- The matters table has assigned_lawyer_id and created_by_lawyer_id as TEXT fields (not foreign keys)

PRAGMA foreign_keys = ON;

-- Migration complete
-- Verify the application is working correctly by:
-- 1. Testing the /lawyers page in the frontend
-- 2. Checking that /api/lawyers endpoint returns data
-- 3. Monitoring error logs for any lawyer-related queries

