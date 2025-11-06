#!/bin/bash
# Script to invalidate exposed session token
# Token: e5186d80-809b-4c40-becf-f5d275b8b1f8
# This script should be run against the database to close/invalidate the exposed session

set -euo pipefail

echo "⚠️  SECURITY: Invalidating exposed session token"
echo "Token: e5186d80-809b-4c40-becf-f5d275b8b1f8"
echo ""
echo "This script will:"
echo "1. Find the session by token hash"
echo "2. Close the session (set state='closed', closed_at=now())"
echo "3. Rotate the token to a new random value"
echo ""
echo "⚠️  IMPORTANT: Run this against your database using wrangler d1 execute"
echo ""
echo "SQL to execute:"
echo "---"
cat <<'SQL'
-- Invalidate exposed session token
-- This closes the session and rotates the token
UPDATE chat_sessions
SET 
  state = 'closed',
  closed_at = datetime('now'),
  token_hash = NULL,  -- Clear token hash to invalidate
  updated_at = datetime('now')
WHERE token_hash = (
  -- Find session by token hash
  -- Note: You'll need to hash the token first using your application's hash function
  -- For now, this is a placeholder - you should run this through your application
  SELECT token_hash 
  FROM chat_sessions 
  WHERE token_hash IS NOT NULL
  LIMIT 1
);
SQL

echo ""
echo "⚠️  To properly execute this, you need to:"
echo "1. Hash the token using your application's hashToken function"
echo "2. Find the session with that hash"
echo "3. Close it"
echo ""
echo "Alternatively, you can manually close all sessions created around the exposure time:"
echo ""
cat <<'SQL'
-- Close all sessions created on 2025-11-06 around 12:36 UTC
UPDATE chat_sessions
SET 
  state = 'closed',
  closed_at = datetime('now'),
  token_hash = NULL,
  updated_at = datetime('now')
WHERE created_at >= '2025-11-06T12:30:00Z'
  AND created_at <= '2025-11-06T12:40:00Z'
  AND state = 'active';
SQL

