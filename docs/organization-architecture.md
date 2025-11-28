# Organization Architecture Overview

## 1. Goals
- Provision a personal organization for every new user automatically via authentication hooks.
- Flip organizations to `kind='business'` (and unlock team features) once Stripe reports an active/trial/paused subscription.
- Enforce entitlements consistently across API and UI so personal orgs never access business-only capabilities.

## 2. Lifecycle

| Stage | Component | Notes |
|-------|-----------|-------|
| Signup | Remote auth server | Handled by remote Better Auth server. Personal org creation happens via webhooks or remote server hooks. |
| Session creation | Remote auth server | Session management handled by remote Better Auth server. Worker validates tokens via remote API. |
| Upgrade | Checkout flow → Stripe webhook (`/api/stripe/webhook`) | `usePaymentUpgrade` seeds the organization ID via `subscription_data.metadata` before launching Checkout, ensuring webhooks can resolve the org without guessing. The webhook then moves the org to business, updates seats, flips `is_personal` to `0`, and persists subscription metadata in D1. |
| Entitlements | Feature guards (`worker/middleware/featureGuard.ts`) | Checks `tier`, `isPersonal`, and `subscriptionStatus` before allowing access to APIs (tokens, invitations, etc.). |
| Onboarding | `BusinessOnboardingPage` | Accessible only for business orgs with subscription status `active`, `trialing`, or `paused`. |

## 3. Data Model

### `organizations`
Field | Description
------|-----------
`is_personal` | `1` for personal orgs. Set to `0` after a paid upgrade via the webhook.
`subscription_tier` | Used for display (`free`, `business`, `enterprise`), derived from subscription status. Note: Enterprise is future/disabled; only Free and Business tiers are currently live in the UI.
`kind` | In code we derive `business` vs `personal`; fallbacks for legacy rows use `is_personal`.
`stripe_customer_id` | Set after upgrade; allows Stripe → org resolution.
`config` | Stores workspace settings, notifications, etc.

### `members`
- Owner membership is provisioned automatically for personal orgs.
- Invitations and role changes require a business org and pass through feature guards.

## 4. API & Middleware

Component | Responsibility
----------|----------------
`worker/routes/organizations.ts` | CRUD, invitations, ensure-personal endpoint. Protects business features behind owner checks + entitlement gates.
`worker/middleware/featureGuard.ts` | Centralized entitlement logic (min tier, `requireNonPersonal`, quota enforcement).
`worker/routes/subscription.ts` | Admin reconciliation + cancellation endpoints (owner-only).
`worker/routes/stripeWebhook.ts` | Persists subscription lifecycle events and updates organization metadata.

## 5. Frontend Consumption

| Hook/Component | Notes |
|----------------|-------|
| `useOrganizationManagement` | Normalizes each org with `kind`, `isPersonal`, `subscriptionStatus`, `subscriptionTier`, `seats`. |
| `usePaymentUpgrade` | Uses entitlement helpers to decide between checkout and billing portal paths. |
| `CartPage`, `AccountPage`, `BusinessOnboardingPage` | Display plan labels and guard UX flows via shared helpers (`describeSubscriptionPlan`, `hasManagedSubscription`). |
| `PricingModal`, `Settings` | React to the entitlement model so personal orgs see upgrade CTAs while business orgs get management actions. |

## 6. Testing
- **Worker integration**: `tests/integration/api/subscription.sync.test.ts` (reconciliation), `tests/integration/api/stripe.webhook.test.ts` (webhook effects). Auth testing now requires remote auth server.
- **Playwright**: `tests/e2e/auth.spec.ts`, onboarding/cart flows ensure UI mirrors entitlements.
- **Unit**: entitlement utilities (`src/utils/subscription.ts`) can be unit-tested directly.

## 7. Known Gaps / Future Ideas
1. Add integration coverage for invitation routes to confirm personal orgs can’t invite members.
2. Provide admin tooling to reassign `active_organization_id` if a user is stuck on the wrong org.
3. Document operational runbooks (personal org provisioning, Stripe reconciliation) for on-call engineers.
4. Consider lifecycle clean-up for abandoned personal orgs (optional background task).
