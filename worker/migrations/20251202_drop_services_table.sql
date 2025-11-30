-- Migration: Drop services table (services now stored in practice config)
-- Date: 2025-12-02
-- Description: Drop services table. Services data is now stored in practice.config.availableServices 
-- from the remote API (staging-api.blawby.com), not in a local database table.
-- 
-- Table being removed:
-- - services (all services data now in practice.config.availableServices from remote API)
--
-- Note: Services are configured per-practice in the remote API's practice configuration.
-- The chatbot reads availableServices from practice.config, not from this database table.

PRAGMA foreign_keys = OFF;

-- Drop services table
DROP TABLE IF EXISTS services;

PRAGMA foreign_keys = ON;

