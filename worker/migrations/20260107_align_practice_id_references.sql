-- Migration: Align counters and matter-number uniqueness with practice_id
-- Date: 2026-01-07
-- Description: Replace legacy organization_id references with practice_id.

-- Rename counters.organization_id -> practice_id
ALTER TABLE counters RENAME COLUMN organization_id TO practice_id;

-- Replace legacy matter_number index scoped to organization_id
DROP INDEX IF EXISTS idx_matters_org_matter_number_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_matters_practice_matter_number_unique
ON matters(practice_id, matter_number)
WHERE matter_number IS NOT NULL;
