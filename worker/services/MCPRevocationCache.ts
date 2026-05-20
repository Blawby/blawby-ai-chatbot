import type { KVNamespace } from '@cloudflare/workers-types';
import type { Env } from '../types.js';

/**
 * MCPRevocationCache — fast revocation propagation for MCP tokens.
 *
 * Plan R4: "Revocation propagates ≤ 30s via per-practice revocation epoch
 * (KV) + jti denylist."
 *
 * Two independent signals:
 *   1. Per-practice epoch: monotonic counter in KV. Backend increments on
 *      session revoke. Tokens carry `practice_revocation_epoch_at_issue`
 *      claim; if current epoch > token's claim, token is revoked.
 *   2. Per-jti denylist: short-TTL KV entries. Emergency fast-path for
 *      individual tokens that need immediate revocation before their TTL.
 *
 * Both reads are wrapped in an isolate-local 30s cache to avoid hammering
 * KV on every tool call — the 30s ceiling matches the plan's stated
 * propagation SLA.
 *
 * For U7 we reuse the existing CHAT_SESSIONS KV namespace with the
 * `mcp:rev:` / `mcp:jti:` prefix. A dedicated `MCP_AUTH_CACHE` namespace
 * can be split out later as scale demands; the API here doesn't change.
 */

const EPOCH_KEY_PREFIX = 'mcp:rev:';
const JTI_KEY_PREFIX = 'mcp:jti:';
const CACHE_TTL_MS = 30_000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

interface CacheStats {
  epochHits: number;
  epochMisses: number;
  jtiHits: number;
  jtiMisses: number;
}

const epochCache = new Map<string, CacheEntry<number>>();
const jtiCache = new Map<string, CacheEntry<boolean>>();
const stats: CacheStats = { epochHits: 0, epochMisses: 0, jtiHits: 0, jtiMisses: 0 };

const now = (): number => Date.now();

const getKv = (env: Env): KVNamespace => env.CHAT_SESSIONS;

export class MCPRevocationCache {
  constructor(private readonly env: Env) {}

  async getPracticeEpoch(practiceId: string): Promise<number> {
    const key = `${EPOCH_KEY_PREFIX}${practiceId}`;
    const cached = epochCache.get(key);
    if (cached && cached.expiresAt > now()) {
      stats.epochHits += 1;
      return cached.value;
    }
    stats.epochMisses += 1;
    const raw = await getKv(this.env).get(key);
    const value = raw === null ? 0 : Number.parseInt(raw, 10);
    const epoch = Number.isFinite(value) && value >= 0 ? value : 0;
    epochCache.set(key, { value: epoch, expiresAt: now() + CACHE_TTL_MS });
    return epoch;
  }

  async isJtiRevoked(jti: string): Promise<boolean> {
    const key = `${JTI_KEY_PREFIX}${jti}`;
    const cached = jtiCache.get(key);
    if (cached && cached.expiresAt > now()) {
      stats.jtiHits += 1;
      return cached.value;
    }
    stats.jtiMisses += 1;
    const raw = await getKv(this.env).get(key);
    const revoked = raw !== null;
    jtiCache.set(key, { value: revoked, expiresAt: now() + CACHE_TTL_MS });
    return revoked;
  }

  /**
   * Increment the per-practice epoch (Worker-side fast path for U7 tests;
   * production normally drives this from Backend U1's revocation service).
   * Bumps the cached value and KV in one go.
   */
  async incrementPracticeEpoch(practiceId: string): Promise<number> {
    const key = `${EPOCH_KEY_PREFIX}${practiceId}`;
    const current = await this.getPracticeEpoch(practiceId);
    const next = current + 1;
    await getKv(this.env).put(key, String(next));
    epochCache.set(key, { value: next, expiresAt: now() + CACHE_TTL_MS });
    return next;
  }

  /**
   * Add a jti to the denylist with a TTL. Worker-side fast path; Backend
   * U1 normally calls this via its revocation service when a session is
   * explicitly killed.
   */
  async revokeJti(jti: string, ttlSeconds = 3600): Promise<void> {
    const key = `${JTI_KEY_PREFIX}${jti}`;
    await getKv(this.env).put(key, '1', { expirationTtl: ttlSeconds });
    jtiCache.set(key, { value: true, expiresAt: now() + CACHE_TTL_MS });
  }
}

/**
 * Test-only seam: drop the isolate-local caches so consecutive tests
 * don't see each other's writes. Production code paths never call this.
 */
export const __resetMCPRevocationCacheForTest = (): void => {
  epochCache.clear();
  jtiCache.clear();
  stats.epochHits = 0;
  stats.epochMisses = 0;
  stats.jtiHits = 0;
  stats.jtiMisses = 0;
};

export const __getMCPRevocationCacheStatsForTest = (): Readonly<CacheStats> => ({ ...stats });
