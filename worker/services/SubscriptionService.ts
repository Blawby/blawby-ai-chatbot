import Stripe from "stripe";
import type { Env, StripeSubscriptionCache } from "../types.js";

const DEFAULT_STRIPE_API_VERSION: Stripe.StripeConfig["apiVersion"] = null;

// Cache Stripe clients by apiVersion to support multiple API versions
const stripeClientCache = new Map<string | null, Stripe>();

// Managed statuses used to determine when an organization is considered on a managed (non-free) tier
const MANAGED_STATUSES: ReadonlySet<StripeSubscriptionCache["status"]> = new Set<StripeSubscriptionCache["status"]>([
  "active",
  "trialing",
  "paused",
  "past_due",
  "unpaid",
]);

/**
 * Generates a cache key from the apiVersion parameter.
 * Uses null as the key for the default API version to maintain backward compatibility.
 */
function getCacheKey(apiVersion: Stripe.StripeConfig["apiVersion"]): string | null {
  return apiVersion ?? null;
}

export function getOrCreateStripeClient(env: Env, apiVersion = DEFAULT_STRIPE_API_VERSION): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is required to initialize the Stripe client");
  }

  const cacheKey = getCacheKey(apiVersion);
  let client = stripeClientCache.get(cacheKey);

  if (!client) {
    client = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion,
      httpClient: Stripe.createFetchHttpClient(),
    });
    stripeClientCache.set(cacheKey, client);
  }

  return client;
}

function normalizeSubscriptionStatus(
  status: Stripe.Subscription.Status | null | undefined
): StripeSubscriptionCache["status"] {
  switch (status) {
    case "active":
    case "trialing":
      return status;
    case "canceled":
      return "canceled";
    case "incomplete_expired":
      return "incomplete_expired";
    case "past_due":
      return "past_due";
    case "unpaid":
      return "unpaid";
    case "incomplete":
      return "incomplete";
    case "paused":
      return "paused";
    default:
      return "canceled";
  }
}

function normalizeStoredStatus(status: unknown): StripeSubscriptionCache["status"] {
  if (typeof status !== "string") {
    return "canceled";
  }

  switch (status.toLowerCase()) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
      return "past_due";
    case "canceled":
      return "canceled";
    case "incomplete":
      return "incomplete";
    case "incomplete_expired":
      return "incomplete_expired";
    case "unpaid":
      return "unpaid";
    case "paused":
      return "paused";
    default:
      return "canceled";
  }
}

function extractStripeCustomerId(subscription: Stripe.Subscription): string | null {
  const customer = subscription.customer;
  if (!customer) {
    return null;
  }
  return typeof customer === "string" ? customer : customer.id;
}

async function persistOrganizationSubscriptionState(args: {
  env: Env;
  organizationId: string;
  stripeCustomerId: string | null;
  tier?: string | null;
  seats?: number | null;
  status: StripeSubscriptionCache["status"];
}): Promise<void> {
  const { env, organizationId, stripeCustomerId, tier, seats, status } = args;
  const normalizedSeats = typeof seats === "number" && seats > 0 ? seats : 1;

  const allowedTier = tier === "business" ? "business" : "free";

  const markBusiness = MANAGED_STATUSES.has(status) && allowedTier === "business";

  await env.DB.prepare(
    `UPDATE organizations 
       SET stripe_customer_id = ?, 
           subscription_tier = ?, 
           seats = ?, 
           is_personal = CASE WHEN ? = 1 THEN 0 ELSE is_personal END,
           updated_at = ?
     WHERE id = ?`
  )
    .bind(
      stripeCustomerId,
      allowedTier,
      normalizedSeats,
      markBusiness ? 1 : 0,
      Math.floor(Date.now() / 1000),
      organizationId
    )
    .run();
}

function defaultLimits(): StripeSubscriptionCache["limits"] {
  return {
    aiQueries: 1000,
    documentAnalysis: true,
    customBranding: true,
  };
}

type SubscriptionRow = {
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  status: string | null;
  plan: string | null;
  seats: number | null;
  period_end: number | null;
  cancel_at_period_end: number | null;
  updated_at: number | null;
};

