import { atom } from 'nanostores';

const DEFAULT_TTL = 60_000;
const DEFAULT_MAX_ENTRIES = 200;
// Entries hang around past their freshness deadline so SWR consumers can
// display stale data while a background refresh runs. Eviction kicks in
// after STALE_FACTOR × ttl. 24× covers normal session-length browsing.
const STALE_FACTOR = 24;
const STORAGE_KEY = 'blawby:queryCache:v1';

type Entry<T = unknown> = {
  data: T;
  /** Past this timestamp, the entry is considered stale (needs refetch). */
  expiresAt: number;
  /** Past this timestamp, the entry is dropped entirely. */
  evictAt: number;
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

// Skip sessionStorage persistence during `vite dev` so HMR reloads always
// start with a cold cache. This means skeletons render on every refresh
// while iterating on loading states, instead of the SWR path serving
// instant cached data and hiding the placeholder. Production builds (and
// `vite preview`) keep persistence enabled — that's where SWR pays off.
const isDevMode = (): boolean => {
  try {
    return Boolean(import.meta.env?.DEV);
  } catch {
    return false;
  }
};

const hasStorage = (): boolean => {
  if (typeof window === 'undefined') return false;
  if (isDevMode()) return false;
  try {
    return Boolean(window.sessionStorage);
  } catch {
    return false;
  }
};

let hydrated = false;
const hydrateFromStorage = () => {
  if (hydrated || !hasStorage()) return;
  hydrated = true;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, Entry>;
    if (!parsed || typeof parsed !== 'object') return;
    const now = Date.now();
    const next: Record<string, Entry> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (!v || typeof v !== 'object') continue;
      // Drop already-evicted entries on hydrate so we don't grow the store
      // with dead weight from previous sessions.
      if (typeof v.evictAt !== 'number' || v.evictAt <= now) continue;
      next[k] = v;
    }
    cacheStore.set(next);
  } catch {
    // Corrupt storage / parse error — wipe it and move on.
    try { window.sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }
};

const persistToStorage = () => {
  if (!hasStorage()) return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(cacheStore.get()));
  } catch {
    // QuotaExceededError or similar — drop the persistence attempt rather
    // than crashing. The in-memory cache is still authoritative.
  }
};

const pruneExpired = (now: number) => {
  const snap = cacheStore.get();
  let changed = false;
  const next: typeof snap = {};
  for (const [k, v] of Object.entries(snap)) {
    if (v.evictAt > now) {
      next[k] = v;
    } else {
      changed = true;
    }
  }
  if (changed) {
    cacheStore.set(next);
    persistToStorage();
  }
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

  /**
   * Return the cached value if it exists, regardless of freshness. Returns
   * `undefined` only if the entry was never cached, was invalidated, or
   * has aged past its `evictAt` deadline. Use `isFresh` to distinguish
   * fresh from stale.
   */
  get<T>(key: string): T | undefined {
    hydrateFromStorage();
    const snap = cacheStore.get();
    const e = snap[key] as Entry<T> | undefined;
    if (!e || e.evictAt <= Date.now()) return undefined;
    e.lastAccessedAt = Date.now();
    return e.data;
  },

  /** True if the entry exists AND is still within its freshness TTL. */
  isFresh(key: string): boolean {
    hydrateFromStorage();
    const e = cacheStore.get()[key];
    return Boolean(e && e.expiresAt > Date.now());
  },

  set<T>(key: string, data: T, ttl = DEFAULT_TTL): void {
    const now = Date.now();
    cacheStore.set({
      ...cacheStore.get(),
      [key]: {
        data,
        expiresAt: now + ttl,
        evictAt: now + ttl * STALE_FACTOR,
        lastAccessedAt: now,
      },
    });
    pruneOverflow(DEFAULT_MAX_ENTRIES);
    persistToStorage();
  },

  /**
   * Invalidate one key (exact match) or all keys with a given prefix.
   * Bumps the generation for matching keys so any in-flight responses
   * captured before the call are silently dropped on arrival.
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
    persistToStorage();
  },

  /** Clear everything. Bumps the global generation so all in-flight
   *  responses are dropped on arrival. Used by the `auth:session-cleared`
   *  window event listener. */
  clear(): void {
    globalGeneration += 1;
    cacheStore.set({});
    inflight.clear();
    generations.clear();
    if (hasStorage()) {
      try { window.sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    }
  },

  /**
   * Single-flight fetcher with optional stale-while-revalidate.
   *
   * Behavior:
   *   - Fresh cache hit: return cached value, no fetch.
   *   - Stale cache hit + `swr=true`: return stale value AND start a
   *     background refetch (if not already in flight). The refetch's
   *     resolved data updates the store; subscribers re-render with fresh
   *     data automatically.
   *   - Cold (no entry, or stale + `swr=false`): fetch and await.
   *
   * Concurrent calls coalesce into one in-flight promise per key. The
   * captured generation guards against invalidate-during-fetch races —
   * a fetch that resolves after invalidate runs is dropped on the floor.
   */
  async coalesceGet<T>(
    key: string,
    fetcher: (signal?: AbortSignal) => Promise<T>,
    opts: { ttl?: number; signal?: AbortSignal; swr?: boolean } = {}
  ): Promise<T> {
    ensureAuthClearListener();
    hydrateFromStorage();
    pruneExpired(Date.now());

    if (queryCache.isFresh(key)) {
      const fresh = queryCache.get<T>(key);
      if (fresh !== undefined) return fresh;
    }

    const stale = opts.swr ? queryCache.get<T>(key) : undefined;

    const startFetch = (): Promise<T> => {
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
    };

    if (stale !== undefined) {
      // Kick the refresh in the background; surface stale data immediately.
      void startFetch().catch(() => { /* swallowed; useQuery surfaces errors */ });
      return stale;
    }

    return startFetch();
  },
};
