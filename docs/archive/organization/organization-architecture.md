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
| Upgrade | Checkout flow → Remote API Stripe webhook | `usePaymentUpgrade` calls remote API at staging-api.blawby.com for checkout/billing portal. Remote API handles Stripe webhooks and updates organization subscription status. Worker fetches subscription status via `RemoteApiService` for entitlement checks. |
| Entitlements | Feature guards (`worker/middleware/featureGuard.ts`) | Checks `tier`, `isPersonal`, and `subscriptionStatus` before allowing access to APIs (tokens, invitations, etc.). |
| Onboarding | `BusinessOnboardingPage` | Accessible only for business orgs with subscription status `active`, `trialing`, or `paused`. |

## 3. Data Model

### `organizations`
Field | Description
------|-----------
`is_personal` | `1` for personal orgs. Set to `0` after a paid upgrade via the webhook.
`subscription_tier` | Used for display (`free`, `business`, `enterprise`), derived from subscription status. Note: Enterprise is future/disabled; only Free and Business tiers are currently live in the UI (as of Q4 2024).
`kind` | In code we derive `business` vs `personal`; fallbacks for legacy rows use `is_personal`.
`stripe_customer_id` | Set after upgrade; allows Stripe → org resolution.
`config` | Stores workspace settings, notifications, etc.

### `members`
- Owner membership is provisioned automatically for personal orgs.
- Invitations and role changes require a business org and pass through feature guards.

### `sessions` (managed by remote API)
- The `sessions` table includes `active_organization_id` field to track which organization a user's session is currently active in.
- This field is managed by the remote Better Auth server at staging-api.blawby.com.
- Used by `DefaultOrganizationService` to determine the active organization for a user session.

## 4. API & Middleware

Component | Responsibility
----------|----------------
`worker/routes/organizations.ts` | Workspace endpoints only (`/api/organizations/:id/workspace/*`). Organization CRUD is handled by remote API at staging-api.blawby.com.
`worker/middleware/featureGuard.ts` | Centralized entitlement logic (min tier, `requireNonPersonal`, quota enforcement). Fetches organization metadata from remote API.
`worker/services/RemoteApiService.ts` | Fetches organization and subscription data from remote API for entitlement checks.
Remote API (`staging-api.blawby.com`) | Handles organization CRUD, invitations, subscriptions, Stripe webhooks, and user management.

## 5. Frontend Consumption

| Hook/Component | Notes |
|----------------|-------|
| `useOrganizationManagement` | Normalizes each org with `kind`, `isPersonal`, `subscriptionStatus`, `subscriptionTier`, `seats`. |
| `usePaymentUpgrade` | Uses entitlement helpers to decide between checkout and billing portal paths. |
| `CartPage`, `AccountPage`, `BusinessOnboardingPage` | Display plan labels and guard UX flows via shared helpers (`describeSubscriptionPlan`, `hasManagedSubscription`). |
| `PricingModal`, `Settings` | React to the entitlement model so personal orgs see upgrade CTAs while business orgs get management actions. |

## 6. Testing
- **Worker integration**: Tests for workspace endpoints and chatbot functionality. Organization/subscription management tests removed (handled by remote API).
- **Playwright**: Chatbot workflow tests. Auth/organization management tests removed (handled by remote API).
- **Unit**: Entitlement utilities (`src/utils/subscription.ts`) can be unit-tested directly.

## 7. Known Gaps / Future Ideas
1. Add integration coverage for invitation routes to confirm personal orgs can't invite members.
2. Provide admin tooling to reassign `active_organization_id` (in the `sessions` table, managed by remote API) if a user is stuck on the wrong org.
3. Document operational runbooks (personal org provisioning, Stripe reconciliation) for on-call engineers.
4. Consider lifecycle clean-up for abandoned personal orgs (optional background task).
