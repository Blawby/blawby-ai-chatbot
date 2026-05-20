import { describe, it, expect } from 'vitest';
import {
  canonicalJsonStringify,
  deriveIdempotencyKey,
  deriveHighRiskIdempotencyKey,
} from '../../../../worker/services/MCPIdempotency.js';
import type { Env } from '../../../../worker/types.js';

type SaltArg = string | null;
const buildEnv = (salt: SaltArg = 'test-salt'): Env => {
  const env: Record<string, unknown> = { NODE_ENV: 'test' };
  if (salt !== null) env.IDEMPOTENCY_SALT = salt;
  return env as unknown as Env;
};

const baseInputs = {
  toolName: 'add_matter_note',
  practiceId: 'practice-1',
  mcpSessionId: 'sess-1',
  toolCallSeq: 42,
  params: { matter_id: 'mat_01', body: 'Test note' },
};

describe('canonicalJsonStringify', () => {
  it('sorts object keys alphabetically at every depth', () => {
    expect(canonicalJsonStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalJsonStringify({ z: { c: 1, a: 2 } })).toBe('{"z":{"a":2,"c":1}}');
  });

  it('produces identical output for objects that differ only in key order', () => {
    const a = canonicalJsonStringify({ x: 1, y: { p: 'q', r: 's' } });
    const b = canonicalJsonStringify({ y: { r: 's', p: 'q' }, x: 1 });
    expect(a).toBe(b);
  });

  it('handles arrays positionally (order significant)', () => {
    expect(canonicalJsonStringify(['b', 'a'])).toBe('["b","a"]');
    expect(canonicalJsonStringify(['a', 'b'])).toBe('["a","b"]');
  });

  it('treats undefined as null and NaN/Infinity as null', () => {
    expect(canonicalJsonStringify(undefined)).toBe('null');
    expect(canonicalJsonStringify(NaN)).toBe('null');
    expect(canonicalJsonStringify(Infinity)).toBe('null');
  });

  it('escapes special characters in strings', () => {
    expect(canonicalJsonStringify('a"b')).toBe('"a\\"b"');
  });
});

describe('deriveIdempotencyKey', () => {
  it('returns a 64-char hex SHA-256 digest', async () => {
    const key = await deriveIdempotencyKey(buildEnv(), baseInputs);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces identical keys for identical inputs (deterministic)', async () => {
    const k1 = await deriveIdempotencyKey(buildEnv(), baseInputs);
    const k2 = await deriveIdempotencyKey(buildEnv(), baseInputs);
    expect(k1).toBe(k2);
  });

  it('produces identical keys when params differ only in property order', async () => {
    const k1 = await deriveIdempotencyKey(buildEnv(), {
      ...baseInputs,
      params: { matter_id: 'mat_01', body: 'Test note' },
    });
    const k2 = await deriveIdempotencyKey(buildEnv(), {
      ...baseInputs,
      params: { body: 'Test note', matter_id: 'mat_01' },
    });
    expect(k1).toBe(k2);
  });

  it('produces different keys when practice changes (per-practice scope)', async () => {
    const k1 = await deriveIdempotencyKey(buildEnv(), baseInputs);
    const k2 = await deriveIdempotencyKey(buildEnv(), { ...baseInputs, practiceId: 'practice-2' });
    expect(k1).not.toBe(k2);
  });

  it('produces different keys when tool changes', async () => {
    const k1 = await deriveIdempotencyKey(buildEnv(), baseInputs);
    const k2 = await deriveIdempotencyKey(buildEnv(), { ...baseInputs, toolName: 'triage_intake' });
    expect(k1).not.toBe(k2);
  });

  it('produces different keys when session changes (no cross-session dedup)', async () => {
    const k1 = await deriveIdempotencyKey(buildEnv(), baseInputs);
    const k2 = await deriveIdempotencyKey(buildEnv(), { ...baseInputs, mcpSessionId: 'sess-2' });
    expect(k1).not.toBe(k2);
  });

  it('produces different keys when tool_call_seq changes (unrelated repeats not deduped)', async () => {
    const k1 = await deriveIdempotencyKey(buildEnv(), baseInputs);
    const k2 = await deriveIdempotencyKey(buildEnv(), { ...baseInputs, toolCallSeq: 43 });
    expect(k1).not.toBe(k2);
  });

  it('produces different keys when salt rotates', async () => {
    const k1 = await deriveIdempotencyKey(buildEnv('salt-A'), baseInputs);
    const k2 = await deriveIdempotencyKey(buildEnv('salt-B'), baseInputs);
    expect(k1).not.toBe(k2);
  });

  it('throws when IDEMPOTENCY_SALT is unset (no salt-less keys)', async () => {
    await expect(deriveIdempotencyKey(buildEnv(null), baseInputs)).rejects.toThrow(
      /IDEMPOTENCY_SALT/,
    );
  });
});

describe('deriveHighRiskIdempotencyKey', () => {
  it('produces identical keys within a 60s wall-clock bucket', async () => {
    const env = buildEnv();
    // Pin to a bucket boundary so the three offsets all land in the
    // same bucket window.
    const bucketStart = Math.floor(1_700_000_000_000 / 60_000) * 60_000;
    const k1 = await deriveHighRiskIdempotencyKey(env, baseInputs, bucketStart);
    const k2 = await deriveHighRiskIdempotencyKey(env, baseInputs, bucketStart + 1_000);
    const k3 = await deriveHighRiskIdempotencyKey(env, baseInputs, bucketStart + 59_999);
    expect(k1).toBe(k2);
    expect(k1).toBe(k3);
  });

  it('produces a fresh key after the bucket rolls over', async () => {
    const env = buildEnv();
    const bucketStart = Math.floor(1_700_000_000_000 / 60_000) * 60_000;
    const k1 = await deriveHighRiskIdempotencyKey(env, baseInputs, bucketStart);
    const k2 = await deriveHighRiskIdempotencyKey(env, baseInputs, bucketStart + 60_000);
    expect(k1).not.toBe(k2);
  });

  it('differs from the standard derivation (bucket suffix included)', async () => {
    const env = buildEnv();
    const standard = await deriveIdempotencyKey(env, baseInputs);
    const highRisk = await deriveHighRiskIdempotencyKey(env, baseInputs, Date.now());
    expect(standard).not.toBe(highRisk);
  });

  it('throws when IDEMPOTENCY_SALT is unset', async () => {
    await expect(
      deriveHighRiskIdempotencyKey(buildEnv(null), baseInputs, Date.now()),
    ).rejects.toThrow(/IDEMPOTENCY_SALT/);
  });
});
