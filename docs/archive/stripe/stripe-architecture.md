# Stripe Architecture Overview

> **⚠️ ARCHIVED**: This document describes the previous local Stripe integration architecture. As of December 2025, all Stripe functionality (webhooks, subscriptions, payments) has been removed from the Worker and is now handled by the remote API at `staging-api.blawby.com`. This document is kept for historical reference only.

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

## 2. Runtime Flow

| Step | Component | Notes |
|------|-----------|-------|
| 1 | Better Auth Stripe plugin | Creates Checkout sessions & billing portal links. `usePaymentUpgrade` injects `organizationId` into `subscription_data.metadata`, session metadata, and `client_reference_id` before launching Checkout, ensuring webhooks can resolve the org. Emits hooks we use only as fire-and-forget—not as the source of truth. |
| 2 | Stripe Webhook (`POST /api/stripe/webhook`) | Verifies signature, resolves the organization (metadata → subscription id → customer id), and delegates to `SubscriptionService`. Handles `created`, `updated`, `deleted`, `paused`, `resumed`, `trial_will_end`. |
| 3 | `SubscriptionService` | Upserts into `subscriptions`, updates the organization row (tier, seats, `is_personal → false` for paid plans), and produces a normalized snapshot. No KV usage. |
| 4 | Entitlement checks | Frontend hooks & worker middleware read from D1 (`organizations`, `subscriptions`) to detect business vs personal capabilities. |
| 5 | Manual reconciliation | `/api/subscription/sync` remains as an admin-only reconcile endpoint that just re-fetches a known Stripe subscription id. No guesses, no metadata mutations. |

## 3. Data Model

### `subscriptions` table (D1) - REMOVED
This table was removed during migration. Subscription data is now managed by the remote API.

### `organizations` table
- `subscription_tier` becomes a display hint (free/business/enterprise). Note: Enterprise is future/disabled; only Free and Business tiers are currently live in the UI.
- `kind` in the code is derived: `business` whenever `subscriptionStatus` indicates an active/pending paid plan.
- `is_personal` is enforced: webhook transitions flip it to `0` for paid plans so entitlement guards lock/unlock features.

## 4. API Surface - ALL REMOVED

All Stripe-related endpoints have been removed:
- `POST /api/stripe/webhook` - Removed (handled by remote API)
- `POST /api/subscription/sync` - Removed (handled by remote API)
- `POST /api/subscription/cancel` - Removed (handled by remote API)
- Billing portal / Checkout - Handled by remote API

## 5. Frontend Consumption

Frontend now calls remote API endpoints for all Stripe/subscription operations:
- `usePaymentUpgrade` - Calls remote API for checkout/billing portal
- `useOrganizationManagement` - Fetches subscription status from remote API
- Subscription utilities - Read from remote API responses

## 6. Operational Notes

- **Current**: All Stripe operations handled by remote API at `staging-api.blawby.com`
- **Testing**: Stripe-related tests removed (handled by remote API)
- **Observability**: Stripe webhook handling and logging now in remote API

## 7. Migration Notes

For developers working on the codebase:
- Payment processing in `worker/agents/legal-intake/index.ts` has TODO comments for remote API integration
- Organization subscription status is fetched via `RemoteApiService.getSubscriptionStatus()`
- Feature guards use `RemoteApiService.getOrganizationMetadata()` to check entitlements
