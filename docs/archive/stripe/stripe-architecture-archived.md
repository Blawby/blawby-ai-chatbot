# Stripe Architecture Overview

> **⚠️ ARCHIVED**: This document describes the previous local Stripe integration architecture. As of the frontend-only migration (2025-11-28), all Stripe functionality (webhooks, subscriptions, payments) is now handled by the remote API at `staging-api.blawby.com`. This document is kept for historical reference only.

## Migration Status

- **Date Archived**: 2025-11-28
- **Reason**: Frontend-only migration - Stripe functionality moved to remote API
- **Current Architecture**: All Stripe operations (webhooks, subscriptions, payments) are handled by `staging-api.blawby.com`
- **Local Worker**: Only handles chatbot functionality (agent/stream, sessions, files, analyze)

## Previous Architecture (Archived)

The following sections describe the previous local implementation:

## 1. High-Level Objectives
- Treat Stripe as the source of billing truth while persisting the subscription snapshot in D1 for fast entitlement checks.
- Funnel every subscription change through webhooks so the Worker is eventually consistent without manual "sync" endpoints.
- Keep organization metadata (tier, seats, kind) authoritative in D1 so the UI can enforce entitlements without hitting Stripe.

## 2. Runtime Flow (Historical)

| Step | Component | Notes |
|------|-----------|-------|
| 1 | Better Auth Stripe plugin | Created Checkout sessions & billing portal links. `usePaymentUpgrade` injected `organizationId` into `subscription_data.metadata`, session metadata, and `client_reference_id` before launching Checkout, ensuring webhooks could resolve the org. Emitted hooks used only as fire-and-forget—not as the source of truth. |
| 2 | Stripe Webhook (`POST /api/stripe/webhook`) | Verified signature, resolved the organization (metadata → subscription id → customer id), and delegated to `SubscriptionService`. Handled `created`, `updated`, `deleted`, `paused`, `resumed`, `trial_will_end`. |
| 3 | `SubscriptionService` | Upserted into `subscriptions`, updated the organization row (tier, seats, `is_personal → false` for paid plans), and produced a normalized snapshot. No KV usage. |
| 4 | Entitlement checks | Frontend hooks & worker middleware read from D1 (`organizations`, `subscriptions`) to detect business vs personal capabilities. |
| 5 | Manual reconciliation | `/api/subscription/sync` was an admin-only reconcile endpoint that re-fetched a known Stripe subscription id. No guesses, no metadata mutations. |

## 3. Data Model (Historical)

### `subscriptions` table (D1) - REMOVED
This table was removed during migration. Subscription data is now managed by the remote API.

### `organizations` table
- `subscription_tier` was a display hint (free/business/enterprise). Note: Enterprise was future/disabled; only Free and Business tiers were live in the UI.
- `kind` in the code was derived: `business` whenever `subscriptionStatus` indicated an active/pending paid plan.
- `is_personal` was enforced: webhook transitions flipped it to `0` for paid plans so entitlement guards locked/unlocked features.

## 4. API Surface - ALL REMOVED

All Stripe-related endpoints have been removed:
- `POST /api/stripe/webhook` - Removed (handled by remote API)
- `POST /api/subscription/sync` - Removed (handled by remote API)
- `POST /api/subscription/cancel` - Removed (handled by remote API)
- Billing portal / Checkout - Handled by remote API

## 5. Frontend Consumption (Historical)

Previously, frontend consumed local endpoints:
- `usePaymentUpgrade` - Called local checkout/billing portal endpoints
- `useOrganizationManagement` - Read subscription status from local D1 database
- Subscription utilities - Read from local D1 `subscriptions` table

**Current (Post-Migration)**: Frontend now calls remote API endpoints for all Stripe/subscription operations.

## 6. Operational Notes (Historical)

- **Previous**: Required secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `ENABLE_STRIPE_SUBSCRIPTIONS`
- **Previous Testing**: Worker integration tests mocked Stripe SDK and hit webhook/reconciliation endpoints (`tests/integration/api/stripe.webhook.test.ts`, `tests/integration/api/subscription.sync.test.ts`). E2E Playwright tests covered upgrade flows via cart, account, onboarding.
- **Previous Observability**: Stripe webhook handler logged signature failures, missing organization resolution, and D1 persistence errors with actionable context.

**Current (Post-Migration)**: All Stripe operations handled by remote API at `staging-api.blawby.com`. Stripe-related tests removed. Webhook handling and logging now in remote API.

## 7. Migration Notes

For developers working on the codebase:
- Payment processing in `worker/agents/legal-intake/index.ts` has TODO comments for remote API integration
- Organization subscription status is fetched via `RemoteApiService.getSubscriptionStatus()`
- Feature guards use `RemoteApiService.getPracticeMetadata()` to check entitlements
