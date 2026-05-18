/**
 * edgeCache primitive — worker-side mirror of queryCache. Same dedup
 * contract drives the worker's request-coalescing in RemoteApiService,
 * billingSummary, authProxy, etc. Regressions here would amplify
 * upstream API load.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { edgeCache } from '../../../../worker/utils/edgeCache';

beforeEach(() => {
  edgeCache.clear();
});

describe('edgeCache.get_or_fetch', () => {
  it('coalesces concurrent calls into one fetcher invocation', async () => {
    const fetcher = vi.fn(async () => 42);
    const [a, b, c] = await Promise.all([
      edgeCache.get_or_fetch('k', fetcher),
      edgeCache.get_or_fetch('k', fetcher),
      edgeCache.get_or_fetch('k', fetcher),
    ]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(a).toBe(42);
    expect(b).toBe(42);
    expect(c).toBe(42);
  });

  it('returns cached value on subsequent calls within TTL', async () => {
    const fetcher = vi.fn(async () => 'fresh');
    const a = await edgeCache.get_or_fetch('k', fetcher);
    const b = await edgeCache.get_or_fetch('k', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(a).toBe('fresh');
    expect(b).toBe('fresh');
  });

  it('refetches after TTL expires', async () => {
    const now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const fetcher = vi.fn(async () => Math.random());
    await edgeCache.get_or_fetch('k', fetcher, { ttlMs: 100 });
    expect(fetcher).toHaveBeenCalledTimes(1);

    vi.setSystemTime(now + 200);
    await edgeCache.get_or_fetch('k', fetcher, { ttlMs: 100 });
    expect(fetcher).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('respects the cacheable predicate (skips storage when false)', async () => {
    let counter = 0;
    const fetcher = vi.fn(async () => ({ status: 500, value: ++counter }));
    const opts = { cacheable: (r: { status: number }) => r.status < 500 };

    await edgeCache.get_or_fetch('k', fetcher, opts);
    await edgeCache.get_or_fetch('k', fetcher, opts);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('refetches after invalidate', async () => {
    const fetcher = vi.fn(async () => 1);
    await edgeCache.get_or_fetch('k', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);

    edgeCache.invalidate('k');
    await edgeCache.get_or_fetch('k', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('invalidate with prefix=true clears all matching keys', async () => {
    const fetcher = vi.fn(async () => 1);
    await edgeCache.get_or_fetch('practice:1:matters', fetcher);
    await edgeCache.get_or_fetch('practice:1:invoices', fetcher);
    await edgeCache.get_or_fetch('clients:1:list', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(3);

    edgeCache.invalidate('practice:1:', /* prefix */ true);

    await edgeCache.get_or_fetch('practice:1:matters', fetcher);
    await edgeCache.get_or_fetch('practice:1:invoices', fetcher);
    await edgeCache.get_or_fetch('clients:1:list', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(5); // 3 + 2 refetches
  });

  it('clear wipes everything', async () => {
    const fetcher = vi.fn(async () => 1);
    await edgeCache.get_or_fetch('a', fetcher);
    await edgeCache.get_or_fetch('b', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);

    edgeCache.clear();

    await edgeCache.get_or_fetch('a', fetcher);
    await edgeCache.get_or_fetch('b', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it('drops in-flight writes if invalidate runs while the fetch is pending', async () => {
    let resolve!: (v: number) => void;
    const slowFetcher = vi.fn(async () => new Promise<number>((r) => { resolve = r; }));
    const promise = edgeCache.get_or_fetch('k', slowFetcher);

    edgeCache.invalidate('k');

    resolve(42);
    expect(await promise).toBe(42);

    const fetcher2 = vi.fn(async () => 99);
    const next = await edgeCache.get_or_fetch('k', fetcher2);
    expect(next).toBe(99);
    expect(fetcher2).toHaveBeenCalledTimes(1);
  });
});

describe('edgeCache.get / .set', () => {
  it('stores and retrieves a value', () => {
    edgeCache.set('k', { foo: 'bar' });
    expect(edgeCache.get('k')).toEqual({ foo: 'bar' });
  });

  it('returns undefined for missing keys', () => {
    expect(edgeCache.get('does-not-exist')).toBeUndefined();
  });

  it('returns undefined when the entry has expired', () => {
    const now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    edgeCache.set('k', 'value', 100);
    expect(edgeCache.get('k')).toBe('value');

    vi.setSystemTime(now + 200);
    expect(edgeCache.get('k')).toBeUndefined();

    vi.useRealTimers();
  });
});
