-- Add custom_domains column to users table
-- Migration: Add custom domains storage for user links
-- Date: 2025-01-18

-- Add custom_domains column to store JSON array of custom domains
ALTER TABLE users ADD COLUMN custom_domains TEXT;
