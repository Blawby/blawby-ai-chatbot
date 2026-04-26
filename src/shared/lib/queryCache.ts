import { atom } from 'nanostores';

const DEFAULT_TTL = 60_000;

type Entry<T = unknown> = { data: T; expiresAt: number };

const cacheStore = atom<Record<string, Entry>>({});
const inflight = new Map<string, Promise<unknown>>();

export const queryCache = {
  getStore: () => cacheStore,

  get<T>(key: string): T | undefined {
    const e = cacheStore.get()[key] as Entry<T> | undefined;
    return e && e.expiresAt > Date.now() ? e.data : undefined;
  },

  set<T>(key: string, data: T, ttl = DEFAULT_TTL): void {
    cacheStore.set({ ...cacheStore.get(), [key]: { data, expiresAt: Date.now() + ttl } });
  },

  // Exact-key or prefix invalidation; also clears any in-flight request for that key.
  invalidate(key: string, prefix = false): void {
    const snap = cacheStore.get();
    const match = (k: string) => prefix ? k.startsWith(key) : k === key;
    const next: typeof snap = {};
    for (const [k, v] of Object.entries(snap)) {
      if (!match(k)) next[k] = v;
    }
    cacheStore.set(next);
    for (const k of inflight.keys()) {
      if (match(k)) inflight.delete(k);
    }
  },

  // Coalesces concurrent requests for the same key into one fetch,
  // then caches the result with the given TTL.
  async coalesceGet<T>(
    key: string,
    fetcher: (signal?: AbortSignal) => Promise<T>,
    opts: { ttl?: number; signal?: AbortSignal } = {}
  ): Promise<T> {
    const cached = queryCache.get<T>(key);
    if (cached !== undefined) return cached;

    const existing = inflight.get(key) as Promise<T> | undefined;
    if (existing) return existing;

    const p = fetcher(opts.signal).then(
      (data) => { queryCache.set(key, data, opts.ttl); inflight.delete(key); return data; },
      (err) => { inflight.delete(key); throw err; }
    );
    inflight.set(key, p);
    return p;
  },
};