function buildSubscriptionCacheFromRow(
  row: SubscriptionRow | null,
  priceIdOverride?: string | null
): StripeSubscriptionCache | null {
  if (!row || !row.stripe_subscription_id) {
    return null;
  }

  const status = normalizeStoredStatus(row.status);
  const seats = typeof row.seats === "number" && row.seats > 0 ? row.seats : 1;
  const currentPeriodEnd = typeof row.period_end === "number" ? row.period_end : 0;
  const priceId = priceIdOverride ?? row.plan ?? "unknown";

  return {
    subscriptionId: row.stripe_subscription_id,
    stripeCustomerId: row.stripe_customer_id ?? null,
    status,
    priceId,
    seats,
    currentPeriodEnd,
    cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
    limits: defaultLimits(),
    cachedAt: Date.now(),
    expiresAt: undefined,
  };
}

async function getLatestSubscriptionRow(env: Env, organizationId: string): Promise<SubscriptionRow | null> {
  return env.DB.prepare(
    `SELECT
       stripe_subscription_id,
       stripe_customer_id,
       status,
       plan,
       seats,
       period_end,
       cancel_at_period_end,
       updated_at
     FROM subscriptions
     WHERE reference_id = ?
     ORDER BY updated_at DESC
     LIMIT 1`
  )
    .bind(organizationId)
    .first<SubscriptionRow>();
}

export async function resolveOrganizationForStripeIdentifiers(
  env: Env,
  identifiers: {
    organizationIdFromMetadata?: string | null;
    subscriptionId?: string | null;
    customerId?: string | null;
  }
): Promise<string | null> {
  const { organizationIdFromMetadata, subscriptionId, customerId } = identifiers;

  if (organizationIdFromMetadata && organizationIdFromMetadata.trim().length > 0) {
    return organizationIdFromMetadata.trim();
  }

  if (subscriptionId) {
    const bySubscription = await env.DB.prepare(
      `SELECT reference_id FROM subscriptions WHERE stripe_subscription_id = ? LIMIT 1`
    )
      .bind(subscriptionId)
      .first<{ reference_id: string | null }>();

    if (bySubscription?.reference_id) {
      return bySubscription.reference_id;
    }
  }

  if (customerId) {
    const byCustomer = await env.DB.prepare(
      `SELECT id FROM organizations WHERE stripe_customer_id = ? LIMIT 1`
    )
      .bind(customerId)
      .first<{ id: string | null }>();

    if (byCustomer?.id) {
      return byCustomer.id;
    }
  }

  return null;
}

interface UpsertSubscriptionRecordArgs {
  env: Env;
  organizationId: string;
  subscriptionId: string;
  stripeCustomerId: string | null;
  plan: string | null;
  status: StripeSubscriptionCache["status"];
  seats: number | null;
  periodStart: number | null;
  periodEnd: number | null;
  cancelAtPeriodEnd: boolean;
  priceId?: string | null;
}

async function upsertSubscriptionRecord(args: UpsertSubscriptionRecordArgs): Promise<StripeSubscriptionCache> {
  const {
    env,
    organizationId,
    subscriptionId,
    stripeCustomerId,
    plan,
    status,
    seats,
    periodStart,
    periodEnd,
    cancelAtPeriodEnd,
    priceId,
  } = args;

  const nowSeconds = Math.floor(Date.now() / 1000);

  await env.DB.prepare(
    `INSERT INTO subscriptions (
       id,
       plan,
       reference_id,
       stripe_subscription_id,
       stripe_customer_id,
       status,
       period_start,
       period_end,
       seats,
       cancel_at_period_end,
       created_at,
       updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(stripe_subscription_id) DO UPDATE SET
       plan = excluded.plan,
       status = excluded.status,
       seats = excluded.seats,
       period_start = excluded.period_start,
       period_end = excluded.period_end,
       cancel_at_period_end = excluded.cancel_at_period_end,
       stripe_customer_id = excluded.stripe_customer_id,
       reference_id = COALESCE(subscriptions.reference_id, excluded.reference_id),
       updated_at = excluded.updated_at`
  )
    .bind(
      subscriptionId,
      plan ?? "business",
      organizationId,
      subscriptionId,
      stripeCustomerId,
      status,
      periodStart ?? null,
      periodEnd ?? null,
      seats ?? 1,
      cancelAtPeriodEnd ? 1 : 0,
      nowSeconds,
      nowSeconds
    )
    .run();

  return (
    buildSubscriptionCacheFromRow(
      {
        stripe_subscription_id: subscriptionId,
        stripe_customer_id: stripeCustomerId,
        status,
        plan: plan ?? null,
        seats: seats ?? 1,
        period_end: periodEnd ?? null,
        cancel_at_period_end: cancelAtPeriodEnd ? 1 : 0,
        updated_at: nowSeconds,
      },
      priceId ?? plan
    ) ?? {
      subscriptionId,
      stripeCustomerId,
      status,
      priceId: priceId ?? plan ?? "unknown",
      seats: seats ?? 1,
      currentPeriodEnd: periodEnd ?? 0,
      cancelAtPeriodEnd,
      limits: defaultLimits(),
      cachedAt: Date.now(),
      expiresAt: undefined,
    }
  );
}

