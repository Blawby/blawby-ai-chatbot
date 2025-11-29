-- Migrate quota data from usage_quotas table to organization config
-- This is part of simplifying the quota system

-- First, let's see what organizations exist and their current quota usage
SELECT 
    o.id as org_id,
    o.subscription_tier,
    o.config as current_config,
    uq.messages_used,
    uq.messages_limit,
    uq.period
FROM organizations o
LEFT JOIN usage_quotas uq ON o.id = uq.organization_id 
    AND uq.period = strftime('%Y-%m', 'now')
WHERE o.id IS NOT NULL;

-- Update organization configs with quota data
UPDATE organizations 
SET config = json_set(
    COALESCE(config, '{}'),
    '$.quotaUsed', COALESCE(
        (SELECT messages_used FROM usage_quotas uq 
         WHERE uq.organization_id = organizations.id 
         AND uq.period = strftime('%Y-%m', 'now')
         LIMIT 1), 
        0
    ),
    '$.quotaLimit', CASE 
        WHEN subscription_tier = 'free' THEN 100
        WHEN subscription_tier = 'plus' THEN 500
        WHEN subscription_tier = 'business' THEN 1000
        WHEN subscription_tier = 'enterprise' THEN -1
        ELSE 100
    END,
    '$.quotaResetDate', datetime('now')
)
WHERE id IN (
    SELECT organization_id FROM usage_quotas 
    WHERE period = strftime('%Y-%m', 'now')
);

-- Show the results of the migration
SELECT 
    id as org_id,
    subscription_tier,
    json_extract(config, '$.quotaUsed') as quota_used,
    json_extract(config, '$.quotaLimit') as quota_limit,
    json_extract(config, '$.quotaResetDate') as quota_reset_date
FROM organizations 
WHERE json_extract(config, '$.quotaUsed') IS NOT NULL;

-- Optional: After verification, you can clean up the old usage_quotas table
-- COMMENT OUT THE FOLLOWING LINES until you've verified the migration worked:
-- DROP TABLE usage_quotas;

-- Note: The USAGE_QUOTAS KV namespace can also be removed after migration
-- This should be done via wrangler command: wrangler kv:namespace delete USAGE_QUOTAS
