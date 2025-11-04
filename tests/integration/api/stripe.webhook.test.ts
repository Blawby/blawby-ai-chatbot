import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import Stripe from 'stripe';
import type { Env as WorkerEnv } from '../../../worker/types';
import { handleStripeWebhook } from '../../../worker/routes/stripeWebhook.js';
import * as subscriptionServiceModule from '../../../worker/services/SubscriptionService.js';

const mockCache = {
  subscriptionId: 'sub_123',
  stripeCustomerId: 'cus_123',
  status: 'active' as const,
  priceId: 'price_123',
  seats: 1,
  currentPeriodEnd: 0,
  cancelAtPeriodEnd: false,
  limits: {
    aiQueries: 1000,
    documentAnalysis: true,
    customBranding: true,
  },
  cachedAt: Date.now(),
  expiresAt: undefined,
};

describe('Stripe webhook route', () => {
  beforeEach(() => {
    (env as unknown as WorkerEnv).ENABLE_STRIPE_SUBSCRIPTIONS = 'true' as any;
    (env as unknown as WorkerEnv).STRIPE_WEBHOOK_SECRET = 'whsec_test';
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('refreshes subscription when webhook delivers update', async () => {
    const subscription = {
      id: 'sub_123',
      customer: 'cus_123',
      metadata: {},
    } as unknown as Stripe.Subscription;

    vi.spyOn(Stripe.webhooks, 'constructEvent').mockReturnValue({
      type: 'customer.subscription.updated',
      data: { object: subscription },
    } as Stripe.Event);

    const resolveSpy = vi
      .spyOn(subscriptionServiceModule, 'resolveOrganizationForStripeIdentifiers')
      .mockResolvedValue('org_123');
    const refreshSpy = vi
      .spyOn(subscriptionServiceModule, 'refreshStripeSubscriptionById')
      .mockResolvedValue(mockCache);

    const request = new Request('https://test.local/api/stripe/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': 'sig_test',
      },
      body: '{}',
    });

    const response = await handleStripeWebhook(request, env as unknown as WorkerEnv);
    expect(response.status).toBe(200);
    expect(resolveSpy).toHaveBeenCalledWith(expect.anything(), {
      organizationIdFromMetadata: null,
      subscriptionId: 'sub_123',
      customerId: 'cus_123',
    });
    expect(refreshSpy).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org_123', subscriptionId: 'sub_123' })
    );
  });

  it('clears subscription when webhook reports deletion', async () => {
    const subscription = {
      id: 'sub_del_1',
      customer: 'cus_del',
      metadata: {},
    } as unknown as Stripe.Subscription;

    vi.spyOn(Stripe.webhooks, 'constructEvent').mockReturnValue({
      type: 'customer.subscription.deleted',
      data: { object: subscription },
    } as Stripe.Event);

    vi.spyOn(subscriptionServiceModule, 'resolveOrganizationForStripeIdentifiers').mockResolvedValue(
      'org_del'
    );
    const clearSpy = vi.spyOn(subscriptionServiceModule, 'clearStripeSubscriptionCache').mockResolvedValue();

    const request = new Request('https://test.local/api/stripe/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': 'sig_test',
      },
      body: '{}',
    });

    const response = await handleStripeWebhook(request, env as unknown as WorkerEnv);
    expect(response.status).toBe(200);
    expect(clearSpy).toHaveBeenCalledWith(expect.anything(), 'org_del');
  });

  it('ignores unsupported event types', async () => {
    vi.spyOn(Stripe.webhooks, 'constructEvent').mockReturnValue({
      type: 'charge.succeeded',
      data: { object: {} },
    } as Stripe.Event);

    const request = new Request('https://test.local/api/stripe/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': 'sig_test',
      },
      body: '{}',
    });

    const response = await handleStripeWebhook(request, env as unknown as WorkerEnv);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({ handled: false, eventType: 'charge.succeeded' }));
  });
});
