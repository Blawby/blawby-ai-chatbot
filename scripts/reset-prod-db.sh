#!/bin/bash

set -euo pipefail

ENVIRONMENT="production"
FORCE=false

usage() {
  cat <<'EOF'
reset-prod-db.sh [--env ENVIRONMENT] [--force]

Drops all D1 tables for the specified environment, reapplies worker/schema.sql,
and seeds the default blawby-ai organization (with no members).

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
and insert the default blawby-ai organization with no members.

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
DROP TABLE IF EXISTS subscriptions;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS pii_access_audit_backup;
DROP TABLE IF EXISTS pii_access_audit;
SQL
)"

echo "🧱 Reapplying worker/schema.sql..."
wrangler d1 execute blawby-ai-chatbot --env "${ENVIRONMENT}" --remote --file worker/schema.sql

echo "🌱 Seeding default blawby-ai organization..."
wrangler d1 execute blawby-ai-chatbot --env "${ENVIRONMENT}" --remote --command "$(cat <<'SQL'
INSERT INTO organizations (
  id,
  slug,
  name,
  domain,
  subscription_tier,
  seats,
  is_personal,
  config,
  created_at,
  updated_at
) VALUES (
  '01K0TNGNKTM4Q0AG0XF0A8ST0Q',
  'blawby-ai',
  'Blawby AI',
  'ai.blawby.com',
  'free',
  1,
  0,
  json('{
    "aiProvider": "workers-ai",
    "aiModel": "@cf/openai/gpt-oss-20b",
    "aiModelFallback": ["@cf/openai/gpt-oss-20b"],
    "consultationFee": 0,
    "requiresPayment": false,
    "availableServices": [
      "Family Law",
      "Business Law",
      "Contract Review",
      "Intellectual Property",
      "Employment Law",
      "Personal Injury",
      "Criminal Law",
      "Civil Law",
      "General Consultation"
    ],
    "serviceQuestions": {
      "Family Law": [
        "I understand this is a difficult time. Can you tell me what type of family situation you''re dealing with?",
        "What are the main issues you''re facing?",
        "Have you taken any steps to address this situation?",
        "What would a good outcome look like for you?"
      ],
      "Business Law": [
        "What type of business entity are you operating or planning to start?",
        "What specific legal issue are you facing with your business?",
        "Are you dealing with contracts, employment issues, or regulatory compliance?",
        "What is the size and scope of your business operations?"
      ],
      "Contract Review": [
        "What type of contract do you need reviewed?",
        "What is the value or importance of this contract?",
        "Are there any specific concerns or red flags you''ve noticed?",
        "What is the timeline for this contract?"
      ],
      "Intellectual Property": [
        "What type of intellectual property are you dealing with?",
        "Are you looking to protect, license, or enforce IP rights?",
        "What is the nature of your IP (patent, trademark, copyright, trade secret)?",
        "What is the commercial value or importance of this IP?"
      ],
      "Employment Law": [
        "What specific employment issue are you facing?",
        "Are you an employer or employee in this situation?",
        "Have you taken any steps to address this issue?",
        "What is the timeline or urgency of your situation?"
      ],
      "Personal Injury": [
        "Can you tell me about the incident that caused your injury?",
        "What type of injuries did you sustain?",
        "Have you received medical treatment?",
        "What is the current status of your recovery?"
      ],
      "Criminal Law": [
        "What type of legal situation are you facing?",
        "Are you currently facing charges or under investigation?",
        "Have you been arrested or contacted by law enforcement?",
        "Do you have an attorney representing you?"
      ],
      "Civil Law": [
        "What type of civil legal issue are you dealing with?",
        "Are you involved in a lawsuit or considering legal action?",
        "What is the nature of the dispute?",
        "What outcome are you hoping to achieve?"
      ],
      "General Consultation": [
        "Thanks for reaching out! I''d love to help. Can you tell me what legal situation you''re dealing with?",
        "Have you been able to take any steps to address this yet?",
        "What would a good outcome look like for you?",
        "Do you have any documents or information that might be relevant?"
      ]
    },
    "description": "AI-powered legal assistance for businesses and individuals",
    "brandColor": "#2563eb",
    "accentColor": "#3b82f6",
    "introMessage": "Hello! I''m Blawby AI, your intelligent legal assistant. I can help you with family law, business law, contract review, intellectual property, employment law, personal injury, criminal law, civil law, and general legal consultation. How can I assist you today?",
    "voice": {
      "enabled": false,
      "provider": "cloudflare",
      "voiceId": null,
      "displayName": null,
      "previewUrl": null
    },
    "blawbyApi": {
      "enabled": false,
      "apiUrl": "https://staging.blawby.com"
    }
  }'),
  strftime('%s','now') * 1000,
  strftime('%s','now') * 1000
);
SQL
)"

echo "✅ Production database reset complete."
echo "   - All tables dropped and recreated"
echo "   - Default blawby-ai organization seeded"
echo "Next step: sign up again via the app to create new user accounts and personal organizations."
