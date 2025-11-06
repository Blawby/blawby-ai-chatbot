import type { Env } from "../types";
import { parseJsonBody } from "../utils.js";
import { HttpErrors, handleError, createSuccessResponse } from "../errorHandler";
import { requireAuth, requireOrgOwner } from "../middleware/auth.js";
import {
  clearStripeSubscriptionCache,
  refreshStripeSubscriptionById,
  cancelOrganizationSubscription,
} from "../services/SubscriptionService.js";

interface SyncSubscriptionRequest {
  organizationId: string;
}

function isStripeSubscriptionsEnabled(env: Env): boolean {
  return env.ENABLE_STRIPE_SUBSCRIPTIONS === "true" || env.ENABLE_STRIPE_SUBSCRIPTIONS === true;
}

export async function handleSubscription(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  try {
    if (!isStripeSubscriptionsEnabled(env)) {
      throw HttpErrors.notFound("Stripe subscription endpoints are disabled");
    }
    if (path === "/api/subscription/sync" && request.method === "POST") {
      let requestBody: SyncSubscriptionRequest;
      try {
        requestBody = (await parseJsonBody(request)) as SyncSubscriptionRequest;
      } catch (err) {
        throw HttpErrors.badRequest('Invalid JSON: ' + (err instanceof Error ? err.message : String(err)));
      }
      
      const { organizationId } = requestBody;

      if (!organizationId) {
        throw HttpErrors.badRequest("organizationId is required");
      }

      await requireAuth(request, env);
      await requireOrgOwner(request, env, organizationId);

      // Find subscription for this org in database
      const subscription = await env.DB.prepare(
        `SELECT stripe_subscription_id 
           FROM subscriptions 
          WHERE reference_id = ? 
            AND status IN ('active','trialing') 
          ORDER BY updated_at DESC 
          LIMIT 1`
      ).bind(organizationId).first<{ stripe_subscription_id: string | null }>();

      if (subscription?.stripe_subscription_id) {
        // Refresh existing subscription from Stripe
        const cache = await refreshStripeSubscriptionById({
          env,
          organizationId,
          subscriptionId: subscription.stripe_subscription_id,
          plan: null,
        });
        return createSuccessResponse({ synced: true, subscription: cache });
      }

      return createSuccessResponse({
        synced: false,
        message: "No subscription record found for organization; webhook events populate subscriptions automatically.",
      });
    }

    if (path === "/api/subscription/cancel" && request.method === "POST") {
      let requestBody: SyncSubscriptionRequest;
      try {
        requestBody = (await parseJsonBody(request)) as SyncSubscriptionRequest;
      } catch (err) {
        throw HttpErrors.badRequest('Invalid JSON: ' + (err instanceof Error ? err.message : String(err)));
      }
      
      const { organizationId } = requestBody;

      if (!organizationId) {
        throw HttpErrors.badRequest("organizationId is required");
      }

      await requireAuth(request, env);
      await requireOrgOwner(request, env, organizationId);

      await cancelOrganizationSubscription({ env, organizationId });

      // Ensure local cache is cleared so entitlement updates immediately
      await clearStripeSubscriptionCache(env, organizationId);

      return createSuccessResponse({ cancelled: true });
    }

    throw HttpErrors.notFound("Subscription endpoint not found");
  } catch (error) {
    return handleError(error);
  }
}
