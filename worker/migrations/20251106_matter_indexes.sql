-- Migration: Add helpful indexes for matters and matter_events
-- Note: D1 handles transactions automatically - do not use BEGIN TRANSACTION or COMMIT
-- Note: The closed_at column already exists in schema.sql, so we don't need to add it here

-- Create indexes to speed workspace listing and acceptedBy derivation
CREATE INDEX IF NOT EXISTS idx_matters_org_status_created_at ON matters(organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_matter_events_matter_type_date ON matter_events(matter_id, event_type, event_date DESC);
