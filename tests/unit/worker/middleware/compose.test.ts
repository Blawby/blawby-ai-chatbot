import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Env } from '../../../../worker/types.js';
import { edgeCache } from '../../../../worker/utils/edgeCache.js';

const env = { NODE_ENV: 'test', ALLOW_DEBUG: 'false' } as Env;
const ctx = {
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
} as unknown as ExecutionContext;

beforeEach(() => {
  edgeCache.clear();
});

describe('withCache', () => {
  it('returns cached body on second call within TTL', async () => {
    const { withCache } = await import('../../../../worker/middleware/compose.js');
    const calls = vi.fn(async () => new Response(JSON.stringify({ n: Math.random() }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    const handler = withCache(calls, {
      keyFn: () => 'practice:test:fixture',
    });

    const r1 = await handler(new Request('https://x/a'), env, ctx);
    const r2 = await handler(new Request('https://x/a'), env, ctx);

    expect(calls).toHaveBeenCalledTimes(1);
    expect(await r1.text()).toBe(await r2.text());
  });

  it('skips caching when keyFn returns null', async () => {
    const { withCache } = await import('../../../../worker/middleware/compose.js');
    const calls = vi.fn(async () => new Response('ok'));
    const handler = withCache(calls, { keyFn: () => null });

    await handler(new Request('https://x/a'), env, ctx);
    await handler(new Request('https://x/a'), env, ctx);

    expect(calls).toHaveBeenCalledTimes(2);
  });

  it('does not cache responses where cacheable predicate returns false', async () => {
    const { withCache } = await import('../../../../worker/middleware/compose.js');
    const calls = vi.fn(async () => new Response('err', { status: 500 }));
    const handler = withCache(calls, {
      keyFn: () => 'practice:test:fixture',
      cacheable: (r) => r.status >= 200 && r.status < 300,
    });

    await handler(new Request('https://x/a'), env, ctx);
    await handler(new Request('https://x/a'), env, ctx);

    expect(calls).toHaveBeenCalledTimes(2);
  });
});

describe('withRateLimit', () => {
  it('returns 429 after max requests', async () => {
    const { withRateLimit } = await import('../../../../worker/middleware/compose.js');
    const handler = withRateLimit(
      async () => new Response('ok'),
      { keyFn: () => 'test-key', max: 2, windowMs: 60_000 },
    );

    const r1 = await handler(new Request('https://x/a'), env, ctx);
    const r2 = await handler(new Request('https://x/a'), env, ctx);
    const r3 = await handler(new Request('https://x/a'), env, ctx);

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(429);
    const body = await r3.json() as { retryAfter: number };
    expect(body.retryAfter).toBeGreaterThan(0);
  });

  it('skips rate-limit when keyFn returns null', async () => {
    const { withRateLimit } = await import('../../../../worker/middleware/compose.js');
    const handler = withRateLimit(
      async () => new Response('ok'),
      { keyFn: () => null, max: 1, windowMs: 60_000 },
    );

    const r1 = await handler(new Request('https://x/a'), env, ctx);
    const r2 = await handler(new Request('https://x/a'), env, ctx);

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
  });
});
