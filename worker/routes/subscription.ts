import type { Env } from "../types";
import { HttpError } from "../types";
import { parseJsonBody } from "../utils";
import { HttpErrors, handleError, createSuccessResponse, createHttpError } from "../errorHandler";
import { requireAuth, requireOrgOwner } from "../middleware/auth.js";
import {
  clearStripeSubscriptionCache,
  refreshStripeSubscriptionById,
  cancelOrganizationSubscription,
  getOrCreateStripeClient,
  applyStripeSubscriptionUpdate,
} from "../services/StripeSync.js";

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

      const { session } = await requireAuth(request, env);
      await requireOrgOwner(request, env, organizationId);

      // Find subscription for this org in database
      const subscription = await env.DB.prepare(
        `SELECT stripe_subscription_id FROM subscriptions WHERE reference_id = ? ORDER BY updated_at DESC LIMIT 1`
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

      // No subscription in database - check if there's a Stripe customer we should check
      const org = await env.DB.prepare(
        `SELECT stripe_customer_id FROM organizations WHERE id = ? LIMIT 1`
      ).bind(organizationId).first<{ stripe_customer_id: string | null }>();

      let stripeCustomerId = org?.stripe_customer_id ?? null;

      // If org doesn't have stripe_customer_id, check if user does
      if (!stripeCustomerId && session?.user?.id) {
        const user = await env.DB.prepare(
          `SELECT stripe_customer_id FROM users WHERE id = ? LIMIT 1`
        ).bind(session.user.id).first<{ stripe_customer_id: string | null }>();
        stripeCustomerId = user?.stripe_customer_id ?? null;
      }

      // If we have a customer ID, check Stripe for active subscriptions
      if (stripeCustomerId) {
        try {
          const stripeClient = getOrCreateStripeClient(env);
          const stripeSubscriptions = await stripeClient.subscriptions.list({
            customer: stripeCustomerId,
            status: 'all',
            limit: 10,
          });

          // Find the most recent active subscription
          const activeSub = stripeSubscriptions.data
            .filter(sub => sub.status === 'active' || sub.status === 'trialing')
            .sort((a, b) => (b.created || 0) - (a.created || 0))[0];

          if (activeSub) {
            // Extract plan name from subscription
            const planName = activeSub.items?.data?.[0]?.price?.metadata?.plan || 
                            activeSub.items?.data?.[0]?.price?.nickname || 
                            'business';
            const normalizedPlan = planName.toLowerCase().replace(/-annual$/, '');

            // Insert or update subscription record
            const seats = activeSub.items?.data?.[0]?.quantity ?? 1;
            const items = activeSub.items?.data ?? [];
            const periodStarts = items
              .map((item) => item.current_period_start)
              .filter((start): start is number => typeof start === 'number' && start > 0);
            const periodEnds = items
              .map((item) => item.current_period_end)
              .filter((end): end is number => typeof end === 'number' && end > 0);
            const periodStart = periodStarts.length > 0 ? Math.min(...periodStarts) : Math.floor(Date.now() / 1000);
            const periodEnd = periodEnds.length > 0 ? Math.max(...periodEnds) : null;
            const status = activeSub.status ?? 'incomplete';

            await env.DB.prepare(
              `INSERT INTO subscriptions (
                 id, plan, reference_id, stripe_subscription_id, stripe_customer_id, status,
                 period_start, period_end, seats, created_at, updated_at
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s','now'), strftime('%s','now'))
               ON CONFLICT(stripe_subscription_id) DO UPDATE SET
                 status=excluded.status,
                 plan=excluded.plan,
                 seats=excluded.seats,
                 period_start=excluded.period_start,
                 period_end=excluded.period_end,
                 reference_id=COALESCE(reference_id, excluded.reference_id),
                 stripe_customer_id=excluded.stripe_customer_id,
                 updated_at=strftime('%s','now')`
            ).bind(
              activeSub.id,
              normalizedPlan,
              organizationId,
              activeSub.id,
              stripeCustomerId,
              status,
              periodStart,
              periodEnd,
              seats
            ).run();

            // Update organization and KV cache
            await applyStripeSubscriptionUpdate({
              env,
              organizationId,
              stripeSubscription: activeSub,
              plan: normalizedPlan,
            });

            // Also update the organization's stripe_customer_id if not set
            if (!org?.stripe_customer_id) {
              await env.DB.prepare(
                `UPDATE organizations SET stripe_customer_id = ? WHERE id = ?`
              ).bind(stripeCustomerId, organizationId).run();
            }

            const cache = await refreshStripeSubscriptionById({
              env,
              organizationId,
              subscriptionId: activeSub.id,
              plan: normalizedPlan,
            });

            return createSuccessResponse({ 
              synced: true, 
              subscription: cache,
              message: "Subscription found in Stripe and synced"
            });
          }
        } catch (error) {
          console.error('Error checking Stripe for subscription:', error);
          // Fall through to return "No subscription found"
        }
      }

      // No subscription found anywhere
      await clearStripeSubscriptionCache(env, organizationId);
      return createSuccessResponse({ synced: false, message: "No subscription found" });
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

      // Refresh to update org tier
      const subscription = await env.DB.prepare(
        `SELECT stripe_subscription_id FROM subscriptions WHERE reference_id = ? LIMIT 1`
      ).bind(organizationId).first<{ stripe_subscription_id: string | null }>();

      if (subscription?.stripe_subscription_id) {
        await refreshStripeSubscriptionById({
          env,
          organizationId,
          subscriptionId: subscription.stripe_subscription_id,
          plan: null,
        });
      }

      return createSuccessResponse({ cancelled: true });
    }

    throw HttpErrors.notFound("Subscription endpoint not found");
  } catch (error) {
    return handleError(error);
  }
}
