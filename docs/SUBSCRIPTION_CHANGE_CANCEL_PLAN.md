## Subscription change and cancellation plan (Stripe defaults: 1a, 2b)

### Goals

- **Change plan/seats:** Only via Stripe **Billing Portal** (single subscription item; Business Monthly/Annual). Stripe proration defaults apply immediately.
- **Cancel:** Only what Stripe Portal allows (immediate cancel). No "at period end" option in-app.
- **Coupons/Taxes:** Leave to Stripe (Elements/Portal). No custom UI; no extra tax handling.
- **Permissions:** **Owners only** can open the Portal. Still show "Manage billing" entry point when `tier=free`.
- **Team management:** Allow invites/removals freely in-app. Reflect billing seats from Stripe as **display + guidance**, not a hard gate.

### What already exists (with code references)

- Subscription sync route consolidates Stripe state → DB/KV → organization tier:
```23:25:worker/routes/subscription.ts
export async function handleSubscription(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
```

```234:245:worker/routes/subscription.ts
      const cache = await refreshStripeSubscriptionById({
        env,
        organizationId,
        subscriptionId: stripeId,
        plan: subscriptionRecord?.plan ?? "free",
      });

      return createSuccessResponse({
        synced: true,
        subscription: cache,
      });
```

- Webhook-driven upsert and organization tier updates on subscription updates/cancellations:
```368:383:worker/auth/index.ts
                  if (status === 'active') {
                    const normalizedTier = planLower && typeof planLower === 'string' && planLower.length > 0
                      ? planLower.replace(/-annual$/, '')
                      : 'free';
                    const orgUpdate = await env.DB.prepare(
                      `UPDATE organizations SET subscription_tier = ?, seats = ?, stripe_customer_id = COALESCE(stripe_customer_id, ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?`
                    ).bind(normalizedTier, seats, stripeCustomerId, refId).run();
                    console.log('✅ Organization tier updated (active):', { success: orgUpdate.success, changes: orgUpdate.meta?.changes, organizationId: refId });
                  } else {
                    const orgDowngrade = await env.DB.prepare(
                      `UPDATE organizations SET subscription_tier = 'free', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
                    ).bind(refId).run();
                    console.log('✅ Organization downgraded (non-active):', { success: orgDowngrade.success, changes: orgDowngrade.meta?.changes, organizationId: refId });
                  }
```

```475:487:worker/auth/index.ts
              onSubscriptionCancel: async ({ stripeSubscription, subscription }) => {
                console.log('🔔 onSubscriptionCancel', {
                  referenceId: subscription.referenceId,
                  subscriptionPlan: subscription.plan,
                  stripeSubscriptionId: stripeSubscription?.id,
                  customer: typeof stripeSubscription?.customer === 'string' ? stripeSubscription.customer : stripeSubscription?.customer?.id,
                  status: stripeSubscription?.status,
                });
                await syncSubscriptionState({
                  stripeSubscription,
                  referenceId: subscription.referenceId,
                  plan: subscription.plan,
                });
              },
```

- Stripe sync helpers that cache and align organization metadata:
```204:221:worker/services/StripeSync.ts
  const cache = await syncStripeDataToKV({
    env,
    organizationId,
    subscription: stripeSubscription,
    overwriteExisting,
    cacheDurationMs,
  });

  await updateOrganizationSubscriptionMetadata({
    env,
    organizationId,
    stripeCustomerId: extractStripeCustomerId(stripeSubscription),
    plan,
    seats: cache.seats,
    status: cache.status,
  });

  return cache;
```

```75:86:worker/services/StripeSync.ts
  const normalizedTier =
    status === "active" || status === "trialing"
      ? (plan ?? "business")
      : "free";

  await env.DB.prepare(
    `UPDATE organizations 
       SET stripe_customer_id = ?, 
           subscription_tier = ?, 
           seats = ?, 
           updated_at = ?
     WHERE id = ?`
  )
    .bind(
      stripeCustomerId,
      normalizedTier,
      normalizedSeats,
      Math.floor(Date.now() / 1000),
      organizationId
    )
    .run();
