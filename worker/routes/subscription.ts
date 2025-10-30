import type { Env } from "../types";
import { parseJsonBody } from "../utils";
import { HttpErrors, handleError, createSuccessResponse } from "../errorHandler";
import { requireAuth, requireOrgOwner } from "../middleware/auth.js";
import {
  clearStripeSubscriptionCache,
  refreshStripeSubscriptionById,
} from "../services/StripeSync.js";

interface SyncSubscriptionRequest {
  organizationId: string;
  /** Internal subscription ID - queries WHERE id = ? */
  subscriptionId?: string;
  /** Stripe subscription ID - queries WHERE stripe_subscription_id = ? */
  stripeSubscriptionId?: string;
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
      
      const { organizationId, subscriptionId, stripeSubscriptionId } = requestBody;

      if (!organizationId) {
        throw HttpErrors.badRequest("organizationId is required");
      }

      await requireAuth(request, env);
      await requireOrgOwner(request, env, organizationId);

      let subscriptionRecord: { id: string; plan: string | null; referenceId: string; stripeSubscriptionId: string | null } | undefined;

      if (subscriptionId) {
        // Query by internal subscription ID with ownership check
        subscriptionRecord = await env.DB.prepare(
          `SELECT id, plan, reference_id as referenceId, stripe_subscription_id as stripeSubscriptionId
             FROM subscriptions
            WHERE id = ? AND reference_id = ?
            LIMIT 1`
        )
          .bind(subscriptionId, organizationId)
          .first<{ id: string; plan: string | null; referenceId: string; stripeSubscriptionId: string | null }>();
      } else if (stripeSubscriptionId) {
        // Query by Stripe subscription ID with ownership check
        subscriptionRecord = await env.DB.prepare(
          `SELECT id, plan, reference_id as referenceId, stripe_subscription_id as stripeSubscriptionId
             FROM subscriptions
            WHERE stripe_subscription_id = ? AND reference_id = ?
            LIMIT 1`
        )
          .bind(stripeSubscriptionId, organizationId)
          .first<{ id: string; plan: string | null; referenceId: string; stripeSubscriptionId: string | null }>();

        // Fallback: if not found locally, attempt to fetch from Stripe and upsert
        if (!subscriptionRecord) {
          try {
            if (!env.STRIPE_SECRET_KEY) {
              throw new Error('Stripe not configured');
            }
            const stripe = new (await import('stripe')).default(env.STRIPE_SECRET_KEY, { apiVersion: null });
            const stripeSub = await stripe.subscriptions.retrieve(stripeSubscriptionId, { expand: ['items.data.price'] });
            const seats = stripeSub?.items?.data?.[0]?.quantity ?? 1;
            const periodStart = stripeSub?.current_period_start ?? Math.floor(Date.now() / 1000);
            const periodEnd = stripeSub?.current_period_end ?? null;
            const status = stripeSub?.status ?? 'active';
            const customerId = typeof stripeSub?.customer === 'string' ? stripeSub.customer : (stripeSub?.customer as any)?.id ?? null;

            const upsert = await env.DB.prepare(
              `INSERT INTO subscriptions (id, plan, reference_id, stripe_subscription_id, stripe_customer_id, status, period_start, period_end, seats, created_at, updated_at)
               VALUES (?, 'business', ?, ?, ?, ?, ?, ?, ?, strftime('%s','now'), strftime('%s','now'))
               ON CONFLICT(stripe_subscription_id) DO UPDATE SET
                 status=excluded.status,
                 seats=excluded.seats,
                 period_start=excluded.period_start,
                 period_end=excluded.period_end,
                 reference_id=excluded.reference_id,
                 stripe_customer_id=excluded.stripe_customer_id,
                 updated_at=strftime('%s','now')`
            ).bind(
              `sub_${stripeSubscriptionId}`,
              organizationId,
              stripeSubscriptionId,
              customerId,
              status,
              periodStart,
              periodEnd,
              seats
            ).run();
            console.log('✅ Upserted subscription from Stripe in sync:', { success: upsert.success, changes: upsert.meta?.changes });
            subscriptionRecord = {
              id: `sub_${stripeSubscriptionId}`,
              plan: 'business',
              referenceId: organizationId,
              stripeSubscriptionId,
            };

            // Optionally update org tier if active
            if (status === 'active') {
              await env.DB.prepare(
                `UPDATE organizations SET subscription_tier='business', seats=?, stripe_customer_id=COALESCE(stripe_customer_id, ?), updated_at=CURRENT_TIMESTAMP WHERE id=?`
              ).bind(seats, customerId, organizationId).run();
            }
          } catch (e) {
            console.error('❌ Failed Stripe fallback upsert in sync:', e);
          }
        }
      } else {
        // Fallback: query by organization ID (reference_id)
        subscriptionRecord = await env.DB.prepare(
          `SELECT id, plan, reference_id as referenceId, stripe_subscription_id as stripeSubscriptionId
             FROM subscriptions
            WHERE reference_id = ?
            ORDER BY updated_at DESC
            LIMIT 1`
        )
          .bind(organizationId)
          .first<{ id: string; plan: string | null; referenceId: string; stripeSubscriptionId: string | null }>();
      }

      const stripeId = subscriptionRecord?.stripeSubscriptionId;

      if (!stripeId) {
        await clearStripeSubscriptionCache(env, organizationId);
        return createSuccessResponse({
          synced: false,
          message: "No active Stripe subscription found for organization",
        });
      }

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
    }

    throw HttpErrors.notFound("Subscription endpoint not found");
  } catch (error) {
    return handleError(error);
  }
}
