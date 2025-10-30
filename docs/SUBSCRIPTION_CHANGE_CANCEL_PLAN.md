## Subscription change and cancellation plan (Stripe defaults: 1a, 2b)

### Goals

- Change plan/seats: rely on Stripe’s default proration (immediate).
- Cancel: immediate cancel (no “at period end” option in-app).
- Prefer Billing Portal for user-facing actions; use existing webhooks and sync to reflect state.

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
            returnUrl: returnUrl \u223c '/settings/account',
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
    expect((row?.seats \u223c 0) >= 1).toBe(true);
```

### Gaps relative to “change/cancel”

- No first-party route to change plan or seats; UX expects Billing Portal/Checkout.
- No single-subscription immediate cancel endpoint; customer-wide helper + webhook syncing exists.

### Decisions (Stripe defaults: 1a proration, 2b immediate cancel)

- Plan/seats change: use Billing Portal. Stripe default proration applies immediately; webhooks + sync reflect changes.
- Cancel: immediate cancel through Billing Portal (self-service). Webhooks + sync downgrade org and clear cache. No “cancel at period end” path needed.

### Minimal, targeted enhancements

- Frontend
  - Reuse `openBillingPortal` for both “Change plan” and “Cancel subscription”.
  - On return from portal, trigger `syncSubscription(organizationId)`; success/cancel URLs already support `sync=1` patterns.

- Backend
  - Keep webhook as source of truth; continue calling `refreshStripeSubscriptionById` via the existing sync route when UI returns.
  - No new endpoints are required to satisfy 1a/2b with the current architecture.

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

### Tests to maintain confidence

- Integration: existing sync happy-path test covers org upgrade. For portal-return flow, simulate sync after webhook update; portal itself need not be E2E tested.

### Why this matches the branch

- Uses Better Auth upgrade and billing-portal endpoints wired in `src/config/api.ts` and `src/hooks/usePaymentUpgrade.ts`.
- Respects webhook-driven org tier updates and the new sync route’s fallback upsert logic in `worker/routes/subscription.ts`.
- Aligns with onboarding flow (post-checkout route and sync triggers) without introducing redundant server endpoints.