```

- Customer-wide immediate cancel helper exists (used when deleting a customer):
```331:349:worker/services/StripeSync.ts
    // Cancel all active/pending subscriptions for the customer
    const subscriptionList = client.subscriptions.list({
      customer: stripeCustomerId,
      status: "all",
      limit: 100,
    });

    await subscriptionList.autoPagingEach(async (subscription) => {
      if (subscription.status !== "canceled") {
        await client.subscriptions.cancel(subscription.id, {
          idempotencyKey: `cancel-sub-${subscription.id}-${Date.now()}`
        });
      }
    });

    await client.customers.del(stripeCustomerId, {
      idempotencyKey: `delete-customer-${stripeCustomerId}-${Date.now()}`
    });
```

- Frontend: centralized Billing Portal, Upgrade, and Sync helpers:
```154:167:src/hooks/usePaymentUpgrade.ts
  const openBillingPortal = useCallback(
    async ({ organizationId, returnUrl }: BillingPortalRequest) => {
      try {
        const response = await fetch(getSubscriptionBillingPortalEndpoint(), {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            referenceId: organizationId,
            returnUrl: returnUrl ?? '/settings/account',
          }),
        });
```

```221:231:src/hooks/usePaymentUpgrade.ts
  const submitUpgrade = useCallback(
    async ({ organizationId, seats = 1, annual = false, successUrl, cancelUrl, returnUrl }: SubscriptionUpgradeRequest): Promise<void> => {
      setSubmitting(true);
      setError(null);

      const resolvedSuccessUrl = successUrl ?? buildSuccessUrl(organizationId);
      const resolvedCancelUrl = cancelUrl ?? buildCancelUrl(organizationId);
      const resolvedReturnUrl = returnUrl ?? resolvedSuccessUrl;
```

```392:399:src/hooks/usePaymentUpgrade.ts
      try {
        const response = await fetch(getSubscriptionSyncEndpoint(), {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ organizationId }),
        });
```

- Client endpoints mapping to Better Auth routes and our sync:
```82:95:src/config/api.ts
export const getSubscriptionUpgradeEndpoint = () => {
  const config = getApiConfig();
  return `${config.baseUrl}/api/auth/subscription/upgrade`;
};

export const getSubscriptionBillingPortalEndpoint = () => {
  const config = getApiConfig();
  return `${config.baseUrl}/api/auth/subscription/billing-portal`;
};

export const getSubscriptionSyncEndpoint = () => {
  const config = getApiConfig();
  return `${config.baseUrl}/api/subscription/sync`;
};
```

- Integration test demonstrates sync upgrades org tier:
```164:182:tests/integration/api/subscription.sync.test.ts
    const response = await handleSubscription(request, env as unknown as WorkerEnv);
    expect(response.status).toBe(200);

    const payload = await response.json() as { success?: boolean; data?: unknown } | undefined | null;
    expect(payload).toBeDefined();
    expect(payload).not.toBeNull();
    expect(Object.prototype.hasOwnProperty.call(payload as object, 'success')).toBe(true);
    expect((payload as { success?: boolean }).success).toBe(true);

    const db = (env as { DB: D1Database }).DB;
    const row = await db.prepare('SELECT subscription_tier as tier, seats FROM organizations WHERE id = ?')
      .bind('org_sync_test')
      .first<{ tier: string; seats: number }>();

    expect(row).toBeTruthy();
    expect(row?.tier).toMatch(/business|business-annual|enterprise/);
    expect(typeof row?.seats).toBe('number');
    expect((row?.seats ?? 0) >= 1).toBe(true);
```

### Gaps relative to “change/cancel”

- No first-party route to change plan or seats; UX expects Billing Portal/Checkout.
- No single-subscription immediate cancel endpoint; customer-wide helper + webhook syncing exists.

### Decisions (Stripe defaults: 1a proration, 2b immediate cancel)

- **Plan/seats change:** Use Billing Portal. Stripe default proration applies immediately; webhooks + sync reflect changes.
- **Cancel:** Immediate cancel through Billing Portal (self-service). Webhooks + sync downgrade org and clear cache. No "cancel at period end" path needed.
- **Team overage:** If `members > seats`, show a non-blocking banner with "Manage billing" → Portal link. Never block invites/removals.

### Minimal, targeted enhancements

- **Frontend**
  - Reuse `openBillingPortal` from `usePaymentUpgrade` hook for both "Change plan" and "Cancel subscription".
  - On return from portal, trigger `syncSubscription(organizationId)`; return URLs should include `?sync=1` parameter.
  - Display plan/seats in Settings > Account; show seats usage in Organization > Team Members.

- **Backend**
  - Keep webhook as source of truth; continue calling `refreshStripeSubscriptionById` via the existing sync route when UI returns.
  - **Owner enforcement:** Ensure `/api/auth/subscription/billing-portal` endpoint enforces owner role (mirrors sync route's `requireOrgOwner`).
  - **KV cache invalidation:** Clear cache on non-active status transitions (`status` ∉ {`active`, `trialing`}) to prevent stale plan badges after cancel.
  - **Multiple subscriptions:** If >1 active sub exists, choose deterministic winner (e.g., newest by `current_period_start`) in sync helpers.
  - No new endpoints are required to satisfy 1a/2b with the current architecture.

## Frontend display of subscription plan and seats

### Goals
- Display the current organization subscription plan and seats in Settings > Account.
- Show a read-only plan badge on the user profile with a "Manage billing" link.
- Reflect real-time changes after users return from Stripe (via existing sync endpoint).

### Data sources
- Primary: `organizations.subscription_tier` and `organizations.seats` in DB, which are updated by webhooks and the sync route.
- Optional cache: KV-backed subscription cache populated by Stripe sync helpers.

Code paths updating organization tier and seats:
```368:383:worker/auth/index.ts
                  if (status === 'active') {
                    const normalizedTier = planLower && typeof planLower === 'string' && planLower.length > 0
                      ? planLower.replace(/-annual$/, '')
                      : 'free';
                    const orgUpdate = await env.DB.prepare(
                      `UPDATE organizations SET subscription_tier = ?, seats = ?, stripe_customer_id = COALESCE(stripe_customer_id, ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?`
                    ).bind(normalizedTier, seats, stripeCustomerId, refId).run();
                    console.log('✅ Organization tier updated (active):', { success: orgUpdate.success, changes: orgUpdate.meta?.changes, organizationId: refId });
                  } else {
                    const orgDowngrade = await env.DB.prepare(
                      `UPDATE organizations SET subscription_tier = 'free', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
                    ).bind(refId).run();
                    console.log('✅ Organization downgraded (non-active):', { success: orgDowngrade.success, changes: orgDowngrade.meta?.changes, organizationId: refId });
                  }
```

```75:86:worker/services/StripeSync.ts
  const normalizedTier =
    status === "active" || status === "trialing"
      ? (plan ?? "business")
      : "free";

  await env.DB.prepare(
    `UPDATE organizations 
       SET stripe_customer_id = ?, 
           subscription_tier = ?, 
           seats = ?, 
           updated_at = ?
     WHERE id = ?`
  )
    .bind(
      stripeCustomerId,
      normalizedTier,
      normalizedSeats,
      Math.floor(Date.now() / 1000),
      organizationId
    )
    .run();
```

### UI locations and behavior

#### Settings > Account (`src/components/settings/pages/AccountPage.tsx`)
- **Display:**
  - Plan badge: Display normalized tier name **without suffix** (e.g., "Business" not "Business Annual").
  - Seats: Numeric count from `currentOrganization.seats ?? 1`.
  - Defensive normalization: Strip `-annual` suffix if present in tier value.
- **Actions (Owners only):**
  - **"Manage billing"** button: Calls `openBillingPortal({ organizationId, returnUrl: '/settings/account?sync=1' })`.
  - **"Sync subscription"** button: Calls `syncSubscription({ organizationId })`, then refreshes organization via `refetch()`.
  - Show "Manage billing" even when `tier=free` (allows viewing subscription history/upgrading).
- **Auto-sync on return:**
  - Detect `?sync=1` in URL params on mount.
  - Trigger `syncSubscription` and `refetch()` automatically.
  - Show loading state during sync.

#### Organization > Team Members (`src/components/settings/pages/OrganizationPage.tsx`)
- **Display:**
  - Show "Seats used: {membersCount} / {org.seats ?? 1}" near Team Members heading.
  - Calculate `membersCount` from `members.length` (already available via `getMembers`).
- **Overage banner (if `membersCount > org.seats`):**
  - Non-blocking warning banner above or below member list.
  - Message: "You're using {membersCount} seats but your plan includes {seatsLimit}. The billing owner can increase seats in Stripe."
  - Button (Owners only): "Manage billing" → opens Portal with `returnUrl: '/settings/organization?sync=1'`.
  - Never block invites/removals even when over limit.

### State handling
- **Loading:** 
  - Use `loading` state from `useOrganizationManagement` to show skeleton for plan/seats.
  - Portal-return auto-sync: Show subtle "Syncing subscription..." toast or inline status.
- **Success:** 
  - Display normalized tier (strip `-annual`, title-case: "Business", "Enterprise") and numeric seats.
  - Map unknown/missing to "Free" and `seats = 1`.
  - After sync success, call `refetch()` to refresh organization data, then update UI.
- **Error:** 
  - Map errors to existing codes in `SubscriptionErrorCode` enum (already in `usePaymentUpgrade.ts`).
  - Show toast with retry action; log to console for diagnostics.
- **Sync in-flight:** 
  - Show non-blocking "Syncing…" status via `submitting` state from `usePaymentUpgrade`.
  - Disable "Manage billing" and "Sync subscription" buttons while `submitting === true`.

### Internationalization and accessibility
- i18n: Translate plan names, seats label, loading and error messages using existing i18n setup (`src/i18n`).
- a11y: Use ARIA `status` for sync feedback; ensure buttons have accessible names and focus order.

### Permissions
- **Owner check:** Use `isOwner` from `useOrganizationManagement` or derive from `currentMember?.role === 'owner'`.
- **"Manage billing" button:** Only visible if `isOwner === true`.
- **"Sync subscription" button:** Can be visible to all users (read-only sync), or owners only (your preference - recommend owners only for consistency).
- **Overage banner:** Only show "Manage billing" button within banner if `isOwner === true`.
- **If unauthorized:** Show plan and seats read-only without actions.
- **Server-side:** `/api/subscription/sync` already enforces `requireOrgOwner`, so non-owners will get 403.

### Performance
- **Organization context:** Prefer `currentOrganization` from `useOrganizationManagement` (already loaded) to avoid redundant fetches.
- **Members data:** Use `getMembers(organizationId)` from same hook (cached in component state).
- **Debouncing:** If syncing, wait for `syncSubscription` promise to resolve before calling `refetch()` to avoid flicker.
- **URL param cleanup:** After auto-sync on `?sync=1`, remove param from URL to prevent re-triggering on re-render.

### Edge cases
- **No active subscription (`tier=free`):** Display "Free" and `seats=1`. Still show "Manage billing" button for owners.
- **Trialing:** Treat as active (handled by `updateOrganizationSubscriptionMetadata`); display plan without "Trial" suffix.
- **Desynchronized state post-portal:** Auto-sync if `?sync=1` param present; otherwise show "Sync subscription" button.
- **Members > seats (overage):** Show banner but never block invites/removals. This is guidance only.
- **Stale tier data:** If tier includes `-annual`, normalize for display: `tier.replace(/-annual$/i, '')`.
- **Missing seats value:** Default to `1` if `org.seats` is `null` or `undefined`.
- **Portal returns without changes:** Sync will return "No active Stripe subscription found" if cancelled; handle gracefully.

### Acceptance criteria
- ✅ Settings > Account shows current plan and seats sourced from `currentOrganization` data.
- ✅ Settings > Account shows "Manage billing" button (owners only) even when `tier=free`.
- ✅ Settings > Account shows "Sync subscription" button (owners only) that calls sync endpoint.
- ✅ Returning from Stripe with `?sync=1` triggers auto-sync and updates UI within 2s.
- ✅ Organization > Team Members shows "Seats used: X / Y".
- ✅ If `membersCount > seats`, non-blocking overage banner appears with "Manage billing" link (owners only).
- ✅ Invites/removals are never blocked, even when over seat limit.
- ✅ Errors are surfaced via toast with retry and logged to console for diagnostics.
- ✅ Plan names display without `-annual` suffix (e.g., "Business" not "Business Annual").

### Test additions

#### Unit Tests

**Utils:**
- `displayPlan('business-annual') → 'Business'`
- `displayPlan('free') → 'Free'`
- `displayPlan(null) → 'Free'`
- `normalizeSeats(5) → 5`
- `normalizeSeats(null) → 1`
- `normalizeSeats(0) → 1`

**AccountPage:**
- Render with `currentOrganization` containing `subscriptionTier: 'business-annual'`, `seats: 5` → verify displays "Business" and "5".
- Render with `tier: 'free'`, `seats: null` → verify displays "Free" and "1".
- Render as owner → verify "Manage billing" and "Sync subscription" buttons are visible.
- Render as non-owner → verify buttons are hidden, plan/seats read-only.
- Mount with `?sync=1` in URL → verify `syncSubscription` and `refetch()` are called, URL param removed.
- Test `submitting === true` → verify buttons are disabled, ARIA status shown.

**OrganizationPage:**
- Render with 3 members, `seats: 2` → verify overage banner appears with helpful message.
- Render with 2 members, `seats: 5` → verify no banner.
- Render overage as owner → verify "Manage billing" button in banner.
- Render overage as non-owner → verify banner without button, still shows helpful message.
- Test invites/removals work even when `membersCount > seats`.

#### Integration Tests
- **Sync flow:**
  - Simulate portal-return with `?sync=1` → call sync endpoint → assert DB update → verify UI updates within 2s.
  - Test sync when subscription cancelled → verify tier updates to "free", KV cache cleared, seats may remain or reset.
  - Test sync when plan changed → verify tier and seats update correctly.
  - Test webhook `customer.subscription.updated` (seat change) → DB seats update → UI shows new seats after sync.

#### Permission Tests
- **Server-side:**
  - Non-owner calls `/api/subscription/sync` → assert 403 Forbidden.
  - Non-owner calls `/api/auth/subscription/billing-portal` → assert 403 Forbidden (if `authorizeReference` changed to owners-only).
- **Frontend:** Non-owner views Settings > Account → assert buttons hidden.

### Error handling alignment

- Frontend maps server errors to UI via standardized codes:
```71:86:src/hooks/usePaymentUpgrade.ts
enum SubscriptionErrorCode {
  SUBSCRIPTION_ALREADY_ACTIVE = 'SUBSCRIPTION_ALREADY_ACTIVE',
  EMAIL_VERIFICATION_REQUIRED = 'EMAIL_VERIFICATION_REQUIRED',
  ORGANIZATION_NOT_FOUND = 'ORGANIZATION_NOT_FOUND',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  STRIPE_CHECKOUT_FAILED = 'STRIPE_CHECKOUT_FAILED',
  STRIPE_BILLING_PORTAL_FAILED = 'STRIPE_BILLING_PORTAL_FAILED',
  STRIPE_CUSTOMER_NOT_FOUND = 'STRIPE_CUSTOMER_NOT_FOUND',
  STRIPE_SUBSCRIPTION_NOT_FOUND = 'STRIPE_SUBSCRIPTION_NOT_FOUND',
  INVALID_ORGANIZATION_ID = 'INVALID_ORGANIZATION_ID',
  INVALID_SEAT_COUNT = 'INVALID_SEAT_COUNT',
  INVALID_PLAN_TYPE = 'INVALID_PLAN_TYPE',
  SUBSCRIPTION_SYNC_FAILED = 'SUBSCRIPTION_SYNC_FAILED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}
```

- Sync route returns structured responses (success / no active sub):
```226:233:worker/routes/subscription.ts
      if (!stripeId) {
        await clearStripeSubscriptionCache(env, organizationId);
        return createSuccessResponse({
          synced: false,
          message: "No active Stripe subscription found for organization",
        });
      }
```

### Implementation details

#### Component updates

**1. Create shared utility (`src/utils/subscription.ts`):**

```typescript
/**
 * Normalizes subscription tier for display.
 * Strips -annual suffix, title-cases, defaults to Free.
 */
export function displayPlan(tier?: string | null): string {
  if (!tier || tier === 'free') return 'Free';
  const normalized = tier.replace(/-annual$/i, '');
  return normalized.charAt(0).toUpperCase() + normalized.slice(1) || 'Free';
}

/**
 * Safely extracts seats count with defensive default.
 */
export function normalizeSeats(seats?: number | null): number {
  return Number.isFinite(seats) && seats! > 0 ? seats! : 1;
}
```

**2. Settings > Account (`src/components/settings/pages/AccountPage.tsx`)**

Add subscription display section (import `displayPlan` and `normalizeSeats` from utils):

// Auto-sync on return from portal
useEffect(() => {
  const params = new URLSearchParams(location.search);
  if (params.get('sync') === '1' && currentOrganization?.id) {
    setSubmitting(true); // Show syncing state
    syncSubscription(currentOrganization.id)
      .then(() => {
        refetch();
        // Show success toast
        showSuccess('Subscription updated', 'Your subscription status has been refreshed.');
      })
      .finally(() => {
        setSubmitting(false);
        // Remove sync param to prevent re-trigger (URL hygiene)
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete('sync');
        window.history.replaceState({}, '', newUrl.toString());
      });
  }
}, [location.search, currentOrganization?.id, syncSubscription, refetch, showSuccess]);

// In JSX:
<div className="py-3">
  <div className="flex items-center justify-between">
    <div>
      <h3 className="text-sm font-semibold">Subscription Plan</h3>
      <p className="text-xs text-gray-500 mt-1">
        {displayPlan(currentOrganization?.subscriptionTier)} • {normalizeSeats(currentOrganization?.seats)} seats
      </p>
    </div>
    {isOwner && (
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => openBillingPortal({ 
            organizationId: currentOrganization.id, 
            returnUrl: `${window.location.origin}/settings/account?sync=1` 
          })}
          disabled={submitting}
        >
          Manage billing
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => syncSubscription(currentOrganization.id).then(refetch)}
          disabled={submitting}
          aria-live="polite"
        >
          {submitting ? 'Syncing…' : 'Sync subscription'}
        </Button>
        {submitting && (
          <span className="sr-only" role="status" aria-live="polite">Syncing subscription status</span>
        )}
      </div>
    )}
  </div>
</div>
```

**3. Organization > Team Members (`src/components/settings/pages/OrganizationPage.tsx`)**

Add seats usage display and overage banner (import `normalizeSeats` from utils):
```typescript
const membersCount = members.length;
const seatsLimit = normalizeSeats(currentOrganization?.seats);
const isOverage = membersCount > seatsLimit;

// In JSX after "Team Members" heading:
<div className="flex items-center justify-between mb-4">
  <div>
    <h3 className="text-sm font-semibold">Team Members</h3>
    <p className="text-xs text-gray-500 mt-1">
      Seats used: {membersCount} / {seatsLimit}
    </p>
  </div>
  {/* ... existing invite button ... */}
</div>

{isOverage && (
  <div role="status" aria-live="polite" className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded">
    <p className="text-sm text-yellow-800 dark:text-yellow-200">
      You're using {membersCount} seats but your plan includes {seatsLimit}. The billing owner can increase seats in Stripe.
      {isOwner && (
        <Button
          variant="link"
          size="sm"
          onClick={() => openBillingPortal({ 
            organizationId: currentOrganization.id, 
            returnUrl: `${window.location.origin}/settings/organization?sync=1` 
          })}
          disabled={submitting}
          className="ml-2"
        >
          Manage billing
        </Button>
      )}
    </p>
  </div>
)}
```

#### Hook integration

- **`usePaymentUpgrade`:** Already exists with `openBillingPortal` and `syncSubscription` - ensure `submitting` state is exported for button disabling.
- **`useOrganizationManagement`:** Already provides `currentOrganization`, `refetch`, `getMembers` - use as-is.
- **Permissions:** Derive `isOwner` from `currentMember?.role === 'owner'` (pattern already in `OrganizationPage.tsx`).

#### Backend hardening (required)

**1. Owner enforcement on billing-portal endpoint (`worker/auth/index.ts`):**

Currently `authorizeReference` allows both `owner` and `admin` crossings (line 259). For billing portal, we need owners-only:

```typescript
// In authorizeReference function around line 259:
// Change from:
const isAuthorized = membership.role === "owner" || membership.role === "admin";

// To (owners only):
const isAuthorized = membership.role === "owner";
```

**Note:** This affects all subscription operations (upgrade, billing portal, etc.). If we need admins to access other subscription features, Better Auth may support separate authorization hooks for billing portal - verify in Better Auth docs.

**2. KV cache invalidation on cancel (`worker/services/StripeSync.ts`):**

```typescript
// In updateOrganizationSubscriptionMetadata or syncStripeDataToKV:
if (status !== 'active' && status !== 'trialing') {
  await clearStripeSubscriptionCache(env, organizationId);
}
```

**3. Multiple subscriptions handling (`worker/services/StripeSync.ts`):**

If multiple active subscriptions exist for a customer, pick deterministically:

```typescript
// When listing subscriptions, if multiple active:
// Sort by current_period_start descending, pick first
subscriptions.sort((a, b) => (b.current_period_start || 0) - (a.current_period_start || 0));
const primarySubscription = subscriptions[0];
```

**4. Sync endpoint role check:** Already enforced via `requireOrgOwner` in `worker/routes/subscription.ts:46`.

### Stripe portal configuration checklist

- ✅ Enable **Plan switching** and **Quantity changes** on the subscription's item.
- ✅ Configure **Immediate cancellation** (disable "at period end" behavior).
- ✅ Expose only **Business Monthly** and **Business Annual** prices.
- ✅ Leave **Coupons** enabled (Elements/Portal), no custom UI.
- ✅ Set return URLs with `?sync=1` (we're passing it via `openBillingPortal`).

### Definition of Done (crisp)

- ✅ Owners can open Portal from **Account** and **Team** pages—even on Free.
- ✅ Returning with `?sync=1` triggers sync, updates plan/seats, removes param, shows success toast.
- ✅ **Seats used X/Y** is visible; overage shows **non-blocking** banner with helpful message + Portal link (owners only).
- ✅ Webhook or manual sync reliably updates DB + clears caches on non-active states.
- ✅ `displayPlan()` and `normalizeSeats()` utilities shared across components.
- ✅ Buttons disable during sync (`submitting` state), ARIA status for accessibility.
- ✅ No first-party plan/seat update endpoints added.
- ✅ Owner enforcement on both `/api/subscription/sync` and `/api/auth/subscription/billing-portal`.

### Why this matches the branch

- Uses Better Auth upgrade and billing-portal endpoints wired in `src/config/api.ts` and `src/hooks/usePaymentUpgrade.ts`.
- Respects webhook-driven org tier updates and the sync route's fallback upsert logic in `worker/routes/subscription.ts`.
- Aligns with onboarding flow (post-checkout route and sync triggers) without introducing redundant server endpoints.
- Follows existing patterns in `AccountPage.tsx` and `OrganizationPage.tsx` for consistency.
- Implements all quick wins: shared utils, URL hygiene, defensive defaults, toasts/ARIA.


