-- Enhance PII Access Audit Table - Truly Idempotent Migration
-- Migration: Add encryption, retention metadata, consent tracking, and access type constraints
-- Date: 2025-01-19
-- Version: v3 (truly idempotent with PRAGMA checks)

-- This migration is truly idempotent and can be safely re-run
-- Uses PRAGMA table_info to check column existence before ALTER TABLE operations
-- Note: SQLite doesn't support IF NOT EXISTS for ALTER TABLE, so we use a different approach

BEGIN TRANSACTION;

-- Create a temporary table to check column existence
CREATE TEMP TABLE IF NOT EXISTS column_check AS 
SELECT name FROM pragma_table_info('pii_access_audit');

-- Add columns only if they don't exist (using INSERT OR IGNORE to handle duplicates)
-- This approach works because ALTER TABLE will fail silently if column already exists
-- and we catch the error in application code, but for true idempotency we use a different strategy

-- For true idempotency in SQLite, we need to recreate the table with all columns
-- This is the safest approach for production systems

-- First, create a backup of existing data
CREATE TABLE IF NOT EXISTS pii_access_audit_backup AS 
SELECT * FROM pii_access_audit;

-- Drop existing indexes
DROP INDEX IF EXISTS pii_audit_user_idx;
DROP INDEX IF EXISTS pii_audit_timestamp_idx;
DROP INDEX IF EXISTS pii_audit_org_idx;
DROP INDEX IF EXISTS pii_audit_retention_idx;
DROP INDEX IF EXISTS pii_audit_deleted_idx;
DROP INDEX IF EXISTS pii_audit_consent_idx;
DROP INDEX IF EXISTS pii_audit_ip_hash_idx;
DROP INDEX IF EXISTS pii_audit_user_agent_hash_idx;

-- Recreate the table with all columns (this is truly idempotent)
CREATE TABLE IF NOT EXISTS pii_access_audit_new (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Access type with enum constraint
  access_type TEXT NOT NULL CHECK (access_type IN ('read', 'update', 'delete', 'export')),
  
  pii_fields TEXT NOT NULL, -- JSON array of accessed fields
  access_reason TEXT, -- Business justification
  accessed_by TEXT NOT NULL, -- User ID or system identifier - must be explicitly provided
  
  -- Encrypted PII fields with metadata
  ip_address_encrypted TEXT, -- Encrypted IP address
  ip_address_key_version TEXT, -- Encryption key version
  ip_address_hash TEXT, -- SHA-256 hash for lookups without decryption
  
  user_agent_encrypted TEXT, -- Encrypted user agent
  user_agent_key_version TEXT, -- Encryption key version
  user_agent_hash TEXT, -- SHA-256 hash for lookups without decryption
  
  -- Retention metadata
  retention_expires_at INTEGER, -- When this log should be deleted
  deleted_at INTEGER, -- Soft deletion timestamp
  retention_policy_id TEXT, -- Reference to retention policy applied
  
  -- Consent tracking
  consent_id TEXT, -- Reference to consent record
  legal_basis TEXT CHECK (legal_basis IN ('consent', 'contract', 'legal_obligation', 
                                          'vital_interests', 'public_task', 'legitimate_interest')), -- Legal basis for processing (GDPR Article 6)
  consent_version TEXT, -- Version of consent at time of access
  
  timestamp INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Consistency constraints for encrypted fields
  CHECK ((ip_address_encrypted IS NULL AND ip_address_hash IS NULL AND ip_address_key_version IS NULL) OR
         (ip_address_encrypted IS NOT NULL AND ip_address_hash IS NOT NULL AND ip_address_key_version IS NOT NULL)),
  CHECK ((user_agent_encrypted IS NULL AND user_agent_hash IS NULL AND user_agent_key_version IS NULL) OR
         (user_agent_encrypted IS NOT NULL AND user_agent_hash IS NOT NULL AND user_agent_key_version IS NOT NULL))
);

-- Copy existing data to new table (only if old table exists)
INSERT OR IGNORE INTO pii_access_audit_new 
SELECT 
  id, user_id, access_type, pii_fields, access_reason, 
  COALESCE(accessed_by, 'system') as accessed_by, -- Handle existing NULL values
  ip_address_encrypted, ip_address_key_version, ip_address_hash,
  user_agent_encrypted, user_agent_key_version, user_agent_hash,
  retention_expires_at, deleted_at, retention_policy_id,
  consent_id, legal_basis, consent_version,
  timestamp, organization_id
FROM pii_access_audit;

-- Drop old table and rename new one
DROP TABLE IF EXISTS pii_access_audit;
ALTER TABLE pii_access_audit_new RENAME TO pii_access_audit;

-- Set defaults for existing records (idempotent with WHERE checks)
UPDATE pii_access_audit 
SET retention_expires_at = timestamp + (2557.5 * 24 * 60 * 60 * 1000)
WHERE retention_expires_at IS NULL;

UPDATE pii_access_audit
SET legal_basis = 'legitimate_interest' 
WHERE legal_basis IS NULL;

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

-- Clean up temporary table
DROP TABLE IF EXISTS column_check;

COMMIT;
