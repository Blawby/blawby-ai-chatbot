-- Convert session_timeout from text to integer (seconds)
-- Migration: Convert session timeout values from text to seconds
-- Date: 2025-01-18

-- First, add a new integer column for session timeout
ALTER TABLE users ADD COLUMN session_timeout_seconds INTEGER DEFAULT 604800;

-- Update the new column with converted values from the old text column
UPDATE users SET session_timeout_seconds = 
  CASE 
    WHEN session_timeout = '1 hour' THEN 3600
    WHEN session_timeout = '1 day' THEN 86400
    WHEN session_timeout = '7 days' THEN 604800
    WHEN session_timeout = '30 days' THEN 2592000
    ELSE 604800  -- Default to 7 days for any unrecognized values
  END;

-- Drop the old text column
ALTER TABLE users DROP COLUMN session_timeout;

-- Rename the new column to the original name
ALTER TABLE users RENAME COLUMN session_timeout_seconds TO session_timeout;
