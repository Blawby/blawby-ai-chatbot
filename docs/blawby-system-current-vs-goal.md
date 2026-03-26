# Blawby System Current vs Goal

This document is the high-level reference Kaze can use to re-orient on the current flow and the intended product direction across this repo and the sibling `blawby-backend` repo.

Mermaid source: [blawby-system-current-vs-goal.mmd](./blawby-system-current-vs-goal.mmd)

## Scope

This is a snapshot of how the system is set up today based on the current code in:

- this repo
- the sibling `blawby-backend` repo

This is intentionally high level. It is meant to answer:

- What does the worker own today?
- What does the backend own today?
- What fields currently exist on intakes and matters that affect flow?
- What are we trying to become?
- What pieces are still missing or only partially implemented?

## Current Setup

Today the system is split into three main layers:

1. Cloudflare Pages + Preact frontend
2. Cloudflare Worker as the edge/realtime layer
3. Railway/Node backend as the durable business system

At a high level:

- The frontend talks same-origin to the worker.
- The worker handles conversations, realtime chat, AI routes, file/media helpers, and notification queueing.
- The worker proxies most business endpoints to the backend.
- The backend is the source of truth for auth, practices, intakes, matters, subscriptions, uploads, invoices, onboarding, user details, and most Stripe-backed business logic.

### Repo Roles

`blawby-ai-chatbot` currently owns:

- Preact UI and routing
- Widget/public chat experience
- Cloudflare worker routing
- Realtime conversations and WebSocket chat
- Local conversation persistence and edge-side chat infrastructure
- Some notification delivery plumbing
- Proxy boundary to the backend

`blawby-backend` currently owns:

- Auth and organization/practice data
- Practice client intakes
- Matters and matter subresources
- Invoices and payment routing logic
- Stripe Connect onboarding
- Subscription plans and metered billing integration points
- Email templates and Graphile Worker job processing
- Core Postgres-backed business state

## Worker vs Backend Boundary Today

The current worker boundary is explicit in [worker/index.ts](../worker/index.ts).

Worker-local responsibilities:

- `/api/conversations`
- `/api/ai/chat`
- `/api/ai/intent`
- `/api/ai/extract-website`
- `/api/tools/search`
- `/api/files`
- `/api/pdf`
- `/api/notifications`
- `/api/status`
- widget bootstrap/config/practice detail helpers

Backend-proxied responsibilities:

- `/api/onboarding`
- `/api/matters`
- `/api/invoices`
- `/api/practice/client-intakes`
- `/api/user-details`
- `/api/practice/*` except worker-local practice details helpers
- `/api/preferences`
- `/api/subscriptions`
- `/api/subscription`
- `/api/uploads`
- `/api/auth`

That means the worker is not the long-term source of truth for matters or intakes. It is the edge communication/orchestration layer, while the backend is the durable business layer.

## Current Matter Fields

The matter schema in [matters.schema.ts](../../blawby-backend/src/modules/matters/database/schema/matters.schema.ts) currently includes these main groups of fields.

Identity and linkage:

- `id`
- `organization_id`
- `client_id`
- `practice_service_id`
- `conversation_id`
- `intake_uuid`
- `on_behalf_of`

Core matter info:

- `title`
- `description`
- `case_number`
- `matter_type`

Billing config:

- `billing_type`
- `total_fixed_price`
- `contingency_percentage`
- `settlement_amount`
- `admin_hourly_rate`
- `attorney_hourly_rate`
- `payment_frequency`
- `retainer_balance`

Status and urgency:

- `status`
- `urgency`

Attorney assignment:

- `responsible_attorney_id`
- `originating_attorney_id`

Court/opposing-party context:

- `court`
- `judge`
- `opposing_party`
- `opposing_counsel`

Lifecycle:

- `open_date`
- `close_date`
- `deleted_at`
- `deleted_by`
- `created_at`
- `updated_at`

Also in practice, matters already have related subresources and workflows for:

- notes
- milestones
- tasks
- time entries
- expenses
- activity history
- invoices/billing transactions
- assignees

## Current Intake Fields

The intake schema in [practice-client-intakes.schema.ts](../../blawby-backend/src/modules/practice-client-intakes/database/schema/practice-client-intakes.schema.ts) currently includes these main groups of fields.

Identity and linkage:

- `id`
- `organization_id`
- `connected_account_id`
- `address_id`
- `conversation_id`

Stripe/payment linkage:

- `stripe_payment_link_id`
- `stripe_payment_intent_id`
- `stripe_charge_id`
- `stripe_checkout_session_id`

Money and state:

- `amount`
- `application_fee`
- `currency`
- `status`
- `triage_status`
- `triage_reason`
- `triage_decided_at`
- `succeeded_at`

Metadata and contact info:

- `metadata.email`
- `metadata.name`
- `metadata.phone`
- `metadata.user_id`
- `metadata.on_behalf_of`
- `metadata.opposing_party`
- `metadata.opposing_counsel`
- `metadata.description`
- `metadata.address`

AI/triage signals:

- `urgency`
- `desired_outcome`
- `court_date`
- `has_documents`
- `income`
- `household_size`
- `case_strength`

Tracking:

- `client_ip`
- `user_agent`
- `created_at`
- `updated_at`

