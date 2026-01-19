-- Migration: Align counters and matter-number uniqueness with practice_id
-- Date: 2026-01-07
-- Description: Replace legacy organization_id references with practice_id.
-- Greenfield schema already uses practice_id; legacy rename removed.

-- Replace legacy matter_number index scoped to organization_id, if it exists.
DROP INDEX IF EXISTS idx_matters_org_matter_number_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_matters_practice_matter_number_unique
ON matters(practice_id, matter_number)
WHERE matter_number IS NOT NULL;
