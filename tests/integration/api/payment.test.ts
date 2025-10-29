import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { unstable_dev } from 'wrangler';
import type { Unstable_DevWorker } from 'wrangler';

/**
 * SECURITY NOTE: The organizations API must not return plaintext credentials.
 * This test loads credentials from environment variables to avoid
 * exfiltrating secrets at runtime. Never rely on API endpoints for
 * secret retrieval in tests or production code.
 */
describe('Payment API Integration - Legacy Endpoints Disabled', () => {
  let worker: Unstable_DevWorker;

  beforeAll(async () => {
    worker = await unstable_dev('worker/index.ts', {
      experimental: { disableExperimentalWarning: true },
      vars: {
        PAYMENT_API_KEY: 'test-key',
        RESEND_API_KEY: 'test-resend-key',
        BLAWBY_API_URL: 'https://staging.blawby.com',
        BLAWBY_API_TOKEN: 'test-token',
        BLAWBY_ORGANIZATION_ULID: 'test-organization-ulid',
        ENABLE_STRIPE_SUBSCRIPTIONS: 'true'
      }
    });
  });

  afterAll(async () => {
    if (worker) {
      await worker.stop();
    }
  });

  it('returns 410 when legacy upgrade endpoint is called', async () => {
    const response = await worker.fetch('/api/payment/upgrade', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(410);
    const result = await response.json() as { success?: boolean; error?: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain('Legacy payment endpoints are disabled');
  });
});
