import Stripe from "stripe";
import type { Env } from "../types";
import { HttpErrors, handleError, createSuccessResponse } from "../errorHandler";
import {
  clearStripeSubscriptionCache,
  refreshStripeSubscriptionById,
  resolveOrganizationForStripeIdentifiers,
  getOrCreateStripeClient,
} from "../services/SubscriptionService.js";

const HANDLED_EVENT_TYPES = new Set<string>([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "customer.subscription.trial_will_end",
]);

function getSubscriptionFromEvent(event: Stripe.Event): Stripe.Subscription | null {
  const data = event.data?.object;
  if (!data) {
    return null;
  }
  if (typeof data === "string") {
    return null;
  }
  if ("object" in data && typeof data.object === "string" && data.object === "subscription") {
    return data as unknown as Stripe.Subscription;
  }
  if ("id" in data && "status" in data && "items" in data) {
    return data as unknown as Stripe.Subscription;
  }
  return null;
}

async function resolveOrganizationId(
  env: Env,
  subscription: Stripe.Subscription
): Promise<string | null> {
  const metadataOrgId =
    typeof subscription.metadata?.organizationId === "string"
      ? subscription.metadata.organizationId
      : typeof subscription.metadata?.referenceId === "string"
      ? subscription.metadata.referenceId
      : null;

  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id ?? null;

  return resolveOrganizationForStripeIdentifiers(env, {
    organizationIdFromMetadata: metadataOrgId,
    subscriptionId: subscription.id,
    customerId,
  });
}

export async function handleStripeWebhook(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    throw HttpErrors.methodNotAllowed("Stripe webhook only accepts POST");
  }

  if (!env.ENABLE_STRIPE_SUBSCRIPTIONS) {
    return createSuccessResponse({ ignored: true, reason: "Stripe subscriptions disabled" });
  }

  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw HttpErrors.internalServerError("Stripe webhook secret not configured");
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    throw HttpErrors.badRequest("Missing Stripe-Signature header");
  }

  let event: Stripe.Event;
  const payload = await request.text();
  try {
    event = Stripe.webhooks.constructEvent(payload, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    console.error("❌ Invalid Stripe webhook signature", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw HttpErrors.badRequest("Invalid Stripe webhook signature");
  }

  if (!HANDLED_EVENT_TYPES.has(event.type)) {
    return createSuccessResponse({ handled: false, eventType: event.type });
  }

  const subscription = getSubscriptionFromEvent(event);
  if (!subscription) {
    console.warn("⚠️ Stripe webhook missing subscription object", { eventType: event.type });
    return createSuccessResponse({ handled: false, reason: "No subscription object" });
  }

  const organizationId = await resolveOrganizationId(env, subscription);
  if (!organizationId) {
    console.warn("⚠️ Stripe webhook could not resolve organization", {
      eventType: event.type,
      subscriptionId: subscription.id,
    });
    return createSuccessResponse({ handled: false, reason: "Organization not resolved" });
  }

  try {
    if (event.type === "customer.subscription.deleted") {
      await clearStripeSubscriptionCache(env, organizationId);
    } else {
      const client = getOrCreateStripeClient(env);
      await refreshStripeSubscriptionById({
        env,
        organizationId,
        subscriptionId: subscription.id,
        stripeClient: client,
      });
    }
  } catch (error) {
    console.error("❌ Failed to process Stripe webhook", {
      eventType: event.type,
      subscriptionId: subscription.id,
      organizationId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw HttpErrors.internalServerError("Failed to process Stripe webhook event");
  }

  return createSuccessResponse({ handled: true });
}

export async function handleStripeWebhookWithErrorHandling(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    return await handleStripeWebhook(request, env);
  } catch (error) {
    return handleError(error);
  }
}
