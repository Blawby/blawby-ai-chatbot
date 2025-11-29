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
  // Subscriptions are now managed by remote API - this function returns null
  // Subscription data should be fetched from RemoteApiService instead
  return null;
}

/**
 * @deprecated This function no longer performs local database lookups.
 * Use RemoteApiService to resolve organization from Stripe identifiers.
 */
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

  // Subscription lookup removed - subscriptions are now managed by remote API
  // If subscriptionId is provided, we can't resolve it locally anymore
  // The remote API should handle subscription-to-organization mapping

  // Stripe customer ID lookup removed - organizations are now managed by remote API
  // If customerId is provided, the remote API should handle customer-to-organization mapping
  // This method is deprecated and should not be used for new code
  if (customerId) {
    throw new Error(
      'Organization resolution by Stripe customer ID is no longer supported locally. ' +
      'Use RemoteApiService.resolveOrganizationByCustomerId() instead.'
    );
  }

  throw new Error(
    'Organization resolution via SubscriptionService has been deprecated. ' +
    'Use the remote API to resolve Stripe identifiers.'
  );
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
  // Subscriptions are now managed by remote API - this function is deprecated
  // Return a cache object based on the args without writing to local DB
  const {
    organizationId,
    subscriptionId,
    stripeCustomerId,
    plan,
    status,
    seats,
    periodEnd,
    cancelAtPeriodEnd,
  } = args;

  // Return cache object without writing to subscriptions table
  return {
    subscriptionId,
    stripeCustomerId: stripeCustomerId ?? null,
    status,
    priceId: plan ?? "business",
    seats: seats ?? null,
    currentPeriodEnd: periodEnd ? periodEnd * 1000 : null, // Convert to milliseconds
    cancelAtPeriodEnd,
    limits: defaultLimits(),
    cachedAt: Date.now(),
    expiresAt: undefined,
  };
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
  // Subscriptions are now managed by remote API - no local DB update needed
  // Only update local organization state
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
