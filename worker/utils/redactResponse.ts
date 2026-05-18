/**
 * Sanitize an upstream error-response body for logging.
 *
 * Extracts only allowlisted fields (`code`, `type`, `message`, `error`,
 * `status`, `success`) and explicitly drops blacklisted keys
 * (`token`, `access_token`, `refresh_token`, `user_id`, `email`, `password`)
 * even if they happened to land under an allowlisted name.
 *
 * Recurses one level into a nested `error` object — upstream APIs
 * sometimes wrap the human-readable details under `error.message` etc.
 *
 * Used by the auth proxy and backend proxy so error logs are uniform
 * and never leak PII or credentials. Replaces three near-identical
 * inline copies of this logic.
 */
const ALLOWLIST = ['code', 'type', 'message', 'error', 'status', 'success'] as const;
const BLACKLIST = ['token', 'access_token', 'refresh_token', 'user_id', 'email', 'password'] as const;

export const redactErrorResponseBody = (payload: unknown): Record<string, unknown> => {
  const safe: Record<string, unknown> = {};

  const extract = (source: unknown) => {
    if (!source || typeof source !== 'object') return;
    const record = source as Record<string, unknown>;
    for (const key of ALLOWLIST) {
      const value = record[key];
      if (value === undefined) continue;
      if (key === 'error' && typeof value === 'object' && value !== null) {
        extract(value);
      } else {
        safe[key] = value;
      }
    }
  };

  extract(payload);
  for (const key of BLACKLIST) delete safe[key];
  return safe;
};

/**
 * Recursive PII/credential redaction for general-purpose logging.
 *
 * Replaces field VALUES (not field names) under any blacklisted key with
 * `[redacted]`. Used by RemoteApiService when logging outgoing/incoming
 * payloads for debugging — preserves structure so we can read the shape
 * without exposing secrets.
 *
 * Keys are matched case-insensitively. The set is broader than
 * redactErrorResponseBody's because debug logging surfaces more
 * sensitive fields than error responses do.
 */
const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'access_token',
  'authorization',
  'email',
  'ssn',
  'secret',
  'refresh_token',
  'api_key',
  'client_secret',
  'user_id',
]);

export const redactSensitiveFields = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(redactSensitiveFields);
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, fieldValue] of Object.entries(record)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      out[key] = '[redacted]';
    } else {
      out[key] = redactSensitiveFields(fieldValue);
    }
  }
  return out;
};
