import Stripe from "stripe";
import type { Env, StripeSubscriptionCache } from "../types.js";
import { stripeSubscriptionCacheSchema } from "../schemas/validation.js";

const DEFAULT_STRIPE_API_VERSION: Stripe.StripeConfig["apiVersion"] = null;

let cachedStripeClient: Stripe | null = null;

export function getOrCreateStripeClient(env: Env, apiVersion = DEFAULT_STRIPE_API_VERSION): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is required to initialize the Stripe client");
  }
  
  if (!cachedStripeClient) {
    cachedStripeClient = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion,
      httpClient: Stripe.createFetchHttpClient(),
    });
  }
  
  return cachedStripeClient;
}

function getOrganizationCacheKey(organizationId: string): string {
  return `stripe:org:${organizationId}`;
}

function getUserCacheKey(userId: string): string {
  return `stripe:user:${userId}`;
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
    default:
      // For null/undefined or unknown statuses, default to canceled
      // This represents a subscription that exists but is not in a valid state
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

async function updateOrganizationSubscriptionMetadata(args: {
  env: Env;
  organizationId: string;
  stripeCustomerId: string | null;
  plan?: string | null;
  seats?: number | null;
  status: StripeSubscriptionCache["status"];
}): Promise<void> {
  const { env, organizationId, stripeCustomerId, plan, seats, status } = args;
  const normalizedSeats = typeof seats === "number" && seats > 0 ? seats : 1;

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

  // Clear KV cache when status transitions to non-active to prevent stale plan badges
  if (status !== 'active' && status !== 'trialing') {
    await clearStripeSubscriptionCache(env, organizationId);
  }
}

export async function getStripeSubscriptionCache(
  env: Env,
  organizationId: string
): Promise<StripeSubscriptionCache | null> {
  const cacheKey = getOrganizationCacheKey(organizationId);
  const cached = await env.CHAT_SESSIONS.get(cacheKey, { type: "json" });
  if (!cached) {
    return null;
  }

  try {
    // Validate the cached data using Zod schema
    const validatedCache = stripeSubscriptionCacheSchema.parse(cached);
    return validatedCache;
  } catch (error) {
    // Log invalid cache entry for debugging
    console.warn(`Invalid Stripe subscription cache entry for organization ${organizationId}:`, {
      cacheKey,
      error: error instanceof Error ? error.message : String(error),
      cachedData: cached
    });
    
    // Return null to indicate cache miss, allowing downstream code to fetch fresh data
    return null;
  }
}

export async function syncStripeDataToKV(args: {
  env: Env;
  organizationId: string;
  subscription: Stripe.Subscription;
  overwriteExisting?: boolean;
  cacheDurationMs?: number;
}): Promise<StripeSubscriptionCache> {
  const { env, organizationId, subscription, overwriteExisting = true, cacheDurationMs = 60 * 60 * 1000 } = args;

  const primaryItem = subscription.items?.data?.[0];
  const price = primaryItem?.price;

  // Validate price and price ID before proceeding
  if (!price || !price.id) {
    const errorMessage = `Missing price id for subscription ${subscription.id} (organization: ${organizationId})`;
    console.error("Failed to sync Stripe data - missing price information:", {
      subscriptionId: subscription.id,
      organizationId,
      hasPrice: !!price,
      hasPriceId: !!price?.id,
      primaryItemId: primaryItem?.id
    });
    throw new Error(errorMessage);
  }

  const limits: StripeSubscriptionCache["limits"] = {
    aiQueries: 1000,
    documentAnalysis: true,
    customBranding: true,
  };

  const now = Date.now();
  
  // Extract current_period_end from subscription items (Stripe moved it from top-level to items)
  // Use the maximum current_period_end across all items, or default to 0 if none available
  const items = subscription.items?.data;
  const periodEnds = items
    ?.map((item) => item.current_period_end)
    .filter((end): end is number => typeof end === "number" && end > 0) ?? [];
  const currentPeriodEnd = periodEnds.length > 0 ? Math.max(...periodEnds) : 0;

  const cachePayload: StripeSubscriptionCache = {
    subscriptionId: subscription.id,
    stripeCustomerId: extractStripeCustomerId(subscription),
    status: normalizeSubscriptionStatus(subscription.status),
    priceId: price.id,
    seats: primaryItem?.quantity ?? 1,
    currentPeriodEnd,
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    limits,
    cachedAt: now,
    // Cache expiration is configurable via cacheDurationMs parameter
    expiresAt: now + cacheDurationMs,
  };

  const cacheKey = getOrganizationCacheKey(organizationId);

  if (!overwriteExisting) {
    const existing = await getStripeSubscriptionCache(env, organizationId);
    if (existing) {
      return existing;
    }
  }

  await env.CHAT_SESSIONS.put(cacheKey, JSON.stringify(cachePayload));

  return cachePayload;
}

export async function applyStripeSubscriptionUpdate(args: {
  env: Env;
  organizationId: string;
  stripeSubscription: Stripe.Subscription;
  plan?: string | null;
  overwriteExisting?: boolean;
  cacheDurationMs?: number;
}): Promise<StripeSubscriptionCache> {
  const { env, organizationId, stripeSubscription, plan, overwriteExisting, cacheDurationMs } = args;

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
}

export async function clearStripeSubscriptionCache(env: Env, organizationId: string): Promise<void> {
  await env.CHAT_SESSIONS.delete(getOrganizationCacheKey(organizationId));
  await updateOrganizationSubscriptionMetadata({
    env,
    organizationId,
    stripeCustomerId: null,
    plan: "free",
    seats: 1,
    status: "canceled",
  });
}

export async function mapUserToStripeCustomer(env: Env, userId: string, customerId: string): Promise<void> {
  const cacheKey = getUserCacheKey(userId);
  await env.CHAT_SESSIONS.put(cacheKey, JSON.stringify({ customerId }), {
    metadata: { updatedAt: Date.now() },
  });
}

export async function getMappedStripeCustomer(env: Env, userId: string): Promise<string | null> {
  const cacheKey = getUserCacheKey(userId);
  
  try {
    const data = await env.CHAT_SESSIONS.get(cacheKey, { type: "json" });
    
    // Validate that data is a non-null object with customerId property
    if (data && typeof data === 'object' && 'customerId' in data) {
      const customerId = data.customerId;
      if (typeof customerId === 'string') {
        return customerId;
      }
    }
    
    return null;
  } catch (error) {
    // Handle any unexpected errors during cache retrieval
    console.warn(`Failed to retrieve cached customer data for user ${userId}:`, error);
    return null;
  }
}

export async function refreshStripeSubscriptionById(args: {
  env: Env;
  organizationId: string;
  subscriptionId: string;
  plan?: string | null;
  stripeClient?: Stripe;
  cacheDurationMs?: number;
}): Promise<StripeSubscriptionCache> {
  const { env, organizationId, subscriptionId, plan, cacheDurationMs } = args;
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
      cacheDurationMs,
    });
  } catch (error) {
    // Log error with contextual details
    console.error("Failed to retrieve Stripe subscription", {
      operation: "refreshStripeSubscriptionById",
      subscriptionId,
      organizationId,
      error: {
        type: error instanceof Error ? error.constructor.name : typeof error,
        message: error instanceof Error ? error.message : String(error),
        // Preserve important Stripe error fields if available
        ...(error && typeof error === "object" && "status" in error && { status: error.status }),
        ...(error && typeof error === "object" && "code" in error && { code: error.code }),
        ...(error && typeof error === "object" && "type" in error && { stripeType: error.type }),
      },
    });

    // Rethrow with a clearer message while preserving the original error
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
    env.ENABLE_STRIPE_SUBSCRIPTIONS === true || env.ENABLE_STRIPE_SUBSCRIPTIONS === 'true';

  if (!stripeEnabled || !env.STRIPE_SECRET_KEY) {
    throw new Error('Stripe integration disabled or credentials missing');
  }

  // Get the subscription for this organization
  const subscriptionRecord = await env.DB.prepare(
    `SELECT stripe_subscription_id, stripe_customer_id
     FROM subscriptions
     WHERE reference_id = ? AND status IN ('active', 'trialing')
     LIMIT 1`
  )
    .bind(organizationId)
    .first<{ stripe_subscription_id: string | null; stripe_customer_id: string | null }>();

  if (!subscriptionRecord?.stripe_subscription_id) {
    throw new Error('No active subscription found for organization');
  }

  const client = getOrCreateStripeClient(env);

  try {
    // Cancel the subscription immediately
    await client.subscriptions.cancel(subscriptionRecord.stripe_subscription_id, {
      idempotencyKey: `cancel-sub-${subscriptionRecord.stripe_subscription_id}-${Date.now()}`
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
    env.ENABLE_STRIPE_SUBSCRIPTIONS === true || env.ENABLE_STRIPE_SUBSCRIPTIONS === 'true';

  if (!stripeEnabled || !env.STRIPE_SECRET_KEY) {
    console.warn(
      `Skipping Stripe cleanup for customer ${stripeCustomerId}: Stripe integration disabled or credentials missing.`
    );
    return;
  }

  const client = getOrCreateStripeClient(env);

  try {
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
  } catch (error) {
    throw new Error(
      `Failed to clean up Stripe customer ${stripeCustomerId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error }
    );
  }
}
