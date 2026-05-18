/**
 * queryCache primitive — locks in the request-dedup property that the
 * "cold load shows ≤6 requests" SPEED budget depends on. If the
 * coalesceGet contract regresses (multiple in-flight fetches for the
 * same key, or stale-write after invalidate), this test fails before
 * a regression hits production.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { queryCache } from '../../../src/shared/lib/queryCache';

beforeEach(() => {
  queryCache.clear();
});

describe('queryCache.coalesceGet', () => {
  it('coalesces concurrent calls into one fetcher invocation', async () => {
    const fetcher = vi.fn(async () => 42);
    const [a, b, c] = await Promise.all([
      queryCache.coalesceGet('k', fetcher),
      queryCache.coalesceGet('k', fetcher),
      queryCache.coalesceGet('k', fetcher),
    ]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(a).toBe(42);
    expect(b).toBe(42);
    expect(c).toBe(42);
  });

  it('returns cached value on subsequent calls within TTL', async () => {
    const fetcher = vi.fn(async () => 'fresh');
    const a = await queryCache.coalesceGet('k', fetcher);
    const b = await queryCache.coalesceGet('k', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(a).toBe('fresh');
    expect(b).toBe('fresh');
  });

  it('refetches after TTL expires', async () => {
    const now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const fetcher = vi.fn(async () => Math.random());
    await queryCache.coalesceGet('k', fetcher, { ttl: 100 });
    expect(fetcher).toHaveBeenCalledTimes(1);

    vi.setSystemTime(now + 200);
    await queryCache.coalesceGet('k', fetcher, { ttl: 100 });
    expect(fetcher).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('refetches after invalidate', async () => {
    const fetcher = vi.fn(async () => 1);
    await queryCache.coalesceGet('k', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);

    queryCache.invalidate('k');
    await queryCache.coalesceGet('k', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('invalidate with prefix=true clears all matching keys', async () => {
    const fetcher = vi.fn(async () => 1);
    await queryCache.coalesceGet('practice:1:matters', fetcher);
    await queryCache.coalesceGet('practice:1:invoices', fetcher);
    await queryCache.coalesceGet('clients:1:list', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(3);

    queryCache.invalidate('practice:1:', /* prefix */ true);

    // Both practice keys should refetch; clients should still be cached.
    await queryCache.coalesceGet('practice:1:matters', fetcher);
    await queryCache.coalesceGet('practice:1:invoices', fetcher);
    await queryCache.coalesceGet('clients:1:list', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(5); // 3 + 2 refetches
  });

  it('drops in-flight writes if invalidate runs while the fetch is pending', async () => {
    let resolve!: (v: number) => void;
    const slowFetcher = vi.fn(async () => new Promise<number>((r) => { resolve = r; }));
    const promise = queryCache.coalesceGet('k', slowFetcher);

    // Invalidate while the fetcher is still pending.
    queryCache.invalidate('k');

    // Now resolve the original fetch.
    resolve(42);
    const result = await promise;
    expect(result).toBe(42); // caller still gets the value

    // But the value should NOT be cached — a fresh call refetches.
    const fetcher2 = vi.fn(async () => 99);
    const next = await queryCache.coalesceGet('k', fetcher2);
    expect(next).toBe(99);
    expect(fetcher2).toHaveBeenCalledTimes(1);
  });

  it('clear wipes everything (auth-session-cleared semantics)', async () => {
    const fetcher = vi.fn(async () => 1);
    await queryCache.coalesceGet('a', fetcher);
    await queryCache.coalesceGet('b', fetcher);
    await queryCache.coalesceGet('c', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(3);

    queryCache.clear();

    await queryCache.coalesceGet('a', fetcher);
    await queryCache.coalesceGet('b', fetcher);
    await queryCache.coalesceGet('c', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(6);
  });
});

describe('queryCache.set / .get', () => {
  it('stores and retrieves a value', () => {
    queryCache.set('k', { foo: 'bar' });
    expect(queryCache.get('k')).toEqual({ foo: 'bar' });
  });

  it('returns undefined for missing keys', () => {
    expect(queryCache.get('does-not-exist')).toBeUndefined();
  });

  it('keeps stale entries readable until evictAt while flipping isFresh false', () => {
    // Post-G1: get() returns stale data so SWR consumers can render it
    // while a background refresh runs. isFresh() distinguishes fresh
    // from stale. Eviction happens at STALE_FACTOR × ttl past expiresAt.
    const now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    queryCache.set('k', 'value', 100);
    expect(queryCache.get('k')).toBe('value');
    expect(queryCache.isFresh('k')).toBe(true);

    // Past TTL but well within the stale window: still readable, no longer fresh.
    vi.setSystemTime(now + 200);
    expect(queryCache.get('k')).toBe('value');
    expect(queryCache.isFresh('k')).toBe(false);

    // Past STALE_FACTOR × ttl (24 × 100ms): evicted.
    vi.setSystemTime(now + 100 * 25);
    expect(queryCache.get('k')).toBeUndefined();
    expect(queryCache.isFresh('k')).toBe(false);

    vi.useRealTimers();
  });
});
