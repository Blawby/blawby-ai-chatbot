-- Add welcomed_at column to users table if it does not already exist
-- Uses IF NOT EXISTS to ensure idempotency on re-runs
ALTER TABLE users ADD COLUMN IF NOT EXISTS welcomed_at INTEGER;
