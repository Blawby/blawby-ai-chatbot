/**
 * Per-isolate cache + in-flight dedup for the worker.
 *
 * Mirrors `src/shared/lib/queryCache.ts` on the frontend. Use this in
 * place of bespoke `Map<string, CacheEntry>` + `Map<string, Promise>`
 * pairs that route handlers and services have been spinning up
 * one-by-one.
 *
 * Per-isolate scope is fine for short TTLs (seconds → minutes) — most
 * routes hit the same isolate within their TTL window, and a fresh
 * isolate just refetches once. For cross-isolate sharing (long TTLs,
 * heavy upstream costs) wrap this in a KV-backed layer at the call
 * site (see `practiceDetailsCache.ts` for the existing KV pattern).
 */

type Entry<T = unknown> = {
  data: T;
  expiresAt: number;
  lastAccessedAt: number;
};

const DEFAULT_TTL_MS = 60_000;
const DEFAULT_MAX_ENTRIES = 500;

const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
// Per-key generation counter — bumped on invalidate so an in-flight
// response captured before the bump won't write its result. Mirrors the
// frontend queryCache safety.
const generations = new Map<string, number>();
let globalGeneration = 0;
const getGen = (key: string) => generations.get(key) ?? globalGeneration;

const pruneExpired = (now: number) => {
  for (const [k, v] of cache.entries()) {
    if (v.expiresAt <= now) cache.delete(k);
  }
};

const pruneOverflow = (max: number) => {
  if (cache.size <= max) return;
  // LRU eviction by lastAccessedAt
  const sorted = [...cache.entries()].sort(
    ([, a], [, b]) => a.lastAccessedAt - b.lastAccessedAt,
  );
  const drop = cache.size - max;
  for (let i = 0; i < drop; i++) cache.delete(sorted[i][0]);
};

export const edgeCache = {
  get<T>(key: string): T | undefined {
    const entry = cache.get(key) as Entry<T> | undefined;
    if (!entry || entry.expiresAt <= Date.now()) return undefined;
    entry.lastAccessedAt = Date.now();
    return entry.data;
  },

  set<T>(key: string, data: T, ttlMs = DEFAULT_TTL_MS): void {
    const now = Date.now();
    cache.set(key, { data, expiresAt: now + ttlMs, lastAccessedAt: now });
    pruneOverflow(DEFAULT_MAX_ENTRIES);
  },

  /**
   * Invalidate one key (exact) or all keys with the given prefix.
   * Bumps the generation for matching keys so any in-flight responses
   * captured before the call are silently dropped on arrival.
   */
  invalidate(key: string, prefix = false): void {
    const match = (k: string) => prefix ? k.startsWith(key) : k === key;
    for (const k of cache.keys()) {
      if (match(k)) {
        generations.set(k, (generations.get(k) ?? globalGeneration) + 1);
        cache.delete(k);
      }
    }
    for (const k of inflight.keys()) if (match(k)) inflight.delete(k);
  },

  /** Wipe everything — use sparingly. */
  clear(): void {
    globalGeneration += 1;
    cache.clear();
    inflight.clear();
    generations.clear();
  },

  /**
   * Coalesces concurrent requests for the same key into one fetch, then
   * caches the result for the given TTL. The captured generation is
   * checked before writing — if `invalidate` ran while the fetch was in
   * flight, the value is returned to the caller but not written.
   */
  async get_or_fetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    opts: { ttlMs?: number } = {},
  ): Promise<T> {
    pruneExpired(Date.now());

    const cached = edgeCache.get<T>(key);
    if (cached !== undefined) return cached;

    const existing = inflight.get(key) as Promise<T> | undefined;
    if (existing) return existing;

    const generation = getGen(key);
    const p = fetcher().then(
      (data) => {
        if (getGen(key) === generation) edgeCache.set(key, data, opts.ttlMs);
        inflight.delete(key);
        return data;
      },
      (err) => { inflight.delete(key); throw err; },
    );
    inflight.set(key, p);
    return p;
  },
};
