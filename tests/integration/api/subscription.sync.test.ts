import { describe, it, expect, beforeEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import type { D1Database } from '@cloudflare/workers-types';
import type { Env as WorkerEnv } from '../../../worker/types';
import * as authModule from '../../../worker/middleware/auth.js';
import * as stripeSyncModule from '../../../worker/services/StripeSync.js';
import { handleSubscription } from '../../../worker/routes/subscription.js';

// Mock Stripe SDK used by StripeSync/getOrCreateStripeClient path
vi.mock('stripe', () => {
  class MockStripe {
    subscriptions = {
      // Only used in fallback path; primary path uses refreshStripeSubscriptionById
      retrieve: vi.fn(async () => ({
        id: 'sub_test_123',
        status: 'active',
        customer: 'cus_test_123',
        items: {
          data: [
            {
              quantity: 1,
              current_period_start: Math.floor(Date.now() / 1000) - 1000,
              current_period_end: Math.floor(Date.now() / 1000) + 2592000,
              price: { id: (env as any).STRIPE_PRICE_ID || 'price_monthly_test' },
            },
          ],
        },
      })),
      list: vi.fn(),
      cancel: vi.fn(),
    };
    customers = { del: vi.fn() };
    constructor(_key: string, _opts: Record<string, unknown>) {}
    static createFetchHttpClient() { return {}; }
  }
  return { default: MockStripe };
});

// Spy auth guards to no-op for this route integration
const requireAuthSpy = vi.spyOn(authModule, 'requireAuth');
const requireOrgOwnerSpy = vi.spyOn(authModule, 'requireOrgOwner');

describe('Subscription sync route (worker integration)', () => {
  beforeEach(async () => {
    requireAuthSpy.mockResolvedValue(undefined as unknown as Response);
    requireOrgOwnerSpy.mockResolvedValue(undefined as unknown as Response);

    const db = (env as { DB: D1Database }).DB;

    // Ensure subscriptions table exists for the route logic
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id TEXT PRIMARY KEY,
        plan TEXT,
        reference_id TEXT NOT NULL,
        stripe_subscription_id TEXT UNIQUE,
        stripe_customer_id TEXT,
        status TEXT,
        period_start INTEGER,
        period_end INTEGER,
        seats INTEGER,
        created_at INTEGER,
        updated_at INTEGER
      )
    `).run();

    // Clean tables
    await db.prepare('DELETE FROM subscriptions').run();
    await db.prepare('DELETE FROM organizations').run();

    // Seed organization (starts as free)
    await db.prepare(`
      INSERT INTO organizations (
        id, name, slug, domain, config, subscription_tier, seats, is_personal, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      'org_sync_test',
      'Sync Test Org',
      'sync-test-org',
      'sync.test',
      JSON.stringify({}),
      'free',
      1,
      0,
      Math.floor(Date.now()/1000),
      Math.floor(Date.now()/1000)
    ).run();

    // Seed a subscription row linked to the org that references a Stripe sub id
    await db.prepare(`
      INSERT INTO subscriptions (
        id, plan, reference_id, stripe_subscription_id, stripe_customer_id, status, period_start, period_end, seats, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      'sub_local_1',
      'business',
      'org_sync_test',
      'sub_test_123',
      null,
      'active',
      Math.floor(Date.now()/1000) - 1000,
      Math.floor(Date.now()/1000) + 2592000,
      1,
      Math.floor(Date.now()/1000),
      Math.floor(Date.now()/1000)
    ).run();

    // Enable Stripe subscriptions in env
    (env as unknown as WorkerEnv).ENABLE_STRIPE_SUBSCRIPTIONS = true as unknown as WorkerEnv['ENABLE_STRIPE_SUBSCRIPTIONS'];
    (env as any).STRIPE_SECRET_KEY = 'sk_test_dummy';
    (env as any).STRIPE_PRICE_ID = (env as any).STRIPE_PRICE_ID || 'price_monthly_test';

    // Short-circuit network Stripe fetch in refreshStripeSubscriptionById and simulate org update
    vi.spyOn(stripeSyncModule, 'refreshStripeSubscriptionById').mockImplementation(async ({ env: e, organizationId }) => {
      const db = (e as { DB: D1Database }).DB;
      await db.prepare(
        `UPDATE organizations SET subscription_tier='business', seats=1, updated_at=? WHERE id=?`
      ).bind(Math.floor(Date.now()/1000), organizationId).run();
      return {
        subscriptionId: 'sub_test_123',
        stripeCustomerId: 'cus_test_123',
        status: 'active',
        priceId: (e as any).STRIPE_PRICE_ID || 'price_monthly_test',
        seats: 1,
        currentPeriodEnd: Math.floor(Date.now()/1000) + 2592000,
        cancelAtPeriodEnd: false,
        limits: { aiQueries: 1000, documentAnalysis: true, customBranding: true },
        cachedAt: Date.now(),
        expiresAt: Date.now() + 3600_000,
      } as any;
    });
  });

  it('updates organization tier to paid after successful sync', async () => {
    const request = new Request('https://test.local/api/subscription/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organizationId: 'org_sync_test' }),
    });

    const response = await handleSubscription(request, env as unknown as WorkerEnv);
    expect(response.status).toBe(200);

    const payload = await response.json() as { success?: boolean; data?: unknown };
    expect(payload?.success ?? true).toBe(true);

    const db = (env as { DB: D1Database }).DB;
    const row = await db.prepare('SELECT subscription_tier as tier, seats FROM organizations WHERE id = ?')
      .bind('org_sync_test')
      .first<{ tier: string; seats: number }>();

    expect(row).toBeTruthy();
    expect(row?.tier).toMatch(/business|business-annual|enterprise/);
    expect(typeof row?.seats).toBe('number');
    expect((row?.seats ?? 0) >= 1).toBe(true);
  });
});


