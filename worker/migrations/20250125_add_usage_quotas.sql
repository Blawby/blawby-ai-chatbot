-- Usage quotas track per-organization consumption on a monthly cadence
-- Override columns allow per-period limit adjustments without affecting tier-based limits
-- NULL = use tier-based limit, >= -1 = override with specific limit (-1 = unlimited)
CREATE TABLE IF NOT EXISTS usage_quotas (
  organization_id TEXT NOT NULL,
  period TEXT NOT NULL CHECK (period GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]' AND CAST(SUBSTR(period, 6, 2) AS INTEGER) BETWEEN 1 AND 12), -- Format: YYYY-MM
  messages_used INTEGER NOT NULL DEFAULT 0 CHECK (messages_used >= 0),
  messages_limit INTEGER NOT NULL DEFAULT -1 CHECK (messages_limit >= -1),
  override_messages INTEGER CHECK (override_messages IS NULL OR override_messages >= -1), -- NULL = no override, >= -1 = valid limit
  files_used INTEGER NOT NULL DEFAULT 0 CHECK (files_used >= 0),
  files_limit INTEGER NOT NULL DEFAULT -1 CHECK (files_limit >= -1),
  override_files INTEGER CHECK (override_files IS NULL OR override_files >= -1), -- NULL = no override, >= -1 = valid limit
  last_updated INTEGER NOT NULL,
  PRIMARY KEY (organization_id, period),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_usage_quotas_period ON usage_quotas(period);
CREATE INDEX IF NOT EXISTS idx_usage_quotas_org_period ON usage_quotas(organization_id, period);
