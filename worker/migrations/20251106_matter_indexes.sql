-- Migration: Add helpful indexes for matters and matter_events, and ensure closed_at exists
-- Note: D1/SQLite does not support ALTER TABLE ... ADD COLUMN IF NOT EXISTS. The migration
-- runner should ignore the duplicate-column error if closed_at already exists.

BEGIN TRANSACTION;
ALTER TABLE matters ADD COLUMN closed_at DATETIME;
COMMIT;

-- 2) Indexes to speed workspace listing and acceptedBy derivation
CREATE INDEX IF NOT EXISTS idx_matters_org_status_created_at ON matters(organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_matter_events_matter_type_date ON matter_events(matter_id, event_type, event_date DESC);
