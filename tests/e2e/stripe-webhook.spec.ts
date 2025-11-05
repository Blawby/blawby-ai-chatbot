import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import Stripe from 'stripe';

// Helper to read webhook secret from .dev.vars or environment
function getWebhookSecret(): string {
  // First try environment variable
  if (process.env.STRIPE_WEBHOOK_SECRET) {
    return process.env.STRIPE_WEBHOOK_SECRET;
  }

  // Then try reading from .dev.vars (same as worker uses)
  try {
    const devVarsPath = join(process.cwd(), '.dev.vars');
    const devVarsContent = readFileSync(devVarsPath, 'utf-8');
    // Match STRIPE_WEBHOOK_SECRET=value (with optional quotes)
    const secretMatch = devVarsContent.match(/^STRIPE_WEBHOOK_SECRET=\s*['"]?([^'"\r\n]+)['"]?\s*$/m);
    if (secretMatch && secretMatch[1].trim()) {
      const secret = secretMatch[1].trim();
      if (secret.length > 0) {
        return secret;
      }
    }
  } catch {
    // .dev.vars not found or not readable
  }

  // Fallback for testing (but warn that it won't work with real signatures)
  console.warn('⚠️  STRIPE_WEBHOOK_SECRET not found. Set it in .dev.vars or as environment variable.');
  console.warn('⚠️  Run "stripe listen" to get a webhook secret, then add it to .dev.vars');
  return 'whsec_test_secret_for_e2e';
}

const fallbackSecret = 'whsec_test_secret_for_e2e';
const webhookSecret = getWebhookSecret();
const usingFallbackSecret = !webhookSecret || webhookSecret === fallbackSecret;

// Log secret status for debugging
if (!usingFallbackSecret) {
  console.log(`✅ Using webhook secret from .dev.vars (starts with: ${webhookSecret.substring(0, 10)}...)`);
} else {
  console.warn('⚠️  Using fallback secret - tests will be skipped unless a real secret is configured');
}

const describeFn = usingFallbackSecret ? test.describe.skip : test.describe;

