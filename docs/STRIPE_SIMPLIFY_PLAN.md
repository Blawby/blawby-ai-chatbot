# Stripe Billing Simplification Plan

## Objectives
- Trust the Better Auth + Stripe webhook integration as the single subscription source of truth.
- Remove bespoke “Stripe sync” KV/cache layers and the `/api/subscription/sync` fallback.
- Clarify organization lifecycle so personal vs business entitlements are explicit for every request.

## Current Friction
- KV-backed cache plus manual sync endpoint duplicates webhook responsibilities and falls out of date.
- `StripeSync.ts` mutates organizations directly, coupling billing updates to business logic.
- Frontend hooks read subscription status from multiple sources, which drifts during upgrades/cancellations.

## Phase 1 – Organization Entitlement Layer
1. Extend `OrganizationService`/`UsageService` to surface `kind` (`personal` or `business`) and `subscriptionStatus`.
2. Gate REST endpoints (invites, deletion, API token management) using feature guards that require `requireNonPersonal`.
3. Add an integration test that provisions a new user, confirms they get a personal org, and verifies restricted actions fail.

## Phase 2 – Stripe State Simplification
1. Replace KV cache reads with a helper that joins `organizations` + `subscriptions` for current tier/status.
2. Delete `worker/services/StripeSync.ts`, KV helpers, and `/api/subscription/sync`; keep a tiny admin reconcile script if needed.
3. Update tests/docs to reflect webhook-driven updates; ensure any CLI/manual tools call the new helper.

## Phase 3 – UI & Follow-Up
1. Update frontend hooks (`useOrganizationManagement`, `usePaymentUpgrade`, etc.) to consume the entitlement model.
2. Ensure upgrade flows flip `isPersonal → false` and set `kind='business'` once Stripe reports an active subscription.
3. Audit onboarding/cart components for legacy sync logic and remove unused code paths.

## Risks & Mitigations
- Webhook delays: mark subscriptions as `pending` until webhook confirmation, keep reconcile script for emergencies.
- Legacy consumers: migrate all KV consumers before removing files; add lint/test guard to prevent reintroduction.
- Capability regressions: rely on new integration tests and feature guard coverage before merging.