function resolveSubscriptionTier(args: {
  env: Env;
  priceId?: string | null;
  planName?: string | null;
  status: StripeSubscriptionCache["status"];
}): "free" | "business" {
  const { env, priceId, planName, status } = args;

  if (!MANAGED_STATUSES.has(status)) {
    return "free";
  }

  const monthlyPriceId =
    typeof env.STRIPE_PRICE_ID === "string" ? env.STRIPE_PRICE_ID.trim().toLowerCase() : null;
  const annualPriceId =
    typeof env.STRIPE_ANNUAL_PRICE_ID === "string"
      ? env.STRIPE_ANNUAL_PRICE_ID.trim().toLowerCase()
      : null;

  const normalizedPriceId = typeof priceId === "string" ? priceId.trim().toLowerCase() : null;
  if (
    normalizedPriceId &&
    [monthlyPriceId, annualPriceId]
      .filter((id): id is string => Boolean(id && id.length > 0))
      .includes(normalizedPriceId)
  ) {
    return "business";
  }

  const normalizedPlan = typeof planName === "string" ? planName.trim().toLowerCase() : "";
  if (normalizedPlan.startsWith("business") || normalizedPlan.includes("business")) {
    return "business";
  }

  return "free";
}

export async function getStripeSubscriptionCache(
  env: Env,
  organizationId: string
): Promise<StripeSubscriptionCache | null> {
  const row = await getLatestSubscriptionRow(env, organizationId);
  return buildSubscriptionCacheFromRow(row);
}

export async function applyStripeSubscriptionUpdate(args: {
  env: Env;
  organizationId: string;
  stripeSubscription: Stripe.Subscription;
  plan?: string | null;
}): Promise<StripeSubscriptionCache> {
  const { env, organizationId, stripeSubscription, plan } = args;

  const primaryItem = stripeSubscription.items?.data?.[0];
  const price = primaryItem?.price;

  if (!price || !price.id) {
    const errorMessage = `Missing price id for subscription ${stripeSubscription.id} (organization: ${organizationId})`;
    console.error("Failed to sync Stripe data - missing price information:", {
      subscriptionId: stripeSubscription.id,
      organizationId,
      hasPrice: !!price,
      hasPriceId: !!price?.id,
      primaryItemId: primaryItem?.id,
    });
    throw new Error(errorMessage);
  }

  const normalizedStatus = normalizeSubscriptionStatus(stripeSubscription.status);
  const seats = primaryItem?.quantity ?? 1;

  // Use top-level subscription period bounds, not item-level (items.* don't have these fields)
  type PeriodBounds = { current_period_start?: number | null; current_period_end?: number | null };
  const subWithBounds = stripeSubscription as Stripe.Subscription & PeriodBounds;
  const periodStart =
    typeof subWithBounds.current_period_start === 'number' && subWithBounds.current_period_start > 0
      ? subWithBounds.current_period_start
      : null;
  const periodEnd =
    typeof subWithBounds.current_period_end === 'number' && subWithBounds.current_period_end > 0
      ? subWithBounds.current_period_end
      : null;

  const cache = await upsertSubscriptionRecord({
    env,
    organizationId,
    subscriptionId: stripeSubscription.id,
    stripeCustomerId: extractStripeCustomerId(stripeSubscription),
    plan: plan ?? price.nickname ?? price.id ?? "business",
    status: normalizedStatus,
    seats,
    periodStart,
    periodEnd,
    cancelAtPeriodEnd: Boolean(stripeSubscription.cancel_at_period_end),
    priceId: price.id,
  });

  const tier = resolveSubscriptionTier({
    env,
    priceId: cache.priceId,
    planName: plan ?? price.nickname ?? price.id ?? null,
    status: cache.status,
  });

  await persistOrganizationSubscriptionState({
    env,
    organizationId,
    stripeCustomerId: cache.stripeCustomerId,
    tier,
    seats: cache.seats,
    status: cache.status,
  });

  return cache;
}

