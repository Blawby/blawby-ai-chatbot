-- Migration: Enforce unique matter_number per practice to prevent race-condition duplicates
-- Safe for D1: uses CREATE UNIQUE INDEX IF NOT EXISTS with partial index when supported

-- Uniqueness per practice; allow NULLs to coexist
CREATE UNIQUE INDEX IF NOT EXISTS idx_matters_practice_matter_number_unique
ON matters(practice_id, matter_number)
WHERE matter_number IS NOT NULL;
