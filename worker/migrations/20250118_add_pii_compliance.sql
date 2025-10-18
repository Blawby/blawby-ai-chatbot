-- Add PII compliance and encryption fields
-- Migration: Add PII protection, consent tracking, and audit logging
-- Date: 2025-01-18

-- Rename existing PII fields to indicate they need encryption
ALTER TABLE users RENAME COLUMN secondary_phone TO secondary_phone_encrypted;
ALTER TABLE users RENAME COLUMN address_street TO address_street_encrypted;
ALTER TABLE users RENAME COLUMN address_city TO address_city_encrypted;
ALTER TABLE users RENAME COLUMN address_state TO address_state_encrypted;
ALTER TABLE users RENAME COLUMN address_zip TO address_zip_encrypted;
ALTER TABLE users RENAME COLUMN address_country TO address_country_encrypted;

-- Add PII compliance and consent fields
ALTER TABLE users ADD COLUMN pii_consent_given INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN pii_consent_date INTEGER;
ALTER TABLE users ADD COLUMN data_retention_consent INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN marketing_consent INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN data_processing_consent INTEGER DEFAULT 0;

-- Add data retention and deletion fields
ALTER TABLE users ADD COLUMN data_retention_expiry INTEGER;
ALTER TABLE users ADD COLUMN last_data_access INTEGER;
ALTER TABLE users ADD COLUMN data_deletion_requested INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN data_deletion_date INTEGER;

-- Create PII access audit table
CREATE TABLE IF NOT EXISTS pii_access_audit (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_type TEXT NOT NULL, -- "read", "update", "delete", "export"
  pii_fields TEXT NOT NULL, -- JSON array of accessed fields
  access_reason TEXT, -- Business justification
  accessed_by TEXT, -- User ID or system identifier
  ip_address TEXT,
  user_agent TEXT,
  -- Note: The expression strftime('%s', 'now') * 1000 works in SQLite DEFAULT context
  -- because SQLite evaluates the entire expression as numeric. In application code,
  -- strftime returns TEXT and would need explicit CAST. This is correct for DEFAULT clauses.
  timestamp INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE
);

-- Create indexes for audit table
CREATE INDEX IF NOT EXISTS pii_audit_user_idx ON pii_access_audit(user_id);
CREATE INDEX IF NOT EXISTS pii_audit_timestamp_idx ON pii_access_audit(timestamp);
CREATE INDEX IF NOT EXISTS pii_audit_org_idx ON pii_access_audit(organization_id);
