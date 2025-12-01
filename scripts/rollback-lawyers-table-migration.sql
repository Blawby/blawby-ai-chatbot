-- Rollback script for migration 20251201_remove_lawyers_table.sql
-- 
-- Use this script if you need to restore the lawyers table after migration
-- 
-- WARNING: This will recreate the table structure but data will be lost
-- If you need to restore data, you must have a backup from before the migration
--
-- Usage:
--   wrangler d1 execute blawby-ai-chatbot --local --file scripts/rollback-lawyers-table-migration.sql
--   # or for production:
--   wrangler d1 execute blawby-ai-chatbot --env production --remote --file scripts/rollback-lawyers-table-migration.sql

PRAGMA foreign_keys = OFF;

-- Recreate the lawyers table with the original structure
-- This matches the structure from worker/schema.sql (lines 51-70)
CREATE TABLE IF NOT EXISTS lawyers (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  specialties JSON, -- Array of practice areas
  status TEXT DEFAULT 'active', -- 'active', 'inactive', 'on_leave'
  role TEXT DEFAULT 'attorney', -- 'attorney', 'paralegal', 'admin'
  hourly_rate INTEGER, -- in cents
  bar_number TEXT,
  license_state TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Note: After rollback, you may need to:
-- 1. Update application code to use the local lawyers table again
-- 2. Restore data from backup if available
-- 3. Revert any code changes that switched to the external API

PRAGMA foreign_keys = ON;

-- Rollback complete
-- Verify the table was recreated:
--   SELECT name FROM sqlite_master WHERE type='table' AND name='lawyers';

