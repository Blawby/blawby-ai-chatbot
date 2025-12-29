CREATE UNIQUE INDEX IF NOT EXISTS matters_session_id_unique
ON matters (organization_id, json_extract(custom_fields, '$.sessionId'))
WHERE json_extract(custom_fields, '$.sessionId') IS NOT NULL;
