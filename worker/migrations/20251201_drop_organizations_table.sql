-- Migration: Drop organizations table (config moved to practice.metadata.chatbotConfig)
-- Date: 2025-12-01
-- Description: Drop organizations table. Chatbot config for practices is now stored in practice.metadata.chatbotConfig in the remote API. Workspaces use hardcoded defaults with no storage needed.
-- 
-- Table being removed:
-- - organizations (all data now in remote API or hardcoded defaults)
-- - usage_quotas (quota tracking handled remotely; organization_id remains as TEXT references elsewhere)
--
-- Note: Chatbot tables (conversations, messages, contact_forms, files, etc.) keep organization_id
-- as TEXT reference only (no FK constraint). All organization data is fetched from remote API.

PRAGMA foreign_keys = OFF;

-- Drop usage quotas table referencing organizations
DROP TABLE IF EXISTS usage_quotas;

-- Drop organizations table
DROP TABLE IF EXISTS organizations;

-- Drop any indexes that reference organizations table
DROP INDEX IF EXISTS idx_organizations_slug;
DROP INDEX IF EXISTS idx_organizations_stripe_customer_id;
DROP INDEX IF EXISTS idx_organizations_is_personal;

PRAGMA foreign_keys = ON;