export async function clearStripeSubscriptionCache(env: Env, organizationId: string): Promise<void> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `UPDATE subscriptions
       SET status = 'canceled',
           cancel_at_period_end = 1,
           period_end = COALESCE(period_end, ?),
           updated_at = ?
     WHERE reference_id = ?`
  )
    .bind(nowSeconds, nowSeconds, organizationId)
    .run();

  await persistOrganizationSubscriptionState({
    env,
    organizationId,
    stripeCustomerId: null,
    tier: "free",
    seats: 1,
    status: "canceled",
  });
}

export async function refreshStripeSubscriptionById(args: {
  env: Env;
  organizationId: string;
  subscriptionId: string;
  plan?: string | null;
  stripeClient?: Stripe;
}): Promise<StripeSubscriptionCache> {
  const { env, organizationId, subscriptionId, plan } = args;
  const client = args.stripeClient ?? getOrCreateStripeClient(env);

  try {
    const subscription = await client.subscriptions.retrieve(subscriptionId, {
      expand: ["items.data.price"],
    });

    return applyStripeSubscriptionUpdate({
      env,
      organizationId,
      stripeSubscription: subscription,
      plan,
    });
  } catch (error) {
    const errorObj = error && typeof error === "object" ? error as Record<string, unknown> : null;
    console.error("Failed to retrieve Stripe subscription", {
      operation: "refreshStripeSubscriptionById",
      subscriptionId,
      organizationId,
      error: {
        type: error instanceof Error ? error.constructor.name : typeof error,
        message: error instanceof Error ? error.message : String(error),
        ...(errorObj && "status" in errorObj && typeof errorObj.status !== "undefined" && { status: errorObj.status }),
        ...(errorObj && "code" in errorObj && typeof errorObj.code !== "undefined" && { code: errorObj.code }),
        ...(errorObj && "type" in errorObj && typeof errorObj.type !== "undefined" && { stripeType: errorObj.type }),
      },
    });

    throw new Error(
      `Failed to retrieve Stripe subscription ${subscriptionId} for organization ${organizationId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error }
    );
  }
}

export async function cancelOrganizationSubscription(args: {
  env: Env;
  organizationId: string;
}): Promise<void> {
  const { env, organizationId } = args;
  const stripeEnabled =
    env.ENABLE_STRIPE_SUBSCRIPTIONS === true || env.ENABLE_STRIPE_SUBSCRIPTIONS === "true";

  if (!stripeEnabled || !env.STRIPE_SECRET_KEY) {
    throw new Error("Stripe integration disabled or credentials missing");
  }

  const subscriptionRecord = await env.DB.prepare(
    `SELECT stripe_subscription_id, stripe_customer_id
       FROM subscriptions
      WHERE reference_id = ? AND status IN ('active', 'trialing')
      ORDER BY updated_at DESC
      LIMIT 1`
  )
    .bind(organizationId)
    .first<{ stripe_subscription_id: string | null; stripe_customer_id: string | null }>();

  if (!subscriptionRecord?.stripe_subscription_id) {
    throw new Error("No active subscription found for organization");
  }

  const client = getOrCreateStripeClient(env);

  try {
    await client.subscriptions.cancel(subscriptionRecord.stripe_subscription_id, {
      idempotencyKey: `cancel-sub-${subscriptionRecord.stripe_subscription_id}`,
    });
  } catch (error) {
    throw new Error(
      `Failed to cancel subscription: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error }
    );
  }
}

export async function cancelSubscriptionsAndDeleteCustomer(args: {
  env: Env;
  stripeCustomerId: string;
}): Promise<void> {
  const { env, stripeCustomerId } = args;
  const stripeEnabled =
    env.ENABLE_STRIPE_SUBSCRIPTIONS === true || env.ENABLE_STRIPE_SUBSCRIPTIONS === "true";

  if (!stripeEnabled || !env.STRIPE_SECRET_KEY) {
    console.warn(
      `Skipping Stripe cleanup for customer ${stripeCustomerId}: Stripe integration disabled or credentials missing.`
    );
    return;
  }

  const client = getOrCreateStripeClient(env);

  try {
    const subscriptionList = client.subscriptions.list({
      customer: stripeCustomerId,
      status: "all",
      limit: 100,
    });

    await subscriptionList.autoPagingEach(async (subscription) => {
      if (subscription.status !== "canceled") {
        await client.subscriptions.cancel(subscription.id, {
          idempotencyKey: `cancel-sub-${subscription.id}`,
        });
      }
    });

    await client.customers.del(stripeCustomerId, {
      idempotencyKey: `delete-customer-${stripeCustomerId}`,
    });
  } catch (error) {
    throw new Error(
      `Failed to clean up Stripe customer ${stripeCustomerId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error }
    );
  }
}
