#!/bin/bash
# Script to invalidate exposed Playwright auth tokens and sessions
# This file contained real session tokens and PII committed to the repo
# 
# Exposed data:
# - Session token: tVDgKASe7UeWIevXS4li6rtIJ7AMr3mB.3aMerIU%2FDmYil2Fn0CEyL%2FADOoqOAt%2FHraYxQImb%2FYg%3D
# - User ID: 6lyClc0Xz6u5nohnryIayFvGXbgo55TJ
# - Email: e2e-setup-1762434220501@example.com
# - Session ID: 5QqYQfL4RdaQyYnCeAeQjCAr91Hr0nW6
# - Organization ID: mhnftwqx3h67t51bdr2
# - Created: 2025-11-06T13:03:41.583Z

set -euo pipefail

echo "⚠️  SECURITY: Invalidating exposed Playwright auth tokens and sessions"
echo ""
echo "Exposed credentials:"
echo "  - Session token: tVDgKASe7UeWIevXS4li6rtIJ7AMr3mB..."
echo "  - User ID: 6lyClc0Xz6u5nohnryIayFvGXbgo55TJ"
echo "  - Email: e2e-setup-1762434220501@example.com"
echo "  - Session ID: 5QqYQfL4RdaQyYnCeAeQjCAr91Hr0nW6"
echo "  - Organization ID: mhnftwqx3h67t51bdr2"
echo ""
echo "This script provides SQL to invalidate the exposed sessions."
echo "⚠️  IMPORTANT: Run this against your database using wrangler d1 execute"
echo ""
echo "SQL to execute:"
echo "---"
cat <<'SQL'
-- Invalidate exposed Better Auth session
-- Session ID: 5QqYQfL4RdaQyYnCeAeQjCAr91Hr0nW6
-- User ID: 6lyClc0Xz6u5nohnryIayFvGXbgo55TJ

-- Delete the exposed session
DELETE FROM sessions
WHERE id = '5QqYQfL4RdaQyYnCeAeQjCAr91Hr0nW6'
   OR token = 'tVDgKASe7UeWIevXS4li6rtIJ7AMr3mB.3aMerIU%2FDmYil2Fn0CEyL%2FADOoqOAt%2FHraYxQImb%2FYg%3D'
   OR (userId = '6lyClc0Xz6u5nohnryIayFvGXbgo55TJ' AND createdAt >= '2025-11-06T13:00:00Z' AND createdAt <= '2025-11-06T13:10:00Z');

-- Optionally, delete the test user account if it's only for E2E testing
-- WARNING: Only do this if you're sure this user is only for testing
-- DELETE FROM users WHERE id = '6lyClc0Xz6u5nohnryIayFvGXbgo55TJ';

-- Delete any organization memberships for this user if needed
-- DELETE FROM organization_members WHERE userId = '6lyClc0Xz6u5nohnryIayFvGXbgo55TJ';
SQL

echo ""
echo "⚠️  For Better Auth sessions table, you may need to:"
echo "1. Find the session by token or session ID"
echo "2. Delete or expire the session"
echo "3. Rotate any related tokens"
echo ""
echo "⚠️  If this was pushed to a remote repository:"
echo "1. Notify security team immediately"
echo "2. Rotate all affected tokens in production"
echo "3. Consider using git filter-branch or BFG Repo-Cleaner to remove from history"
echo "4. Monitor for unauthorized access using the exposed credentials"

