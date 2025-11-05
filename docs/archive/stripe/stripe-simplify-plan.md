# Stripe Billing Simplification Plan

> **Note:** Architecture and operational guidance now live in `docs/stripe-architecture.md`. This document is retained as historical context for the implementation plan.

## Objectives
- Trust the Better Auth + Stripe webhook integration as the single subscription source of truth.
- Remove bespoke “Stripe sync” KV/cache layers and the `/api/subscription/sync` fallback.
- Clarify organization lifecycle so personal vs business entitlements are explicit for every request.

## Current Friction
- KV-backed cache plus manual sync endpoint duplicates webhook responsibilities and falls out of date.
- `SubscriptionService.ts` mutates organizations directly, coupling billing updates to business logic.
- Frontend hooks read subscription status from multiple sources, which drifts during upgrades/cancellations.

## Phase 1 – Organization Entitlement Layer
✅ Extend `OrganizationService`/`UsageService` to surface `kind` (`personal` or `business`) and `subscriptionStatus`.
✅ Gate REST endpoints (invites, deletion, API token management) using feature guards that require `requireNonPersonal`.
⬜ Add/playwright coverage that provisions a user, confirms they get a personal org, and verifies restricted actions fail (blocked on persistent Playwright fixes).

## Phase 2 – Stripe State Simplification
**Current progress**
- D1 is now the sole source-of-truth: subscription persistence helpers write/read from `subscriptions` and update organizations without touching KV.
- Explicit support for Stripe’s `paused` state ensures entitlement checks reflect Billing Portal actions.
- `/api/subscription/sync` has been reduced to a reconciliation endpoint that only refreshes an existing record.
- Stripe webhooks are accepted at `/api/stripe/webhook`, which verifies signatures and drives `SubscriptionService` to keep D1 in sync (created/updated/deleted/paused events).

**Next steps**
1. Expand webhook integration tests to cover paused/canceled/resumed states end-to-end (event → D1 → entitlement).
2. Replace any remaining UI/worker callers that still rely on KV-backed helpers with the new D1 helpers (e.g., subscription guard, frontend polling).
3. Tighten logging/observability around webhook failures so retries are actionable (e.g., structured logs, metrics).
4. Migrate frontend and admin tooling to the new reconciliation endpoint (if needed) and document the webhook-first flow for operations.

## Phase 3 – UI & Follow-Up
- ✅ Frontend hooks (`useOrganizationManagement`, `usePaymentUpgrade`) now rely on the backend entitlement model (`kind`, `subscriptionStatus`) instead of raw tiers.
- ✅ Upgrade flows mark organizations as business once Stripe reports an active/trial/paused subscription; cart, account, and onboarding screens all respect the entitlement helpers.
- ⬜ Remaining polish: update any legacy plan badges/copy to use the shared helpers and consider bespoke UI messaging for paused or past-due states.

## Risks & Mitigations
- Webhook delays: mark subscriptions as `pending` until webhook confirmation, keep reconcile script for emergencies.
- Legacy consumers: migrate all KV consumers before removing files; add lint/test guard to prevent reintroduction.
- Capability regressions: rely on new integration tests and feature guard coverage before merging.
