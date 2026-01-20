#!/bin/bash

set -euo pipefail

ENVIRONMENT="production"
FORCE=false

usage() {
  cat <<'EOF'
reset-prod-db.sh [--env ENVIRONMENT] [--force]

Drops all D1 tables for the specified environment, reapplies worker/schema.sql,
and applies migrations.

This is destructive. Always take a backup first:
  wrangler d1 backup blawby-ai-chatbot --env production --output backups/$(date +%Y%m%d-%H%M%S).sqlite
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)
      ENVIRONMENT="${2:-}"
      shift 2
      ;;
    --force)
      FORCE=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ "${ENVIRONMENT}" != "production" ]]; then
  echo "⚠️  This script is intended for the production environment. Use --env production to proceed." >&2
  exit 1
fi

if [[ "${FORCE}" != true ]]; then
  cat <<'EOF'
This will DROP EVERY TABLE in the production database, reapply worker/schema.sql,
and apply migrations.

If you really want to do this, rerun with --force.
EOF
  exit 1
fi

if ! command -v wrangler &>/dev/null; then
  echo "wrangler CLI is required but not found in PATH." >&2
  exit 1
fi

echo "🚨 Dropping all tables in production..."
wrangler d1 execute blawby-ai-chatbot --env "${ENVIRONMENT}" --remote --command "$(cat <<'SQL'
DROP TABLE IF EXISTS organization_events;
DROP TABLE IF EXISTS organization_api_tokens;
DROP TABLE IF EXISTS payment_history;
DROP TABLE IF EXISTS ai_feedback;
DROP TABLE IF EXISTS ai_generated_summaries;
DROP TABLE IF EXISTS matter_questions;
DROP TABLE IF EXISTS chat_logs;
DROP TABLE IF EXISTS files;
DROP TABLE IF EXISTS matter_events;
DROP TABLE IF EXISTS matters;
DROP TABLE IF EXISTS lawyers;
DROP TABLE IF EXISTS services;
DROP TABLE IF EXISTS contact_forms;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS conversation_read_state;
DROP TABLE IF EXISTS conversation_participants;
DROP TABLE IF EXISTS conversations;
DROP TABLE IF EXISTS organizations;
DROP TABLE IF EXISTS session_audit_events;
DROP TABLE IF EXISTS session_summaries;
DROP TABLE IF EXISTS chat_messages;
DROP TABLE IF EXISTS chat_sessions;
DROP TABLE IF EXISTS verifications;
DROP TABLE IF EXISTS accounts;
DROP TABLE IF EXISTS passwords;
DROP TABLE IF EXISTS subscriptions;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS pii_access_audit_backup;
DROP TABLE IF EXISTS pii_access_audit;
SQL
)"

echo "🧱 Reapplying worker/schema.sql..."
wrangler d1 execute blawby-ai-chatbot --env "${ENVIRONMENT}" --remote --file worker/schema.sql

echo "🔄 Applying migrations..."
wrangler d1 migrations apply blawby-ai-chatbot --env "${ENVIRONMENT}" --remote

echo "✅ Production database reset complete."
echo "   - All tables dropped and recreated"
echo "   - Migrations applied"
echo "Next step: sign up again via the app to create new user accounts and personal organizations."
