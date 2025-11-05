-- Add welcomed_at column to users table if it doesn't exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS welcomed_at INTEGER;
