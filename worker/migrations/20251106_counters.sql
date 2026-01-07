-- Migration: Create counters table for atomic sequences per practice
-- Provides atomic next_value allocation keyed by (practice_id, name)

CREATE TABLE IF NOT EXISTS counters (
  practice_id TEXT NOT NULL,
  name TEXT NOT NULL,
  next_value INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (practice_id, name)
);
