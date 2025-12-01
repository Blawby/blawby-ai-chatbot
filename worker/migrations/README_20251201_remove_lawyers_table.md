# Migration: Remove Lawyers Table (20251201_remove_lawyers_table.sql)

## Overview

This migration removes the local `lawyers` table from the database, as the application now uses an external API (`search.blawby.com`) for lawyer search functionality.

## ⚠️ Pre-Migration Requirements

**DO NOT run this migration without completing the validation steps below.**

### 1. Pre-Migration Validation

Run the validation script to ensure the external API is available:

```bash
npm run validate:lawyer-api-migration
```

This script will:
- ✅ Check if `LAWYER_SEARCH_API_KEY` is configured
- ✅ Verify the external API is reachable
- ✅ Test a sample query to ensure the API responds correctly
- ✅ Report response times and status codes

**The migration should only proceed if validation passes.**

### 2. Application Verification

Before running the migration, verify:

1. ✅ The application code has been updated to use `/api/lawyers` endpoint
2. ✅ The `/lawyers` page in the frontend is working correctly
3. ✅ The worker route `/api/lawyers` is properly configured
4. ✅ No code references the local `lawyers` table anymore

### 3. Environment Configuration

Ensure these environment variables are set:

- `LAWYER_SEARCH_API_KEY` - API key for the external service
- `LAWYER_SEARCH_API_URL` - API URL (defaults to `https://search.blawby.com`)

## Phased Rollout Process

### Phase 1: Deploy Application Changes ✅ (Already Complete)
- Application code updated to use external API
- Worker route `/api/lawyers` implemented
- Frontend page `/lawyers` created

### Phase 2: Monitor and Validate
- Monitor application logs for any errors
- Verify all lawyer search requests are being served by external API
- Check response times and error rates
- Run validation script: `npm run validate:lawyer-api-migration`

### Phase 3: Apply Migration (Current Step)
- Run validation script one final time
- Apply migration: `wrangler d1 migrations apply blawby-ai-chatbot --local`
- Monitor application after migration
- Verify no errors in logs

## Running the Migration

### Local Development

```bash
# 1. Validate external API
npm run validate:lawyer-api-migration

# 2. If validation passes, apply migration
wrangler d1 migrations apply blawby-ai-chatbot --local

# 3. Verify application still works
# - Test /lawyers page
# - Check /api/lawyers endpoint
# - Monitor logs for errors
```

### Production

```bash
# 1. Validate external API (use production API key)
LAWYER_SEARCH_API_KEY=<prod-key> npm run validate:lawyer-api-migration

# 2. Take a backup first!
wrangler d1 backup blawby-ai-chatbot --env production --output backups/pre-migration-$(date +%Y%m%d-%H%M%S).sqlite

# 3. Apply migration
wrangler d1 migrations apply blawby-ai-chatbot --env production --remote

# 4. Monitor application closely
# - Watch error logs
# - Check response times
# - Verify user-facing features work
```

## Rollback Procedure

If issues occur after migration, you can rollback:

```bash
# Restore the lawyers table structure
wrangler d1 execute blawby-ai-chatbot --local --file scripts/rollback-lawyers-table-migration.sql

# For production:
wrangler d1 execute blawby-ai-chatbot --env production --remote --file scripts/rollback-lawyers-table-migration.sql
```

**Note:** Rollback will recreate the table structure but **data will be lost** unless you restore from a backup.

## Post-Migration Verification

After migration, verify:

1. ✅ `/lawyers` page loads and displays results
2. ✅ `/api/lawyers` endpoint returns data
3. ✅ No errors in application logs
4. ✅ Search functionality works correctly
5. ✅ No references to local `lawyers` table in code

## Troubleshooting

### Validation Fails

- Check `LAWYER_SEARCH_API_KEY` is set correctly
- Verify API URL is correct
- Test API manually: `curl -H "Authorization: Bearer $LAWYER_SEARCH_API_KEY" https://search.blawby.com/lawyers?state=ca&limit=1`
- Check network connectivity

### Migration Causes Errors

- Check application logs for specific error messages
- Verify worker route is configured correctly
- Ensure environment variables are set in production
- Consider rolling back if critical issues occur

### Application Not Working After Migration

1. Check if migration actually ran: `SELECT name FROM sqlite_master WHERE type='table' AND name='lawyers';` (should return nothing)
2. Verify external API is still reachable
3. Check worker logs for API errors
4. Verify environment variables are set correctly
5. If needed, rollback using the rollback script

## Related Files

- Migration SQL: `worker/migrations/20251201_remove_lawyers_table.sql`
- Validation Script: `scripts/validate-lawyer-api-migration.ts`
- Rollback Script: `scripts/rollback-lawyers-table-migration.sql`
- Worker Route: `worker/routes/lawyers.ts`
- Frontend Page: `src/components/pages/LawyerSearchPage.tsx`

## Migration Log

- **Date Created:** 2025-12-01
- **Status:** Ready for validation
- **Dependencies:** External API must be available
- **Risk Level:** Medium (requires external dependency)
- **Rollback:** Supported via rollback script

