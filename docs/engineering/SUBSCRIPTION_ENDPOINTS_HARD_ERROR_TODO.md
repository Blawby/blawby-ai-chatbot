# Subscription Endpoints Integration Notes

## Source of Truth
- Billing/subscription data comes from Stripe via Better Auth backend endpoints.
- Frontend consumes backend subscription payloads directly.
- Worker proxies subscription endpoints to backend.

## Active Endpoints

### `/api/subscriptions/current`
- Purpose:
  - Return current subscription state for the active org/reference.
  - Includes plan metadata and lifecycle status needed by account/cart/pricing UI.
- Frontend usage:
  - `src/features/settings/pages/AccountPage.tsx`
  - `src/features/cart/pages/CartPage.tsx`
  - `src/features/pricing/components/PricingView.tsx`
- Worker proxy path:
  - `worker/index.ts`
  - `worker/routes/authProxy.ts`

### `/api/subscriptions/plans`
- Purpose:
  - Return available subscription plans and Stripe price/product metadata.
- Frontend usage:
  - `src/shared/utils/fetchPlans.ts`
  - `src/features/cart/pages/CartPage.tsx`
  - `src/features/pricing/components/PricingView.tsx`
- Worker proxy path:
  - `worker/index.ts`
  - `worker/routes/authProxy.ts`

## Backend Response Contract Required by Frontend

### `/api/subscriptions/current`
- Required fields:
  - `subscription.status`
  - `subscription.plan.id`
  - `subscription.plan.name` and/or `subscription.plan.display_name`
- Additional fields used when present:
  - `subscription.current_period_end`
  - `subscription.cancel_at_period_end`
  - `subscription.plan.features`
  - `subscription.plan.stripe_product_id`
  - `subscription.plan.stripe_monthly_price_id`
  - `subscription.plan.stripe_yearly_price_id`
  - `subscription.plan.monthly_price`
  - `subscription.plan.yearly_price`
  - `subscription.plan.currency`

### `/api/subscriptions/plans`
- Required fields per plan:
  - `id`
  - `name` and/or `display_name`
  - `stripe_product_id`
  - `stripe_monthly_price_id`
  - `monthly_price`
  - `currency`
  - `is_active`
  - `is_public`
- Optional fields used when present:
  - `stripe_yearly_price_id`
  - `yearly_price`
  - `features`
  - `description`

## Current Model
- One paid practice product (Stripe-backed).
- Public/client experiences are non-billing views.
- Upgrade and management flows are rendered from backend-provided Stripe plan/subscription data.

## Remaining Follow-ups
- Backend:
  - Keep contract fields stable and documented for frontend consumers.
  - Ensure `/api/subscriptions/current` always includes plan identity for subscribed orgs.
- Frontend:
  - Maintain hard-error behavior when required contract fields are missing.
  - Optionally centralize `/api/subscriptions/current` fetch into a shared store to reduce duplicate page-level calls.
- Worker:
  - Optional: add structured diagnostics around subscription proxy failures for easier debugging.
