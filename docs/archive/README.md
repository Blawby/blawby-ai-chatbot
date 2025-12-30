# Archived Documentation

This directory contains archived documentation for features that have been removed or significantly changed.

## Archive Categories

### AI Features (Removed December 2025)
- AI agent streaming (`/api/agent/stream`) - Removed
- AI summarization and analysis - Removed
- AI conversation context - Removed
- AI tool calls - Removed
- **Note**: Adobe PDF Services extraction remains (not AI, just document parsing)

### Subscription Management (Migrated December 2025)
- Stripe subscription management - Migrated to remote API
- Subscription middleware - Removed
- Subscription service - Removed
- See: `docs/archive/stripe/` for Stripe-related docs

### Organization Management (Migrated December 2025)
- Local `members` table - Removed (handled by remote API)
- Local `invitations` table - Removed (handled by remote API)
- API token management - Removed entirely
- See: `docs/archive/organization/` for organization-related docs

### Matters & Notifications (Migrated to staging-api)
- Matters management - Migrated to staging-api (except conversation-related matter creation)
- Notification system - Migrated to staging-api
- See: `docs/archive/misc/matter-plan.md` and `docs/archive/misc/notification-implementation-plan.md`

### Test Coverage Analysis (Legacy Worker Tests)
- Test coverage gap analysis for subscription sync, Stripe webhooks, and feature guard tests
- These tests covered functionality that has been migrated to staging-api or removed
- See: `docs/archive/misc/test-coverage-gap-analysis.md`

### Current Status

**Active Documentation:**
- `docs/engineering/2025-11-29-FRONTEND_API_IMPLEMENTATION.md` - Frontend API guide

**Archived Documentation:**
- `docs/archive/stripe/` - Stripe/Subscription architecture (migrated to remote API)
- `docs/archive/organization/` - Organization architecture (migrated to remote API)
- `docs/archive/i18n/` - Internationalization planning docs
- `docs/archive/misc/` - Miscellaneous archived docs (matters, notifications, etc.)

## Migration Notes

### December 2025 - Major Simplification
- Removed all AI features (agent, summarization, analysis)
- Migrated subscription management to remote API
- Migrated organization/member management to remote API
- Migrated matters management to staging-api (except conversation-related matter creation)
- Migrated notification system to staging-api
- Removed API token functionality
- Worker now focuses on chatbot-specific functionality only (conversations/chat, file uploads, agent streaming)

Current Worker responsibilities are described inline within each active document (primarily the Frontend API guide).
