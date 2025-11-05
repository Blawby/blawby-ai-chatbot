import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Env } from '../../../worker/types.js';
import { applyStripeSubscriptionUpdate } from '../../../worker/services/SubscriptionService.js';
import type Stripe from 'stripe';

describe('SubscriptionService.applyStripeSubscriptionUpdate', () => {
  let env: Env;
  let statements: Array<{ sql: string; args: unknown[] }>;
  let prepareMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    statements = [];

    prepareMock = vi.fn((sql: string) => {
      return {
        bind: (...args: unknown[]) => {
          statements.push({ sql, args });

          const defaultRun = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } });
          const defaultFirst = vi.fn().mockResolvedValue(null);
          const defaultAll = vi.fn().mockResolvedValue({ results: [] });

          return {
            run: defaultRun,
            first: defaultFirst,
            all: defaultAll,
          };
        },
      };
    });

    env = {
      DB: {
        prepare: prepareMock,
      } as unknown as Env['DB'],
      AI: {} as any,
      CHAT_SESSIONS: {} as any,
      RESEND_API_KEY: 'test',
      DOC_EVENTS: {} as any,
      PARALEGAL_TASKS: {} as any,
    } as Env;
  });

  it('upserts subscription and marks organization as business when status is active', async () => {
    const stripeSubscription = {
      id: 'sub_123',
      customer: 'cus_123',
      items: {
        data: [
          {
            id: 'si_123',
            price: {
              id: 'price_monthly',
              nickname: 'Business Monthly',
            },
            quantity: 3,
          },
        ],
      },
      status: 'active',
      current_period_start: 1_700_000_000,
      current_period_end: 1_700_086_400,
      cancel_at_period_end: false,
      metadata: {},
    } as unknown as Stripe.Subscription;

    const cache = await applyStripeSubscriptionUpdate({
      env,
      organizationId: 'org_123',
      stripeSubscription,
      plan: 'business',
    });

    expect(cache.subscriptionId).toBe('sub_123');
    expect(cache.status).toBe('active');
    expect(cache.seats).toBe(3);
    expect(cache.priceId).toBe('price_monthly');

    const subscriptionInsert = statements.find((entry) =>
      entry.sql.includes('INSERT INTO subscriptions')
    );
    expect(subscriptionInsert).toBeDefined();

    const organizationUpdate = statements.find((entry) =>
      entry.sql.includes('UPDATE organizations')
    );
    expect(organizationUpdate).toBeDefined();
    expect(organizationUpdate?.args[0]).toBe('cus_123'); // stripe_customer_id
    expect(organizationUpdate?.args[1]).toBe('price_monthly'); // subscription_tier / plan identifier
    expect(organizationUpdate?.args[2]).toBe(3); // seats
    expect(organizationUpdate?.args[3]).toBe(1); // mark business (is_personal -> 0)
    expect(typeof organizationUpdate?.args[4]).toBe('number'); // updated_at timestamp (seconds)
    expect((organizationUpdate?.args[4] as number)).toBeGreaterThan(0);
    expect(organizationUpdate?.args[5]).toBe('org_123'); // organization id
  });
});
