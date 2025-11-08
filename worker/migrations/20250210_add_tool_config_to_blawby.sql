-- Add tool config and public flag to blawby-ai org (idempotent)
-- Organization ID from 20250129_seed_blawby_ai_org.sql
-- Safe-merge using json_patch over existing config

UPDATE organizations
SET config = json_patch(
  COALESCE(config, '{}'),
  json('{\n    "tools": {\n      "pdf_analysis": {"enabled": true, "quotaMetric": "files", "requiredRole": null, "allowAnonymous": true},\n      "create_matter": {"enabled": true, "quotaMetric": null, "requiredRole": null, "allowAnonymous": false},\n      "lawyer_search": {"enabled": true, "quotaMetric": null, "requiredRole": null, "allowAnonymous": true},\n      "contact_form": {"enabled": true, "quotaMetric": null, "requiredRole": null, "allowAnonymous": true}\n    },\n    "agentMember": {\n      "enabled": true,\n      "userId": "blawby_agent_01",\n      "autoInvoke": false,\n      "tagRequired": false\n    },\n    "isPublic": true\n  }')
)
WHERE id = '01K0TNGNKTM4Q0AG0XF0A8ST0Q';
