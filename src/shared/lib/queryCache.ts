import { atom } from 'nanostores';

const DEFAULT_TTL = 60_000;
const DEFAULT_MAX_ENTRIES = 200;

type Entry<T = unknown> = {
  data: T;
  expiresAt: number;
  lastAccessedAt: number;
};

const cacheStore = atom<Record<string, Entry>>({});
const inflight = new Map<string, Promise<unknown>>();
// Generation tracking — bumped on invalidate so an in-flight response from
// before the bump is dropped on arrival. Prevents stale writes from
// long-running requests that race with cache invalidation.
const generations = new Map<string, number>();
let globalGeneration = 0;
const getGeneration = (key: string) => generations.get(key) ?? globalGeneration;

const pruneExpired = (now: number) => {
  const snap = cacheStore.get();
  let changed = false;
  const next: typeof snap = {};
  for (const [k, v] of Object.entries(snap)) {
    if (v.expiresAt > now) {
      next[k] = v;
    } else {
      changed = true;
    }
  }
  if (changed) cacheStore.set(next);
};

const pruneOverflow = (maxEntries: number) => {
  const snap = cacheStore.get();
  const entries = Object.entries(snap);
  if (entries.length <= maxEntries) return;
  // LRU eviction by lastAccessedAt
  entries.sort(([, a], [, b]) => a.lastAccessedAt - b.lastAccessedAt);
  const next: typeof snap = {};
  const drop = entries.length - maxEntries;
  for (let i = drop; i < entries.length; i++) {
    next[entries[i][0]] = entries[i][1];
  }
  cacheStore.set(next);
};

let authClearListenerRegistered = false;
const ensureAuthClearListener = () => {
  if (authClearListenerRegistered || typeof window === 'undefined') return;
  window.addEventListener('auth:session-cleared', () => queryCache.clear());
  authClearListenerRegistered = true;
};

export const queryCache = {
  getStore: () => cacheStore,

  get<T>(key: string): T | undefined {
    const snap = cacheStore.get();
    const e = snap[key] as Entry<T> | undefined;
    if (!e || e.expiresAt <= Date.now()) return undefined;
    // Touch lastAccessedAt for LRU. Mutate in place — store value identity is
    // unchanged so subscribers don't re-render for a touch.
    e.lastAccessedAt = Date.now();
    return e.data;
  },

  set<T>(key: string, data: T, ttl = DEFAULT_TTL): void {
    const now = Date.now();
    cacheStore.set({
      ...cacheStore.get(),
      [key]: { data, expiresAt: now + ttl, lastAccessedAt: now },
    });
    pruneOverflow(DEFAULT_MAX_ENTRIES);
  },

  /**
   * Invalidate one key (exact match) or all keys with a given prefix.
   * Bumps the generation for matching keys so any in-flight responses
   * captured before the call are silently dropped on arrival. The bump
   * covers BOTH cached entries and currently-in-flight keys (which may
   * not have a cached value yet) — otherwise an invalidate-during-fetch
   * race would let the resolving fetcher write a stale value.
   */
  invalidate(key: string, prefix = false): void {
    const snap = cacheStore.get();
    const match = (k: string) => prefix ? k.startsWith(key) : k === key;
    const matched = new Set<string>();
    const next: typeof snap = {};
    for (const [k, v] of Object.entries(snap)) {
      if (match(k)) matched.add(k);
      else next[k] = v;
    }
    for (const k of inflight.keys()) {
      if (match(k)) matched.add(k);
    }
    for (const k of matched) {
      generations.set(k, (generations.get(k) ?? globalGeneration) + 1);
      inflight.delete(k);
    }
    cacheStore.set(next);
  },

  /** Clear everything. Bumps the global generation so all in-flight
   *  responses are dropped on arrival. Used by the `auth:session-cleared`
   *  window event listener. */
  clear(): void {
    globalGeneration += 1;
    cacheStore.set({});
    inflight.clear();
    generations.clear();
  },

  /**
   * Coalesces concurrent requests for the same key into one fetch, then
   * caches the result with the given TTL. The captured generation is
   * checked before writing — if `invalidate` ran while the fetch was in
   * flight, the result is returned to the caller but not cached.
   */
  async coalesceGet<T>(
    key: string,
    fetcher: (signal?: AbortSignal) => Promise<T>,
    opts: { ttl?: number; signal?: AbortSignal } = {}
  ): Promise<T> {
    ensureAuthClearListener();
    pruneExpired(Date.now());

    const cached = queryCache.get<T>(key);
    if (cached !== undefined) return cached;

    const existing = inflight.get(key) as Promise<T> | undefined;
    if (existing) return existing;

    const generation = getGeneration(key);
    const p = fetcher(opts.signal).then(
      (data) => {
        if (getGeneration(key) === generation) {
          queryCache.set(key, data, opts.ttl);
        }
        inflight.delete(key);
        return data;
      },
      (err) => { inflight.delete(key); throw err; }
    );
    inflight.set(key, p);
    return p;
  },
};
