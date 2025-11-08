-- Add tool config and public flag to blawby-ai org (idempotent)
-- Organization ID from 20250129_seed_blawby_ai_org.sql
-- Normalize existing config to a valid JSON object, then set keys explicitly

-- Step 1: Normalize to JSON object
UPDATE organizations
SET config = CASE
  WHEN json_valid(config) AND json_type(config) = 'object' THEN config
  ELSE '{}'
END
WHERE id = '01K0TNGNKTM4Q0AG0XF0A8ST0Q';

-- Step 2: Set required paths using json_set
UPDATE organizations
SET config = json_set(
  config,
  '$.tools.pdf_analysis', json('{"enabled": true, "quotaMetric": "files", "requiredRole": null, "allowAnonymous": true}'),
  '$.tools.create_matter', json('{"enabled": true, "quotaMetric": null, "requiredRole": null, "allowAnonymous": false}'),
  '$.tools.lawyer_search', json('{"enabled": true, "quotaMetric": null, "requiredRole": null, "allowAnonymous": true}'),
  '$.tools.contact_form', json('{"enabled": true, "quotaMetric": null, "requiredRole": null, "allowAnonymous": true}'),
  '$.agentMember', json('{"enabled": true, "userId": "blawby_agent_01", "autoInvoke": false, "tagRequired": false}'),
  '$.isPublic', true
)
WHERE id = '01K0TNGNKTM4Q0AG0XF0A8ST0Q';
