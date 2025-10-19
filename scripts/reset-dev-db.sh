#!/bin/bash
set -e

# Check if schema file exists before proceeding
if [ ! -f "worker/schema.sql" ]; then
    echo "❌ Error: worker/schema.sql not found!"
    echo "Please ensure the schema file exists before running this script."
    exit 1
fi

echo "🗑️  Dropping all tables..."
wrangler d1 execute blawby-ai-chatbot --local --command "
DROP TABLE IF EXISTS invitations;
DROP TABLE IF EXISTS organization_events;
DROP TABLE IF EXISTS members;
DROP TABLE IF EXISTS member;
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
DROP TABLE IF EXISTS conversations;
DROP TABLE IF EXISTS organizations;
DROP TABLE IF EXISTS session_audit_events;
DROP TABLE IF EXISTS session_summaries;
DROP TABLE IF EXISTS chat_messages;
DROP TABLE IF EXISTS chat_sessions;
DROP TABLE IF EXISTS verifications;
DROP TABLE IF EXISTS accounts;
DROP TABLE IF EXISTS passwords;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS pii_access_audit_backup;
DROP TABLE IF EXISTS pii_access_audit;
"

echo "📝 Applying schema..."
wrangler d1 execute blawby-ai-chatbot --local --file worker/schema.sql

echo "✅ Database reset complete!"