describeFn('Stripe Webhook Integration', () => {
  const baseUrl = 'http://localhost:8787';

  // Helper to create a properly signed Stripe webhook event
  function createSignedWebhookEvent(
    eventType: string,
    subscriptionData: any
  ): { body: string; signature: string } {
    const event: Stripe.Event = {
      id: `evt_test_${Date.now()}`,
      object: 'event',
      api_version: '2024-12-18.acacia',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: subscriptionData,
        previous_attributes: {},
      },
      livemode: false,
      pending_webhooks: 1,
      request: {
        id: null,
        idempotency_key: null,
      },
      type: eventType as Stripe.Event.Type,
    };

    const payload = JSON.stringify(event);

    // Verify secret is being used (not auto-generated)
    if (!webhookSecret || webhookSecret === fallbackSecret) {
      console.warn('⚠️  Using fallback secret - webhook signatures will not match worker');
    }

    const signatureHeader = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: webhookSecret,
      timestamp: Math.floor(Date.now() / 1000),
    });

    return {
      body: payload,
      signature: signatureHeader,
    };
  }

  // Helper to make webhook requests directly to the worker
  async function sendWebhookRequest(
    body: string,
    signature: string
  ): Promise<{ status: number; data?: any; error?: string }> {
    try {
      const response = await fetch(`${baseUrl}/api/stripe/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': signature,
        },
        body: body,
      });

      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }

      return {
        status: response.status,
        data: response.ok ? data : undefined,
        error: response.ok ? undefined : text,
      };
    } catch (err) {
      return {
        status: 0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  test('should reject webhook request without signature', async () => {
    const response = await sendWebhookRequest('{}', '');
    
    expect(response.status).toBe(400);
    expect(response.error).toContain('Missing Stripe-Signature');
  });

  test('should reject webhook request with invalid signature', async () => {
    const response = await sendWebhookRequest('{}', 'invalid_signature');
    
    expect(response.status).toBe(400);
    expect(response.error).toContain('Invalid Stripe webhook signature');
  });

  test('should handle unsupported event types gracefully', async () => {
    const subscription = {
      id: 'sub_test_unsupported',
      customer: 'cus_test',
      metadata: {},
      object: 'subscription',
      status: 'active',
      items: { data: [] },
    };

    // Skip if using fallback secret (can't generate valid signatures)
    if (webhookSecret === 'whsec_test_secret_for_e2e') {
      test.skip();
      return;
    }

    const { body, signature } = createSignedWebhookEvent(
      'charge.succeeded',
      subscription
    );

    const response = await sendWebhookRequest(body, signature);
    
    if (response.status !== 200) {
      console.error('Webhook request failed:', response.error);
      console.error('Signature used:', signature.substring(0, 50) + '...');
    }
    
    expect(response.status).toBe(200);
    expect(response.data).toMatchObject({
      success: true,
      data: {
        handled: false,
        eventType: 'charge.succeeded',
      },
    });
  });

  test('should handle subscription.updated event (if organization exists)', async () => {
    const subscription = {
      id: `sub_test_${Date.now()}`,
      customer: `cus_test_${Date.now()}`,
      metadata: {},
      object: 'subscription',
      status: 'active',
      items: {
        data: [{
          id: 'si_test',
          price: { id: 'price_test' },
          quantity: 1,
        }],
      },
      current_period_end: Math.floor(Date.now() / 1000) + 86400,
      cancel_at_period_end: false,
    };

    const { body, signature } = createSignedWebhookEvent(
      'customer.subscription.updated',
      subscription
    );

    const response = await sendWebhookRequest(body, signature);
    
    // Should return 200 even if organization not found (graceful handling)
    expect(response.status).toBe(200);
    // The response might indicate handled: false if org not found, or handled: true if it exists
    expect(response.data).toBeDefined();
  });

  test('should handle subscription.deleted event', async () => {
    const subscription = {
      id: `sub_test_del_${Date.now()}`,
      customer: `cus_test_del_${Date.now()}`,
      metadata: {},
      object: 'subscription',
      status: 'canceled',
      items: { data: [] },
    };

    const { body, signature } = createSignedWebhookEvent(
      'customer.subscription.deleted',
      subscription
    );

    const response = await sendWebhookRequest(body, signature);
    
    // Should return 200 even if organization not found (graceful handling)
    expect(response.status).toBe(200);
    expect(response.data).toBeDefined();
  });

  test('should handle subscription.paused event', async () => {
    const subscription = {
      id: `sub_test_paused_${Date.now()}`,
      customer: `cus_test_paused_${Date.now()}`,
      metadata: {},
      object: 'subscription',
      status: 'active',
      pause_collection: { behavior: 'keep_as_draft' },
      items: { data: [] },
    };

    const { body, signature } = createSignedWebhookEvent(
      'customer.subscription.paused',
      subscription
    );

    const response = await sendWebhookRequest(body, signature);
    
    expect(response.status).toBe(200);
    expect(response.data).toBeDefined();
  });

  test('should handle subscription.resumed event', async () => {
    const subscription = {
      id: `sub_test_resumed_${Date.now()}`,
      customer: `cus_test_resumed_${Date.now()}`,
      metadata: {},
      object: 'subscription',
      status: 'active',
      items: { data: [] },
    };

    const { body, signature } = createSignedWebhookEvent(
      'customer.subscription.resumed',
      subscription
    );

    const response = await sendWebhookRequest(body, signature);
    
    expect(response.status).toBe(200);
    expect(response.data).toBeDefined();
  });

  test('should handle subscription.trial_will_end event', async () => {
    const subscription = {
      id: `sub_test_trial_${Date.now()}`,
      customer: `cus_test_trial_${Date.now()}`,
      metadata: {},
      object: 'subscription',
      status: 'trialing',
      trial_end: Math.floor(Date.now() / 1000) + 86400,
      items: { data: [] },
    };

    const { body, signature } = createSignedWebhookEvent(
      'customer.subscription.trial_will_end',
      subscription
    );

    const response = await sendWebhookRequest(body, signature);
    
    expect(response.status).toBe(200);
    expect(response.data).toBeDefined();
  });

  test('should handle idempotency (same event processed twice)', async () => {
    const subscription = {
      id: `sub_test_idempotent_${Date.now()}`,
      customer: `cus_test_idempotent_${Date.now()}`,
      metadata: {},
      object: 'subscription',
      status: 'active',
      items: { data: [] },
    };

    const { body, signature } = createSignedWebhookEvent(
      'customer.subscription.updated',
      subscription
    );

    // First request
    const response1 = await sendWebhookRequest(body, signature);
    expect(response1.status).toBe(200);

    // Second request with same event (should be idempotent)
    const response2 = await sendWebhookRequest(body, signature);
    expect(response2.status).toBe(200);
    
    // Should indicate cached/handled response
    expect(response2.data).toBeDefined();
  });
});
