# ADR 0001: Webhook-first billing with D1 snapshot

- Date: 2025-11-04
- Status: accepted

## Context
Stripe is the source of billing truth. We need fast entitlement checks and consistent lifecycle handling without ad-hoc sync endpoints.

## Decision
- Use Stripe webhooks as the integration point for subscription lifecycle.
- Persist a normalized subscription snapshot in D1 for entitlement checks.
- Avoid KV; use D1 tables for `organizations` and `subscriptions`.
- Keep a minimal admin-only reconciliation endpoint to refresh a known subscription id.

## Consequences
- Entitlements can be evaluated entirely from D1.
- Webhook reliability and logging become critical.
- Removes need for bespoke "sync" flows and reduces metadata coupling.

## Links
- Canonical: ../stripe-architecture.md
- Supersedes: ../archive/stripe/stripe-simplify-plan.md, ../archive/stripe/subscription-change-cancel-plan.md
- Related: tests/integration/api/stripe.webhook.test.ts
