import type { Env } from "../types";
import { HttpError } from "../types";
import { parseJsonBody } from "../utils";
import { HttpErrors, handleError, createSuccessResponse, createHttpError } from "../errorHandler";
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
            const stripe = new (await import('stripe')).default(
              env.STRIPE_SECRET_KEY,
              { apiVersion: '2025-09-30.clover' as unknown as import('stripe').Stripe.StripeConfig['apiVersion'] }
            );
            const stripeResp = await stripe.subscriptions.retrieve(stripeSubscriptionId, { expand: ['items.data.price'] });
            const stripeSub = stripeResp as unknown as import('stripe').Stripe.Subscription;
            const seatsRaw = stripeSub?.items?.data?.[0]?.quantity;
            if (typeof seatsRaw !== 'number' || !Number.isFinite(seatsRaw) || seatsRaw <= 0) {
              throw HttpErrors.badRequest('Invalid subscription seats returned by Stripe');
            }
            const seats = seatsRaw;
            const items = stripeSub?.items?.data ?? [];
            const topLevelStarts = typeof (stripeSub as { current_period_start?: unknown })?.current_period_start === 'number' && (stripeSub as { current_period_start?: number }).current_period_start! > 0
              ? [(stripeSub as { current_period_start?: number }).current_period_start!]
              : [] as number[];
            const topLevelEnds = typeof (stripeSub as { current_period_end?: unknown })?.current_period_end === 'number' && (stripeSub as { current_period_end?: number }).current_period_end! > 0
              ? [(stripeSub as { current_period_end?: number }).current_period_end!]
              : [] as number[];
            const itemStarts = items
              .map((item) => item.current_period_start)
              .filter((start): start is number => typeof start === 'number' && start > 0);
            const itemEnds = items
              .map((item) => item.current_period_end)
              .filter((end): end is number => typeof end === 'number' && end > 0);
            const allStarts = [...topLevelStarts, ...itemStarts];
            const allEnds = [...topLevelEnds, ...itemEnds];
            if (allStarts.length === 0) {
              throw HttpErrors.badRequest('Missing current period start from Stripe subscription');
            }
            const periodStart = Math.min(...allStarts);
            const periodEnd = allEnds.length > 0 ? Math.max(...allEnds) : null;
            const status = stripeSub?.status;
            if (!status) {
              throw HttpErrors.badRequest('Missing subscription status from Stripe response');
            }
            const customerId =
              typeof stripeSub?.customer === 'string'
                ? stripeSub.customer
                : (stripeSub?.customer && typeof (stripeSub.customer as { id?: unknown }).id === 'string'
                    ? (stripeSub.customer as { id: string }).id
                    : null);
            if (!customerId) {
              console.warn('Stripe subscription missing customer id; proceeding with NULL stripe_customer_id', {
                stripeSubscriptionId,
                organizationId,
              });
            }
            const primaryItem = stripeSub?.items?.data?.[0];
            const priceObj = primaryItem?.price;
            const priceId: string | null = typeof priceObj === 'string' ? priceObj : priceObj?.id ?? null;
            const pricePlanMeta: string | null = typeof priceObj !== 'string' ? (priceObj?.metadata as { plan?: string } | undefined)?.plan ?? null : null;

            // Map Stripe price/product to internal plan
            const monthlyPriceId = env.STRIPE_PRICE_ID;
            const annualPriceId = env.STRIPE_ANNUAL_PRICE_ID;
            let plan: string | null = null;

            if (priceId && monthlyPriceId && priceId === monthlyPriceId) {
              plan = 'business';
            } else if (priceId && annualPriceId && priceId === annualPriceId) {
              plan = 'business-annual';
            } else if (pricePlanMeta && typeof pricePlanMeta === 'string') {
              // Optional: allow explicit plan from price metadata if configured
              plan = pricePlanMeta;
            }

            if (!plan) {
              console.error('Unknown Stripe price/product for subscription sync', {
                stripeSubscriptionId,
                priceId,
                hasMonthlyEnv: !!monthlyPriceId,
                hasAnnualEnv: !!annualPriceId,
              });
              throw HttpErrors.badRequest('Subscription price does not match expected Stripe price IDs');
            }

            const upsert = await env.DB.prepare(
              `INSERT INTO subscriptions (id, plan, reference_id, stripe_subscription_id, stripe_customer_id, status, period_start, period_end, seats, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s','now'), strftime('%s','now'))
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
              plan,
              organizationId,
              stripeSubscriptionId,
              customerId ?? null,
              status,
              periodStart,
              periodEnd,
              seats
            ).run();
            console.log('✅ Upserted subscription from Stripe in sync:', { success: upsert.success, changes: upsert.meta?.changes });
            subscriptionRecord = {
              id: `sub_${stripeSubscriptionId}`,
              plan,
              referenceId: organizationId,
              stripeSubscriptionId,
            };

            // Optionally update org tier if active
            if (status === 'active') {
              if (!plan) {
                throw createHttpError(500, 'Invariant violation: missing plan for active subscription update');
              }
              const normalizedTier = typeof plan === 'string' ? plan.replace(/-annual$/, '') : plan;
              await env.DB.prepare(
                `UPDATE organizations SET subscription_tier=?, seats=?, stripe_customer_id=COALESCE(stripe_customer_id, ?), updated_at=CURRENT_TIMESTAMP WHERE id=?`
              ).bind(normalizedTier, seats, customerId, organizationId).run();
            }
          } catch (e) {
            // Preserve original error details in logs for observability
            console.error('❌ Failed Stripe fallback upsert in sync', {
              error: e instanceof Error ? e.message : String(e),
              stack: e instanceof Error ? e.stack : undefined,
              context: { stripeSubscriptionId, organizationId }
            });
            // Preserve original HTTP error statuses; map config errors to 500; unknown to 502
            if (e instanceof HttpError) {
              throw e;
            }
            const message = e instanceof Error ? e.message : String(e);
            if (message.includes('Stripe not configured')) {
              throw createHttpError(500, message);
            }
            throw createHttpError(502, `Stripe sync failed: ${message}`);
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
