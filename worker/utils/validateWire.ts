/**
 * Wire-format runtime validation helper.
 *
 * Pairs each wire type in `worker/types/wire/*.ts` with a Zod schema.
 * Use `validateWire(schema, payload, label)` to parse upstream/inbound
 * data:
 *
 *   const matter = validateWire(BackendMatterSchema, json, 'getMatter');
 *
 * Behavior:
 *   - DEV (env.DEBUG === 'true'): hard-failure via schema.parse(). Bad
 *     wire data throws and is surfaced in tests/fixtures immediately.
 *   - PROD: schema.safeParse() — on failure, log the issue with redacted
 *     context, then return the unvalidated value cast to T. We don't
 *     want a backend schema drift to break production; we want a
 *     warning so the gap is visible in observability.
 *
 * Why not always strict? The worker is a BFF, not the source of truth
 * for the schema. The backend can evolve independently; we shouldn't
 * fail open in dev or hard-fail in prod. The split lets us catch
 * regressions during development while staying available in prod.
 */

import { z } from 'zod';
import { Logger } from './logger.js';
import { redactSensitiveFields } from './redactResponse.js';

export interface ValidateWireOptions {
  /** Treat schema failures as hard errors. Default: true in tests/dev,
   *  false in production. Override per-call when callers know better. */
  strict?: boolean;
}

const isDevEnvironment = (): boolean => {
  // The validator runs both inside the worker (no process.env) and inside
  // unit tests (Node, has process.env). Treat both as non-prod by default.
  // Worker runtime callers can pass `{ strict: env.DEBUG === 'true' }`
  // explicitly when they need tighter control.
  if (typeof process !== 'undefined' && process.env?.NODE_ENV) {
    return process.env.NODE_ENV !== 'production';
  }
  return true;
};

export function validateWire<T extends z.ZodTypeAny>(
  schema: T,
  payload: unknown,
  label: string,
  options: ValidateWireOptions = {},
): z.infer<T> {
  const strict = options.strict ?? isDevEnvironment();

  if (strict) {
    return schema.parse(payload) as z.infer<T>;
  }

  const result = schema.safeParse(payload);
  if (result.success) return result.data as z.infer<T>;

  Logger.warn('[validateWire] schema mismatch', {
    label,
    issues: result.error.issues.slice(0, 5),
    payloadShape: shapeOf(payload),
  });
  return payload as z.infer<T>;
}

/** Brief structural fingerprint of an unknown payload for the warning log. */
const shapeOf = (value: unknown): unknown => {
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    return value.length === 0 ? '[]' : [`array(${value.length})`, shapeOf(value[0])];
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value as object).slice(0, 12);
    return { type: 'object', keys, sample: redactSensitiveFields(value) };
  }
  return typeof value;
};
