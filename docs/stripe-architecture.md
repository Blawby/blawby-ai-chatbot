# Stripe Architecture Overview

## 1. High-Level Objectives
- Treat Stripe as the source of billing truth while persisting the subscription snapshot in D1 for fast entitlement checks.
- Funnel every subscription change through webhooks so the Worker is eventually consistent without manual “sync” endpoints.
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

### `subscriptions` table (D1)
| Column | Purpose |
|--------|---------|
| `reference_id` | Organization id (foreign key). |
| `stripe_subscription_id` | Links back to Stripe—used for webhook reconciliation. |
| `plan` | Stripe price nickname/id (used for display). |
| `status` | Normalized lifecycle (`active`, `trialing`, `paused`, etc.). |
| `seats`, `period_start`, `period_end`, `cancel_at_period_end` | Used for entitlements and renewal UI. |

### `organizations` table
- `subscription_tier` becomes a display hint (free/business/enterprise). Note: Enterprise is future/disabled; only Free and Business tiers are currently live in the UI.
- `kind` in the code is derived: `business` whenever `subscriptionStatus` indicates an active/pending paid plan.
- `is_personal` is enforced: webhook transitions flip it to `0` for paid plans so entitlement guards lock/unlock features.

## 4. API Surface

| Endpoint | Purpose |
|----------|---------|
| `POST /api/stripe/webhook` | Primary integration point. Only responsibility is to persist D1 state. |
| `POST /api/subscription/sync` | Admin-only reconciliation refreshing an existing subscription id. Returns a snapshot of the D1 record. |
| `POST /api/subscription/cancel` | Calls Stripe’s cancel API and immediately updates local state through `SubscriptionService`. |
| Billing portal / Checkout | Still emitted via Better Auth plugin, but entitlement checks rely on the D1 snapshot. |

## 5. Frontend Consumption

Hook/utility | Behavior
-------------|---------
`useOrganizationManagement` | Normalizes each organization with `kind`, `isPersonal`, and `subscriptionStatus` so downstream components can enforce entitlements.
`subscription` utilities (`describeSubscriptionPlan`, `hasManagedSubscription`, etc.) | Shared helpers used by cart, account page, onboarding, and notifications to display status-aware messaging.
`usePaymentUpgrade` | Sends users to billing portal when `hasManagedSubscription` is true; otherwise goes to checkout. Handles Better Auth error codes and entitlements consistently.

## 6. Operational Notes

- Required secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `ENABLE_STRIPE_SUBSCRIPTIONS`.
- Testing: worker integration tests mock Stripe SDK and hit webhook/reconciliation endpoints (`tests/integration/api/stripe.webhook.test.ts`, `tests/integration/api/subscription.sync.test.ts`). E2E Playwright tests cover upgrade flows via cart, account, onboarding.
- Observability: Stripe webhook handler logs signature failures, missing organization resolution, and D1 persistence errors with actionable context.

## 7. Known Limitations / Next Steps

1. Expand webhook tests to cover edge states (`paused`, `past_due`, `resumed`).
2. Improve logging/metrics for webhook retries (e.g., push to a central logging system or expose counters).
3. Document the reconciliation command for support engineers (CLI/admin UI) if Stripe & D1 drift.
4. Audit legacy copy/badges to ensure all plan status messaging uses the shared helpers.
