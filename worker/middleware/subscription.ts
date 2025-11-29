import type { Env } from "../types.js";
import { HttpErrors } from "../errorHandler.js";
import { RemoteApiService } from "../services/RemoteApiService.js";

export interface SubscriptionGuardOptions {
  organizationId: string;
  subscriptionId?: string;
  refreshIfMissing?: boolean;
}

export interface SubscriptionGuardResult {
  subscriptionStatus: string;
  isActive: boolean;
  isTrialing: boolean;
}

export async function ensureActiveSubscription(
  env: Env,
  options: SubscriptionGuardOptions,
  request?: Request
): Promise<SubscriptionGuardResult> {
  const { organizationId } = options;

  // Fetch subscription status from remote API
  let subscriptionStatus: string;
  try {
    subscriptionStatus = await RemoteApiService.getSubscriptionStatus(env, organizationId, request);
  } catch (error) {
    throw HttpErrors.serviceUnavailable(
      "Unable to retrieve subscription status. Please try again later."
    );
  }

  const isActive = subscriptionStatus === "active";
  const isTrialing = subscriptionStatus === "trialing";

  if (!isActive && !isTrialing) {
    throw HttpErrors.paymentRequired(
      `Subscription is ${subscriptionStatus}. Please update billing to continue.`
    );
  }

  return {
    subscriptionStatus,
    isActive,
    isTrialing,
  };
}
