-- Migration: Remove auth tables (migrated to remote API)
-- Date: 2025-11-28
-- Description: Drop auth-related tables that are now managed by remote API at staging-api.blawby.com
-- 
-- Tables being removed:
-- - users (user management now handled by remote API)
-- - sessions (session management now handled by remote API)
-- - accounts (OAuth account linking now handled by remote API)
-- - verifications (email verification now handled by remote API)
-- - subscriptions (subscription management now handled by remote API)
-- - pii_access_audit (PII audit logging now handled by remote API)
--
-- Note: organizations, members, and invitations tables are kept for workspace endpoints

PRAGMA foreign_keys = OFF;

-- Drop auth tables
DROP TABLE IF EXISTS pii_access_audit;
DROP TABLE IF EXISTS subscriptions;
DROP TABLE IF EXISTS verifications;
DROP TABLE IF EXISTS accounts;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;

-- Drop any views that reference auth tables
DROP VIEW IF EXISTS user_auth_summary;

PRAGMA foreign_keys = ON;

