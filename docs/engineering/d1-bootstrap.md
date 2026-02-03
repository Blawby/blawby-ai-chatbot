# D1 Bootstrap (Clean Setup)

Use this when creating a brand-new D1 database (staging, preview, etc.).
It loads the full schema and marks all historical migrations as applied so
`wrangler d1 migrations apply` won’t fail on duplicate columns.

## Command

```bash
npm run d1:bootstrap -- --db <db-name> --env <env> --remote
```

Example (staging):

```bash
npm run d1:bootstrap -- --db blawby-ai-chatbot-staging --env staging --remote
```

## Notes

- This is intended for **fresh databases only**.
- For existing environments, keep using `wrangler d1 migrations apply`.
- The script uses `worker/schema.sql` as the source of truth for the current schema,
  then inserts migration filenames into `d1_migrations`.
