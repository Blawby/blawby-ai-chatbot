-- Add business onboarding tracking to organizations table
ALTER TABLE organizations ADD COLUMN business_onboarding_completed_at INTEGER DEFAULT NULL;
ALTER TABLE organizations ADD COLUMN business_onboarding_skipped INTEGER DEFAULT 0;
ALTER TABLE organizations ADD COLUMN business_onboarding_data JSON DEFAULT NULL;

-- Optional index to query onboarding status for business/enterprise tiers
CREATE INDEX IF NOT EXISTS idx_organizations_onboarding 
ON organizations(subscription_tier, business_onboarding_completed_at);


