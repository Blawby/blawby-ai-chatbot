-- Migration: Remove members and invitations tables (migrated to remote API)
-- Date: 2025-11-30
-- Description: Drop members and invitations tables that are now managed by remote API at staging-api.blawby.com
-- 
-- Tables being removed:
-- - members (membership management now handled by remote API)
-- - invitations (invitation management now handled by remote API)
--
-- Note: Membership verification is now done via /api/practice/{orgId}/members endpoint
-- using the caller's Bearer token. The requireOrgMember middleware has been updated
-- to trust the staging API for RBAC.

PRAGMA foreign_keys = OFF;

-- Drop membership and invitation tables
DROP TABLE IF EXISTS invitations;
DROP TABLE IF EXISTS members;

-- Drop any indexes that reference these tables
DROP INDEX IF EXISTS idx_members_organization_user;
DROP INDEX IF EXISTS idx_members_user_id;
DROP INDEX IF EXISTS idx_invitations_organization_id;
DROP INDEX IF EXISTS idx_invitations_email;

PRAGMA foreign_keys = ON;

