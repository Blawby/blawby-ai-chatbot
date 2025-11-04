import type { Env, StripeSubscriptionCache } from "../types.js";
import { HttpErrors } from "../errorHandler.js";
import {
  getStripeSubscriptionCache,
  refreshStripeSubscriptionById,
} from "../services/SubscriptionService.js";

export interface SubscriptionGuardOptions {
  organizationId: string;
  subscriptionId?: string;
  refreshIfMissing?: boolean;
}

export interface SubscriptionGuardResult {
  subscription: StripeSubscriptionCache;
  isActive: boolean;
  isTrialing: boolean;
}

export async function ensureActiveSubscription(
  env: Env,
  options: SubscriptionGuardOptions
): Promise<SubscriptionGuardResult> {
  const { organizationId, subscriptionId, refreshIfMissing = true } = options;

  let cache = await getStripeSubscriptionCache(env, organizationId);

  if (!cache && refreshIfMissing && subscriptionId) {
    cache = await refreshStripeSubscriptionById({
      env,
      organizationId,
      subscriptionId,
    });
  }

  if (!cache) {
    throw HttpErrors.paymentRequired("Subscription required for this feature");
  }

  const isActive = cache.status === "active";
  const isTrialing = cache.status === "trialing";

  if (!isActive && !isTrialing) {
    throw HttpErrors.paymentRequired(
      `Subscription is ${cache.status}. Please update billing to continue.`
    );
  }

  return {
    subscription: cache,
    isActive,
    isTrialing,
  };
}
