# ADR 0002: Organization entitlement model (personal → business)

- Date: 2025-11-04
- Status: accepted

## Context
Every user should have a personal org. Business features must unlock when a paid subscription is active/trial/paused.

## Decision
- Provision a personal org on signup; ensure `active_organization_id` on session.
- Flip to business when Stripe reports paid/paused; set `is_personal = 0`, update `seats` and `subscription_tier`.
- Enforce access via centralized feature guards reading D1 (`organizations`, `subscriptions`).

## Consequences
- Consistent entitlement checks across API and UI.
- Clear separation of personal vs business capabilities.

## Links
- Canonical: ../organization-architecture.md
- Related: worker/middleware/featureGuard.ts, worker/routes/stripeWebhook.ts, worker/routes/organizations.ts
