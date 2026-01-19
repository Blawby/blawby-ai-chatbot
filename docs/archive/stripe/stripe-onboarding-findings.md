# Stripe Subscription + Business Onboarding Findings

## Summary

- Stripe checkout and webhooks fire correctly locally (200 responses).
- Better Auth Stripe plugin calls `onSubscriptionComplete`, but no row appears in `subscriptions` and org tier doesn’t flip.
- `/api/subscription/sync` fails to locate a subscription and returns “No active Stripe subscription found”.
- Manual DB edits were needed to link the subscription and upgrade the org.

## Confirmed Issues

1) Subscriptions not persisted automatically
- Symptom: No `subscriptions` row after `customer.subscription.created` / `checkout.session.completed`.
- Impact: Sync can’t find subscription; org remains `free`.

2) Membership/owner 403 on sync
- Symptom: 403 “User is not a member of this organization” when syncing the correct org.
- Cause: Personal org existed, but the `members` row did not always exist for the signed-in user; or org mismatch in session.

3) Webhook signature failures (production path)
- Symptom: “No signatures found matching the expected signature” on `ai.blawby.com` tail logs.
- Causes: Wrong `STRIPE_WEBHOOK_SECRET`, or webhook route not receiving raw body.

## Root Causes (most likely)

- The plugin callback didn’t persist to our custom `subscriptions` table; the project relies on explicit writes.
- Existing personal org path did not guarantee a membership row.
- Active-organization mismatch pre-checkout could point the plugin at a different org during authorization.
- Production endpoint attempted to parse request body before Better Auth handled signature verification.

## Fixes Implemented

1) Explicit subscription persistence (worker/auth/index.ts)
- In `onSubscriptionComplete` and `onSubscriptionUpdate`:
  - Upsert to `subscriptions` by `stripe_subscription_id`.
  - Update `organizations.subscription_tier` (and seats, stripe_customer_id) when status is `active`.
  - Structured success/error logging.

2) Ensure personal org owner membership (worker/services/OrganizationService.ts)
- When returning an existing personal org, ensure an owner `members` row exists (idempotent insert).

3) Sync fallback upsert (worker/routes/subscription.ts)
- If the client supplies `stripeSubscriptionId` but no local row exists:
  - Retrieve from Stripe and upsert a local `subscriptions` row.
  - Update org to `business` if status is `active`.

4) Session/org alignment (previously added)
- Better Auth's `POST /organization/set-active` endpoint (via `authClient.organization.setActive`) now manages the active org.
- Cart sets active org before initiating checkout.

## Still Recommended

- Ensure `/api/auth/*` routes receive the raw request body (webhook signature): place the Better Auth handler before any body parsing.
- Add `onWebhookReceived` / `onWebhookError` logs for future triage.
- Document local dev steps for Stripe:
  - `stripe listen --forward-to http://localhost:8787/api/auth/stripe/webhook`
  - Set `worker/.dev.vars`: `STRIPE_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, `ENABLE_STRIPE_SUBSCRIPTIONS=true`, `BETTER_AUTH_URL=http://localhost:8787`.

## Validation Checklist

- Sign up → Cart → Continue → Complete payment → Redirect to `/business-onboarding`:
  - `subscriptions.reference_id` equals the org id
  - `organizations.subscription_tier` is `business` and seats match
  - `/api/subscription/sync` returns `{ synced: true }`
  - Onboarding page loads; completing sets `business_onboarding_completed_at`

## Log Excerpts (examples)

- `🔔 onSubscriptionComplete { referenceId: <orgId>, stripeSubscriptionId: <sub_...>, status: active }`
- `✅ Subscription persisted (complete): { success: true, changes: 1 }`
- `✅ Organization tier updated (complete): { success: true, changes: 1, organizationId: <orgId> }`
