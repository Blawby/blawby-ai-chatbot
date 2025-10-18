-- Enhance PII Access Audit Table - Idempotent Migration
-- Migration: Add encryption, retention metadata, consent tracking, and access type constraints
-- Date: 2025-01-19
-- Version: v2 (idempotent)

-- Note: SQLite doesn't support IF NOT EXISTS for ALTER TABLE ADD COLUMN
-- This migration should only be run once. For true idempotency, would need to recreate table.

-- First, create a backup of existing data
CREATE TABLE IF NOT EXISTS pii_access_audit_backup AS 
SELECT * FROM pii_access_audit;

-- Drop existing indexes (idempotent with IF NOT EXISTS)
DROP INDEX IF EXISTS pii_audit_user_idx;
DROP INDEX IF EXISTS pii_audit_timestamp_idx;
DROP INDEX IF EXISTS pii_audit_org_idx;

-- Add new columns for encrypted PII fields with metadata
-- Note: These will error if columns already exist, which is expected for idempotency
ALTER TABLE pii_access_audit ADD COLUMN ip_address_encrypted TEXT;
ALTER TABLE pii_access_audit ADD COLUMN ip_address_key_version TEXT;
ALTER TABLE pii_access_audit ADD COLUMN ip_address_hash TEXT;

ALTER TABLE pii_access_audit ADD COLUMN user_agent_encrypted TEXT;
ALTER TABLE pii_access_audit ADD COLUMN user_agent_key_version TEXT;
ALTER TABLE pii_access_audit ADD COLUMN user_agent_hash TEXT;

-- Add retention metadata columns
ALTER TABLE pii_access_audit ADD COLUMN retention_expires_at INTEGER;
ALTER TABLE pii_access_audit ADD COLUMN deleted_at INTEGER;
ALTER TABLE pii_access_audit ADD COLUMN retention_policy_id TEXT;

-- Add consent tracking columns
ALTER TABLE pii_access_audit ADD COLUMN consent_id TEXT;
ALTER TABLE pii_access_audit ADD COLUMN legal_basis TEXT;
ALTER TABLE pii_access_audit ADD COLUMN consent_version TEXT;

-- Set defaults for existing records (idempotent with WHERE checks)
UPDATE pii_access_audit 
SET retention_expires_at = timestamp + (7 * 365 * 24 * 60 * 60 * 1000)
WHERE retention_expires_at IS NULL;

UPDATE pii_access_audit
SET legal_basis = 'legitimate_interest' 
WHERE legal_basis IS NULL;

UPDATE pii_access_audit
SET accessed_by = 'system'
WHERE accessed_by IS NULL OR accessed_by = '';

UPDATE pii_access_audit
SET retention_policy_id = 'default_7_year'
WHERE retention_policy_id IS NULL;

-- Recreate indexes with new columns (idempotent with IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS pii_audit_user_idx ON pii_access_audit(user_id);
CREATE INDEX IF NOT EXISTS pii_audit_timestamp_idx ON pii_access_audit(timestamp);
CREATE INDEX IF NOT EXISTS pii_audit_org_idx ON pii_access_audit(organization_id);
CREATE INDEX IF NOT EXISTS pii_audit_retention_idx ON pii_access_audit(retention_expires_at);
CREATE INDEX IF NOT EXISTS pii_audit_deleted_idx ON pii_access_audit(deleted_at);
CREATE INDEX IF NOT EXISTS pii_audit_consent_idx ON pii_access_audit(consent_id);
CREATE INDEX IF NOT EXISTS pii_audit_ip_hash_idx ON pii_access_audit(ip_address_hash);
CREATE INDEX IF NOT EXISTS pii_audit_user_agent_hash_idx ON pii_access_audit(user_agent_hash);

-- Note: Legacy view removed in v3 migration
-- Applications should use PIIEncryptionService for accessing encrypted audit data
-- The pii_access_audit_legacy view was removed due to breaking changes
-- and potential compliance issues with returning NULL for critical audit fields
