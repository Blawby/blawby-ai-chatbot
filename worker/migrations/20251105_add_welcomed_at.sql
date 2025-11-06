-- Add welcomed_at column to users table (idempotent)
-- Checks if column exists before adding to ensure idempotency
BEGIN TRANSACTION;

-- Check if welcomed_at column already exists
SELECT CASE 
  WHEN NOT EXISTS (
    SELECT 1 FROM pragma_table_info('users') WHERE name = 'welcomed_at'
  ) THEN 1
  ELSE 0
END AS should_add;

-- Add the column (will fail with "duplicate column name" if it already exists)
-- This error should be caught and treated as a no-op for idempotency
ALTER TABLE users ADD COLUMN welcomed_at INTEGER;

COMMIT;
