-- Migration: Drop matters.organization_id (derive org via practice_id)
-- Date: 2026-01-07
-- Description: Rebuild matters table without organization_id and restore indexes.

PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS matters_new (
  id TEXT PRIMARY KEY,
  practice_id TEXT NOT NULL,
  user_id TEXT,
  client_name TEXT NOT NULL,
  client_email TEXT,
  client_phone TEXT,
  matter_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'lead',
  priority TEXT NOT NULL DEFAULT 'normal',
  assigned_lawyer_id TEXT,
  lead_source TEXT,
  estimated_value INTEGER,
  billable_hours REAL DEFAULT 0,
  flat_fee INTEGER,
  retainer_amount INTEGER,
  retainer_balance INTEGER DEFAULT 0,
  statute_of_limitations DATE,
  court_jurisdiction TEXT,
  opposing_party TEXT,
  matter_number TEXT,
  tags JSON,
  custom_fields JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  closed_at DATETIME
);

INSERT INTO matters_new (
  id,
  practice_id,
  user_id,
  client_name,
  client_email,
  client_phone,
  matter_type,
  title,
  description,
  status,
  priority,
  assigned_lawyer_id,
  lead_source,
  estimated_value,
  billable_hours,
  flat_fee,
  retainer_amount,
  retainer_balance,
  statute_of_limitations,
  court_jurisdiction,
  opposing_party,
  matter_number,
  tags,
  custom_fields,
  created_at,
  updated_at,
  closed_at
)
SELECT
  id,
  practice_id,
  user_id,
  client_name,
  client_email,
  client_phone,
  matter_type,
  title,
  description,
  status,
  priority,
  assigned_lawyer_id,
  lead_source,
  estimated_value,
  billable_hours,
  flat_fee,
  retainer_amount,
  retainer_balance,
  statute_of_limitations,
  court_jurisdiction,
  opposing_party,
  matter_number,
  tags,
  custom_fields,
  created_at,
  updated_at,
  closed_at
FROM matters;

DROP TABLE matters;
ALTER TABLE matters_new RENAME TO matters;

CREATE INDEX IF NOT EXISTS idx_matters_practice ON matters(practice_id);
CREATE INDEX IF NOT EXISTS idx_matters_user ON matters(user_id);
CREATE INDEX IF NOT EXISTS idx_matters_status ON matters(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_matters_practice_matter_number_unique
ON matters(practice_id, matter_number)
WHERE matter_number IS NOT NULL;

PRAGMA foreign_keys = ON;
