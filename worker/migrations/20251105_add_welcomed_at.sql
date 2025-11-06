-- Add welcomed_at column to users table
-- Note: SQLite doesn't support IF NOT EXISTS for ALTER TABLE ADD COLUMN
-- This migration should only be run once. If the column already exists, this will fail.
ALTER TABLE users ADD COLUMN welcomed_at INTEGER;
