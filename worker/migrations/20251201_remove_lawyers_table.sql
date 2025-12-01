-- Migration: Remove lawyers table (using external API instead)
-- Date: 2025-12-01
-- Description: Drop lawyers table - lawyer search now uses external API at search.blawby.com
-- 
-- Note: assigned_lawyer_id and created_by_lawyer_id in matters table remain as TEXT fields
-- They can store any identifier (user IDs, external lawyer IDs, etc.)

PRAGMA foreign_keys = OFF;

-- Drop lawyers table
DROP TABLE IF EXISTS lawyers;

-- Note: No foreign key constraints to drop since lawyers table had no foreign keys pointing to it
-- The matters table has assigned_lawyer_id and created_by_lawyer_id as TEXT fields (not foreign keys)

PRAGMA foreign_keys = ON;