## Current Lead to Matter Flow

Today the flow is roughly:

1. A prospect starts in the widget or chat flow handled by the worker.
2. The worker owns the conversation and realtime experience.
3. An intake record is created in the backend and can include the `conversation_id`.
4. Stripe payment link or checkout session can be created for the intake.
5. The practice reviews the intake and sets triage to `accepted` or `declined`.
6. Only a successful intake with `triage_status = accepted` can be converted to a matter.
7. Matter creation carries over intake linkage and selected intake metadata.

That conversion path exists in [practice-client-intakes.service.ts](../../blawby-backend/src/modules/practice-client-intakes/services/practice-client-intakes.service.ts), but it is not yet the same thing as a fully automated Intercom-style lead pipeline.

## Billing and Payments Today

What exists today:

- Stripe Connect onboarding exists in the backend.
- Intakes can generate Stripe payment links or checkout sessions.
- Subscriptions and Better Auth Stripe integration exist.
- Metered item support exists in subscription/Stripe plugin code.
- Invoices and legal-billing-aware fund routing exist.
- Email templates exist for payment receipts, payment requests, refunds, onboarding, payouts, invitations, and auth flows.

What is important to call out:

- The current fund router explicitly sets application fee calculation to `0` in [fund-router.service.ts](../../blawby-backend/src/modules/invoices/services/fund-router.service.ts).
- The comments there say platform fees are intended to be billed through metered usage after payment settlement, not deducted as an immediate Stripe application fee in the current model.

## Notifications and Messaging Today

Today notifications are split:

- Conversation/realtime and some notification delivery logic live in the worker.
- The worker has notification queue processing and OneSignal delivery plumbing.
- The backend has email templates and Graphile Worker job processing.

This means the platform already has pieces for:

- realtime conversation updates
- some practice/team notifications
- email templates for payment and onboarding events

But it is still not one fully unified event matrix across:

- prospects
- clients
- practices
- practice team members
- conversations
- leads/intakes
- matter updates
- invoices/payments
- payout events

## Goal State

The target product direction is:

- Blawby should feel like Intercom for lawyers, not just a chatbot plus practice manager.
- Conversations should naturally become leads, then intakes, then matters, with minimal manual stitching.
- Payments should be native to that flow through Stripe Connect.
- Blawby should monetize platform payment volume through a consistent `1.337%` fee model.
- Billing should support rolling deposits and payout timing without hiding legal/accounting constraints.
- Reminders and follow-ups should be automated.
- Email notifications should be coherent across all users and lifecycle stages.

Operationally, the desired architecture is still close to the current split:

- Worker owns edge chat, realtime, lightweight orchestration, and maybe some notification fanout.
- Backend owns durable workflow truth, business rules, Stripe orchestration, automation, and reporting/reconciliation.

## Missing Pieces

These are the biggest gaps between current code and the target product.

### 1. Fully automated lead-to-matter orchestration

Current state:

- conversation exists in worker
- intake exists in backend
- matter conversion exists in backend

Missing:

- a clean event-driven pipeline that automatically advances qualified leads through intake review, acceptance rules, matter creation, assignee setup, and billing setup

### 2. Platform fee reconciliation

Current state:

- payment events already flow through the backend and are reflected in intake and billing records
- subscription and Stripe integration already exist in the backend

Missing:

- reconciliation between payment events, platform revenue, and subscription/metered charges
- explicit handling for rolling deposits and payout timing

### 3. Automated billing reminders and collections workflow

Current state:

- invoices and payment templates exist
- Stripe and worker jobs exist

Missing:

- clear automated reminder schedules
- overdue/dunning workflow
- retry and follow-up policy tied to invoices/intakes/matters
- visibility into reminder state and payment collection health

### 4. Unified notifications model

Current state:

- worker can deliver notifications
- backend can render/send email templates

Missing:

- one shared event taxonomy
- audience rules for prospect/client/practice/team
- cross-channel consistency between in-app, push, and email
- source-of-truth ownership for notification preferences and auditability

### 5. Shared documentation of system boundaries and flow

Current state:

- the code reflects the split correctly
- the context lives across two repos

Missing:

- one maintained architecture/flow reference that everyone can use when adding fields and workflows

## Source Notes

This document was derived directly from current code, especially:

- [worker/index.ts](../worker/index.ts)
- [src/config/urls.ts](../src/config/urls.ts)
- [practice-client-intakes.service.ts](../../blawby-backend/src/modules/practice-client-intakes/services/practice-client-intakes.service.ts)
- [practice-client-intakes.schema.ts](../../blawby-backend/src/modules/practice-client-intakes/database/schema/practice-client-intakes.schema.ts)
- [matters.schema.ts](../../blawby-backend/src/modules/matters/database/schema/matters.schema.ts)
- [matters.service.ts](../../blawby-backend/src/modules/matters/services/matters.service.ts)
- [fund-router.service.ts](../../blawby-backend/src/modules/invoices/services/fund-router.service.ts)
- [stripe.config.ts](../../blawby-backend/src/shared/auth/plugins/stripe.config.ts)
- [SYSTEM_ARCHITECTURE.md](../../blawby-backend/docs/SYSTEM_ARCHITECTURE.md)
