-- Usage quotas track per-organization consumption on a monthly cadence
CREATE TABLE IF NOT EXISTS usage_quotas (
  organization_id TEXT NOT NULL,
  period TEXT NOT NULL, -- Format: YYYY-MM
  messages_used INTEGER NOT NULL DEFAULT 0 CHECK (messages_used >= 0),
  messages_limit INTEGER NOT NULL DEFAULT -1 CHECK (messages_limit >= -1),
  override_messages INTEGER,
  files_used INTEGER NOT NULL DEFAULT 0 CHECK (files_used >= 0),
  files_limit INTEGER NOT NULL DEFAULT -1 CHECK (files_limit >= -1),
  override_files INTEGER,
  last_updated INTEGER NOT NULL,
  PRIMARY KEY (organization_id, period),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_usage_quotas_period ON usage_quotas(period);
CREATE INDEX IF NOT EXISTS idx_usage_quotas_org_period ON usage_quotas(organization_id, period);
