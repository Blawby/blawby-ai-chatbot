import type { Env } from '../types.js';

/**
 * MCPIdempotency — derive deterministic `Idempotency-Key` headers for
 * MCP-invoked mutating endpoints (plan R14).
 *
 * Key shape per plan U12:
 *   sha256(IDEMPOTENCY_SALT || practice_id || tool_name ||
 *          canonical_json(params) || mcp_session_id || tool_call_seq)
 *
 * Why each input matters:
 *   - IDEMPOTENCY_SALT: rotation point; salt change invalidates all
 *     in-flight idempotency caches at backend
 *   - practice_id + tool_name: backend scopes the dedup window per
 *     (practice, tool, key) — plan U2 key shape
 *   - canonical_json(params): JSON-ordered serialization; two callers
 *     with the same logical args produce the same key regardless of
 *     property order
 *   - mcp_session_id: session-scoped — two parallel sessions issuing
 *     the same logical tool call get distinct keys (no cross-session
 *     dedup)
 *   - tool_call_seq: MCP `tools/call` request id; same Claude tool
 *     call retried after a transport error dedupes, unrelated repeats
 *     with identical params do not
 *
 * High-risk tools (U11 send_invoice/record_payment/refund_payment)
 * additionally bucket by 60s wall-clock so a rejection + immediate
 * retry within the same minute dedupes (returns the cached
 * pending_action_id) but a retry after the bucket rolls produces a
 * fresh pending action. That helper is `deriveHighRiskKey` below.
 */

export interface IdempotencyInputs {
  toolName: string;
  practiceId: string;
  mcpSessionId: string;
  toolCallSeq: string | number;
  params: Record<string, unknown>;
}

const HIGH_RISK_BUCKET_MS = 60_000;

/**
 * Canonical JSON: keys sorted at every depth so {a:1, b:2} and
 * {b:2, a:1} produce identical strings.
 */
export const canonicalJsonStringify = (value: unknown): string => {
  if (value === null) return 'null';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'undefined') return 'null';
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalJsonStringify(v)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const parts = keys.map((k) => `${JSON.stringify(k)}:${canonicalJsonStringify(record[k])}`);
    return `{${parts.join(',')}}`;
  }
  return 'null';
};

const sha256Hex = async (input: string): Promise<string> => {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

const composeKeyMaterial = (
  salt: string,
  inputs: IdempotencyInputs,
  extra = '',
): string => {
  const parts = [
    salt,
    inputs.practiceId,
    inputs.toolName,
    canonicalJsonStringify(inputs.params),
    inputs.mcpSessionId,
    String(inputs.toolCallSeq),
    extra,
  ];
  // \x1f (ASCII unit separator) is unlikely to appear inside any of the
  // string fields and gives an unambiguous boundary.
  return parts.join('\x1f');
};

/**
 * Standard derivation for direct-write tools (U10).
 * `IDEMPOTENCY_SALT` is required — U12 marks it as a required env var
 * and adds the activation check. Throws when unset so the call fails
 * loudly rather than silently producing a salt-less key.
 */
export const deriveIdempotencyKey = async (
  env: Env,
  inputs: IdempotencyInputs,
): Promise<string> => {
  if (!env.IDEMPOTENCY_SALT) {
    throw new Error('IDEMPOTENCY_SALT not configured; refusing to derive a salt-less key');
  }
  const material = composeKeyMaterial(env.IDEMPOTENCY_SALT, inputs);
  return sha256Hex(material);
};

/**
 * High-risk derivation (U11 send_invoice / record_payment /
 * refund_payment). Bucketed to a 60s window so an immediate retry
 * after a transport hiccup dedupes (cached create-pending response
 * returns the same pending_action_id), but a fresh tool call after
 * the bucket rolls produces a new pending_action_id. Trade-off: the
 * only non-deterministic aspect of key derivation.
 */
export const deriveHighRiskIdempotencyKey = async (
  env: Env,
  inputs: IdempotencyInputs,
  nowMs: number = Date.now(),
): Promise<string> => {
  if (!env.IDEMPOTENCY_SALT) {
    throw new Error('IDEMPOTENCY_SALT not configured; refusing to derive a salt-less key');
  }
  const bucket = Math.floor(nowMs / HIGH_RISK_BUCKET_MS) * HIGH_RISK_BUCKET_MS;
  const material = composeKeyMaterial(env.IDEMPOTENCY_SALT, inputs, String(bucket));
  return sha256Hex(material);
};
