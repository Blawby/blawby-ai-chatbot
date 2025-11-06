-- Migration: Create counters table for atomic sequences per organization
-- Provides atomic next_value allocation keyed by (organization_id, name)

CREATE TABLE IF NOT EXISTS counters (
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  next_value INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (organization_id, name)
);
