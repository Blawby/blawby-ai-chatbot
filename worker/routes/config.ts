import type { Env } from '../types';
import { createSuccessResponse } from '../errorHandler';

export async function handleConfig(request: Request, env: Env): Promise<Response> {
  const _url = new URL(request.url);
  
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    // Note: We are moving subscription/stripe logic to the remote API (staging-api),
    // but we keep this endpoint backward-compatible to avoid breaking cached clients.
    const subscriptionsEnabled = String((env as Record<string, unknown>).ENABLE_STRIPE_SUBSCRIPTIONS ?? '').toLowerCase() === 'true';
    const stripePriceId = String((env as Record<string, unknown>).STRIPE_PRICE_ID ?? '');
    const stripeAnnualPriceId = String((env as Record<string, unknown>).STRIPE_ANNUAL_PRICE_ID ?? '');

    // Only expose non-sensitive configuration to frontend
    const config = {
      // Backward-compatible stripe fields (non-secret IDs + boolean flag)
      stripe: {
        priceId: stripePriceId,
        annualPriceId: stripeAnnualPriceId,
        subscriptionsEnabled,
      },
      features: {
        // Backward-compatible subscription flag expected by older clients
        stripeSubscriptions: subscriptionsEnabled,
        emailVerification: String(env.REQUIRE_EMAIL_VERIFICATION ?? '').toLowerCase() === 'true'
      }
    };

    return createSuccessResponse(config);
  } catch (error) {
    console.error('Error getting configuration:', error);
    return new Response('Internal server error', { status: 500 });
  }
}
