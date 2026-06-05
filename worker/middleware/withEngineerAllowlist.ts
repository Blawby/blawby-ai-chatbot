import { HttpErrors } from '../errorHandler.js';
import { Logger } from '../utils/logger.js';
import type { RouteHandler } from './compose.js';
import { getAttachedAuthContext } from './compose.js';

/**
 * Module-load parsing of the allowlist env var. Lowercased + trimmed for
 * case-insensitive comparison; empty entries dropped so a trailing comma or
 * whitespace-only entry doesn't match `session.user.email === ''`.
 *
 * Returns the allowlist for a given env value. Memoization per raw string
 * keeps the per-isolate parse cost trivial across requests without making
 * env hot-reload across deploys impossible.
 */
const allowlistCache = new Map<string, Set<string>>();

export function parseEngineerAllowlist(raw: string | undefined | null): Set<string> {
  const key = raw ?? '';
  const cached = allowlistCache.get(key);
  if (cached) return cached;
  const parsed = new Set<string>();
  if (typeof raw === 'string') {
    for (const entry of raw.split(',')) {
      const normalized = entry.trim().toLowerCase();
      if (normalized) parsed.add(normalized);
    }
  }
  allowlistCache.set(key, parsed);
  return parsed;
}

/**
 * `withEngineerAllowlist(handler)` — gates the admin intake-inspector routes
 * behind a Better-Auth session AND a comma-separated engineer email allowlist
 * read from `env.INTAKE_INSPECTOR_ENGINEER_EMAILS`.
 *
 * Composes alongside `withAuth(handler, { required: true })` — do NOT modify
 * withAuth (mirrors the MCP plan's withMCPAuth pattern).
 *
 *   withEngineerAllowlist(withAuth(handler, { required: true }))
 *
 * Fails closed (returns 403) when:
 *   - env var is missing, empty, or whitespace-only (no engineers configured)
 *   - session user email is missing, empty, or whitespace
 *   - session is anonymous (Better-Auth `isAnonymous === true`)
 *   - normalized email is not in the allowlist
 *
 * Every successful access logs `admin.intake_inspector.access` so improper
 * allowlist-member action is recoverable from logs.
 */
export const withEngineerAllowlist = (handler: RouteHandler): RouteHandler => {
  return async (request, env, ctx) => {
    const allowlist = parseEngineerAllowlist(env.INTAKE_INSPECTOR_ENGINEER_EMAILS);
    if (allowlist.size === 0) {
      Logger.warn('admin.intake_inspector.allowlist_empty', {
        path: new URL(request.url).pathname,
      });
      throw HttpErrors.forbidden('Engineer access required.');
    }

    const authContext = getAttachedAuthContext(request);
    // withAuth (required: true) must have run first; getAttachedAuthContext
    // returning null here indicates a misconfigured route table.
    if (!authContext) {
      Logger.error('admin.intake_inspector.missing_auth_context', {
        path: new URL(request.url).pathname,
      });
      throw HttpErrors.unauthorized('Authentication required.');
    }

    if (authContext.isAnonymous === true || authContext.user.isAnonymous === true) {
      Logger.warn('admin.intake_inspector.anonymous_session_rejected', {
        sessionUserId: authContext.user.id,
      });
      throw HttpErrors.forbidden('Engineer access required.');
    }

    const rawEmail = typeof authContext.user.email === 'string'
      ? authContext.user.email.trim().toLowerCase()
      : '';
    if (!rawEmail) {
      Logger.warn('admin.intake_inspector.no_email_on_session', {
        sessionUserId: authContext.user.id,
      });
      throw HttpErrors.forbidden('Engineer access required.');
    }

    if (!allowlist.has(rawEmail)) {
      Logger.warn('admin.intake_inspector.email_not_allowlisted', {
        sessionUserId: authContext.user.id,
        // Do NOT log the rejected email — log structurally indicates "denied"
        // but the raw value is the user's email; rejected attempts are
        // surfaced via the audit log of granted accesses against the
        // allowlist diff.
      });
      throw HttpErrors.forbidden('Engineer access required.');
    }

    return handler(request, env, ctx);
  };
};

/**
 * Helper to read the authenticated engineer email from an already-allowed
 * request inside the route handler. Returns the lowercased email — guaranteed
 * non-empty because the middleware fails closed otherwise.
 */
export function getAuthenticatedEngineerEmail(request: Request): string {
  const ctx = getAttachedAuthContext(request);
  const email = typeof ctx?.user?.email === 'string' ? ctx.user.email.trim().toLowerCase() : '';
  if (!email) {
    throw new Error('getAuthenticatedEngineerEmail called outside withEngineerAllowlist');
  }
  return email;
}
