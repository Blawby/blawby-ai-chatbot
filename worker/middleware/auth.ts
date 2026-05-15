import { Env, HttpError } from "../types";
import { HttpErrors } from "../errorHandler";
import { Logger } from "../utils/logger";
import { extractWidgetTokenFromRequest, validateWidgetAuthToken } from "../utils/widgetAuthToken.js";

const AUTH_TIMEOUT_MS = 3000;

export interface AuthenticatedUser {
  id: string;
  email?: string;
  name: string;
  emailVerified: boolean;
  image?: string;
  isAnonymous?: boolean;
}

export interface AuthContext {
  user: AuthenticatedUser;
  session: {
    id: string;
    expiresAt: Date;
  };
  cookie: string;
  isAnonymous?: boolean; // Flag for anonymous users (Better Auth anonymous plugin)
  activeOrganizationId?: string | null;
  activeMembershipRole?: string | null;
  previousAnonUserId?: string | null;
}

type CachedSession = {
  value: {
    user: AuthenticatedUser;
    session: { id: string; expiresAt: Date };
    activeOrganizationId?: string | null;
    activeMembershipRole?: string | null;
    previousAnonUserId?: string | null;
  };
  expiresAt: number;
  staleExpiresAt: number;
};

const SESSION_CACHE_TTL_MS = 30 * 1000;
const SESSION_STALE_TTL_MS = 5 * 60 * 1000;
const SESSION_CACHE_MAX_ENTRIES = 200;
const sessionCache = new Map<string, CachedSession>();
const sessionValidationInflight = new Map<string, Promise<{ user: AuthenticatedUser; session: { id: string; expiresAt: Date } }>>();
const SESSION_COOKIE_NAMES = ['__Secure-better-auth.session_token', 'better-auth.session_token'];

const getSessionCacheKey = (cookieHeader: string): string => {
  const cookies = cookieHeader.split(';');
  for (const cookie of cookies) {
    const trimmed = cookie.trim();
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const rawName = trimmed.slice(0, eqIndex);
    const rawValue = trimmed.slice(eqIndex + 1);
    if (!rawName || !rawValue) continue;
    if (SESSION_COOKIE_NAMES.includes(rawName)) {
      return `${rawName}=${rawValue}`;
    }
  }
  return cookieHeader;
};

const pruneSessionCache = (): void => {
  if (sessionCache.size <= SESSION_CACHE_MAX_ENTRIES) return;
  const now = Date.now();
  for (const [key, entry] of sessionCache) {
    if (entry.expiresAt <= now) sessionCache.delete(key);
    if (sessionCache.size <= SESSION_CACHE_MAX_ENTRIES) return;
  }
  while (sessionCache.size > SESSION_CACHE_MAX_ENTRIES) {
    const firstKey = sessionCache.keys().next().value as string | undefined;
    if (!firstKey) break;
    sessionCache.delete(firstKey);
  }
};

function resolveBackendApiUrl(env: Env, context = 'backend API'): string {
  if (!env.BACKEND_API_URL) {
    throw HttpErrors.internalServerError(`BACKEND_API_URL must be configured (${context})`);
  }
  return env.BACKEND_API_URL;
}

export function parseAuthSessionPayload(
  rawResponse: unknown
): {
  user: AuthenticatedUser;
  session: { id: string; expiresAt: Date };
  activeOrganizationId?: string | null;
  activeMembershipRole?: string | null;
  previousAnonUserId?: string | null;
} {
  if (!rawResponse || typeof rawResponse !== 'object') {
    throw HttpErrors.unauthorized('Invalid session data - empty response');
  }

  const responseRecord = rawResponse as Record<string, unknown>;

  if (responseRecord.error) {
    const errorObj = responseRecord.error as { message?: string };
    throw HttpErrors.unauthorized(errorObj.message || 'Invalid or expired session');
  }

  // Better Auth returns { data: { user, session } } or { user, session } at top level
  let user: Record<string, unknown> | undefined;
  let session: Record<string, unknown> | undefined;
  let dataPayload: Record<string, unknown> | null = null;

  if (responseRecord.data && typeof responseRecord.data === 'object') {
    dataPayload = responseRecord.data as Record<string, unknown>;
    user = dataPayload.user as Record<string, unknown> | undefined;
    session = dataPayload.session as Record<string, unknown> | undefined;
  } else if (responseRecord.user && typeof responseRecord.user === 'object') {
    user = responseRecord.user as Record<string, unknown>;
    session = responseRecord.session as Record<string, unknown> | undefined;
  }

  if (!user?.id || typeof user.id !== 'string') {
    throw HttpErrors.unauthorized('Invalid session data - no user found');
  }
  if (!user.name || typeof user.name !== 'string') {
    throw HttpErrors.unauthorized('Invalid session data - missing user name');
  }
  const activeOrganizationId =
    typeof session.activeOrganizationId === 'string' ? session.activeOrganizationId :
    typeof session.active_organization_id === 'string' ? session.active_organization_id :
    null;

  const routingRecord = (
    dataPayload?.routing && typeof dataPayload.routing === 'object' ? dataPayload.routing :
    responseRecord.routing && typeof responseRecord.routing === 'object' ? responseRecord.routing :
    null
  ) as Record<string, unknown> | null;

  const activeMembershipRole =
    typeof routingRecord?.active_membership_role === 'string' ? routingRecord.active_membership_role :
    typeof session.activeMembershipRole === 'string' ? session.activeMembershipRole :
    typeof session.active_membership_role === 'string' ? session.active_membership_role :
    null;

  const previousAnonUserId =
    typeof session.previousAnonUserId === 'string' ? session.previousAnonUserId :
    typeof session.previous_anon_user_id === 'string' ? session.previous_anon_user_id :
    null;

  return {
    user: {
      id: user.id,
      email: typeof user.email === 'string' ? user.email : undefined,
      name: user.name,
      emailVerified: user.emailVerified === true || user.email_verified === true,
      image: typeof user.image === 'string' ? user.image : undefined,
      isAnonymous: user.isAnonymous === true || user.is_anonymous === true,
    },
    session: {
      id: typeof session.id === 'string' ? session.id : (user.id as string),
      expiresAt: session.expiresAt
        ? new Date(session.expiresAt as string)
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
    activeOrganizationId: typeof activeOrganizationId === 'string' && activeOrganizationId.trim()
      ? activeOrganizationId.trim()
      : null,
    activeMembershipRole: typeof activeMembershipRole === 'string' && activeMembershipRole.trim()
      ? activeMembershipRole.trim().toLowerCase()
      : null,
    previousAnonUserId: typeof previousAnonUserId === 'string' && previousAnonUserId.trim()
      ? previousAnonUserId.trim()
      : null,
  };
}

export async function validateSessionWithRemoteServer(
  cookie: string,
  env: Env,
  options?: {
    allowStaleOnTimeout?: boolean;
  }
): Promise<{
  user: AuthenticatedUser;
  session: { id: string; expiresAt: Date };
  activeOrganizationId?: string | null;
  activeMembershipRole?: string | null;
  previousAnonUserId?: string | null;
}> {
  const cacheKey = getSessionCacheKey(cookie);
  const cached = sessionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }
  if (cached) {
    sessionCache.delete(cacheKey);
  }

  const inflight = sessionValidationInflight.get(cacheKey);
  if (inflight) {
    return inflight;
  }

  const authServerUrl = resolveBackendApiUrl(env, 'Better Auth session validation');
  const validationPromise = (async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(`${authServerUrl}/api/auth/get-session`, {
          method: 'GET',
          headers: { Cookie: cookie, 'Content-Type': 'application/json' },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        throw HttpErrors.unauthorized(`Authentication failed: ${response.status} ${response.statusText}`);
      }

      const parsed = parseAuthSessionPayload(await response.json());

      const now = Date.now();
      const ttlFromSession = parsed.session.expiresAt.getTime() - now;
      const ttl = Math.min(SESSION_CACHE_TTL_MS, ttlFromSession);
      const staleTtl = Math.min(SESSION_STALE_TTL_MS, ttlFromSession);
      if (ttl > 0 || staleTtl > 0) {
        sessionCache.set(cacheKey, {
          value: parsed,
          expiresAt: now + Math.max(0, ttl),
          staleExpiresAt: now + Math.max(0, staleTtl),
        });
        pruneSessionCache();
      }

      return parsed;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        if (options?.allowStaleOnTimeout) {
          const staleCached = sessionCache.get(cacheKey);
          if (staleCached && staleCached.staleExpiresAt > Date.now()) {
            Logger.warn('Using stale cached auth session after auth timeout', {
              cacheKeyPrefix: cacheKey.slice(0, 24),
            });
            return staleCached.value;
          }
        }
        throw HttpErrors.gatewayTimeout('Authentication server timeout - please try again');
      }
      throw error;
    } finally {
      sessionValidationInflight.delete(cacheKey);
    }
  })();

  sessionValidationInflight.set(cacheKey, validationPromise);
  return validationPromise;
}

const isHotChatPath = (request: Request): boolean => {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();

  if (path === '/api/ai/chat' && method === 'POST') return true;
  if (path === '/api/ai/intent' && method === 'POST') return true;

  if (!path.startsWith('/api/conversations/')) return false;
  if (method === 'GET') return true;

  // Reaction toggles are chat UX hot-path writes; permit stale auth on timeout.
  if ((method === 'POST' || method === 'DELETE') && path.includes('/messages/') && path.endsWith('/reactions')) {
    return true;
  }

  return false;
};

export async function requireAuth(
  request: Request,
  env: Env
): Promise<AuthContext> {
  const extractedWidgetToken = extractWidgetTokenFromRequest(request);
  const widgetToken = extractedWidgetToken?.token ?? null;
  const widgetTokenSource = extractedWidgetToken?.tokenSource ?? null;
  const requestPath = new URL(request.url).pathname;
  const isWebSocketPath = /\/ws(?:\/|$)/.test(requestPath);

  const cookieHeader = request.headers.get('Cookie');
  const normalizedCookie = cookieHeader?.trim() ?? '';

  let authResult: {
    user: AuthenticatedUser;
    session: { id: string; expiresAt: Date };
    activeOrganizationId?: string | null;
    activeMembershipRole?: string | null;
    previousAnonUserId?: string | null;
  };

  const buildWidgetTokenContext = async (): Promise<AuthContext> => {
    if (!widgetToken) {
      throw HttpErrors.unauthorized('Authentication required - session cookie missing');
    }
    // Query tokens are only accepted for WS handshakes where custom headers
    // are unavailable in browser WebSocket APIs.
    if (widgetTokenSource === 'query' && !isWebSocketPath) {
      throw HttpErrors.unauthorized('Widget query token is only allowed for WebSocket authentication');
    }
    const validated = await validateWidgetAuthToken(widgetToken, env);
    return {
      user: {
        id: validated.userId,
        name: 'Anonymous User',
        emailVerified: false,
        isAnonymous: true,
      },
      session: {
        id: validated.sessionId,
        expiresAt: new Date(validated.expiresAt * 1000),
      },
      cookie: '',
      isAnonymous: true,
      activeOrganizationId: null,
      activeMembershipRole: null,
      previousAnonUserId: null
    };
  };

  if (!normalizedCookie) {
    return buildWidgetTokenContext();
  }

  try {
    authResult = await validateSessionWithRemoteServer(normalizedCookie, env, {
      allowStaleOnTimeout: isHotChatPath(request)
    });
  } catch (error) {
    // If the error is a 401, we fallback to widget token context.
    // This allows the widget to work even if the browser carries stale or unrelated cookies
    // (e.g. theme preferences) that aren't session tokens.
    if (error instanceof HttpError && error.status === 401) {
      return buildWidgetTokenContext();
    }
    // For other errors (like 504 timeouts), we fail-fast as requested to avoid masking
    // backend performance issues.
    throw error;
  }

  const isAnonymous = authResult.user.isAnonymous === true;

  return {
    ...authResult,
    cookie: normalizedCookie,
    isAnonymous,
    activeMembershipRole: authResult.activeMembershipRole ?? null,
    previousAnonUserId: authResult.previousAnonUserId ?? null,
  };
}

export async function requirePracticeMember(
  request: Request,
  env: Env,
  practiceId: string,
  minimumRole?: "owner" | "admin" | "attorney" | "paralegal"
): Promise<AuthContext & { memberRole: string }> {
  const authContext = await requireAuth(request, env);
  return requirePracticeMemberWithAuthContext(authContext, env, practiceId, minimumRole);
}

// Trust the session claim. Better Auth's standard pattern is that the client
// calls `authClient.organization.setActive(orgId)` before any per-org request,
// which writes activeOrganizationId + activeMembershipRole onto the session.
// We refuse requests whose URL practiceId doesn't match the active org rather
// than secretly fetching the role from the backend on every protected write —
// callers must setActive first.
async function requirePracticeMemberWithAuthContext(
  authContext: AuthContext,
  _env: Env,
  practiceId: string,
  minimumRole?: "owner" | "admin" | "attorney" | "paralegal"
): Promise<AuthContext & { memberRole: string }> {
  const roleHierarchy: Record<string, number> = {
    'paralegal': 1,
    'attorney': 2,
    'admin': 3,
    'owner': 4
  };

  if (!practiceId || typeof practiceId !== 'string' || practiceId.trim() === '') {
    throw HttpErrors.badRequest("Invalid or missing practiceId");
  }

  const normalizedPracticeId = practiceId.trim();
  const activeOrganizationId = authContext.activeOrganizationId?.trim() ?? null;
  const claimedRole = authContext.activeMembershipRole?.trim().toLowerCase() ?? null;

  if (!activeOrganizationId || activeOrganizationId !== normalizedPracticeId) {
    throw HttpErrors.forbidden(
      'Active organization does not match request practice. Call authClient.organization.setActive() before requesting per-practice resources.',
    );
  }

  if (!claimedRole) {
    throw HttpErrors.forbidden('Session is missing an active membership role; sign in again.');
  }

  if (minimumRole) {
    const userRoleLevel = roleHierarchy[claimedRole];
    const requiredRoleLevel = roleHierarchy[minimumRole];
    if (userRoleLevel === undefined) {
      throw HttpErrors.forbidden(`Invalid user role: ${claimedRole}`);
    }
    if (requiredRoleLevel === undefined) {
      throw HttpErrors.internalServerError(`Invalid configured minimum role: ${minimumRole}`);
    }
    if (userRoleLevel < requiredRoleLevel) {
      throw HttpErrors.forbidden(`Insufficient permissions. Required: ${minimumRole}, has: ${claimedRole}`);
    }
  }

  return { ...authContext, memberRole: claimedRole };
}

export async function optionalAuth(
  request: Request,
  env: Env
): Promise<AuthContext | null> {
  try {
    return await requireAuth(request, env);
  } catch (error) {
    // Optional auth should only suppress expected unauthenticated cases.
    // Surface timeouts/backend failures so callers don't misreport them as "not logged in".
    if (error instanceof HttpError && error.status !== 401) {
      throw error;
    }
    return null;
  }
}

/**
 * Practice-based RBAC middleware
 * Verifies user is a member of the practice with the required role
 */
export async function requirePracticeMemberRole(
  request: Request,
  env: Env,
  practiceId: string,
  minimumRole?: "owner" | "admin" | "attorney" | "paralegal",
  options?: { authContext?: AuthContext }
): Promise<AuthContext & { memberRole: string }> {
  if (options?.authContext) {
    return requirePracticeMemberWithAuthContext(options.authContext, env, practiceId, minimumRole);
  }
  return requirePracticeMember(request, env, practiceId, minimumRole);
}

/**
 * Shorthand for owner-only access
 */
export async function requirePracticeOwner(
  request: Request,
  env: Env,
  practiceId: string
): Promise<AuthContext & { memberRole: string }> {
  return requirePracticeMemberRole(request, env, practiceId, "owner");
}

/**
 * Check if user has access to a practice
 * Returns the access type and role without throwing errors
 */
export async function checkPracticeAccess(
  request: Request,
  env: Env,
  practiceId: string,
  options?: { authContext?: AuthContext }
): Promise<{ hasAccess: boolean; memberRole?: string }> {
  try {
    const result = options?.authContext
      ? await requirePracticeMemberWithAuthContext(options.authContext, env, practiceId)
      : await requirePracticeMemberRole(request, env, practiceId);
    return {
      hasAccess: true,
      memberRole: result.memberRole,
    };
  } catch {
    return { hasAccess: false };
  }
}

/**
 * Check if user is a practice member (non-throwing)
 * Returns membership info without throwing errors
 * Alias for checkPracticeAccess for consistency with practice terminology
 */
export async function checkPracticeMembership(
  request: Request,
  env: Env,
  practiceId: string,
  options?: { authContext?: AuthContext }
): Promise<{ isMember: boolean; memberRole?: string }> {
  try {
    const result = options?.authContext
      ? await requirePracticeMemberWithAuthContext(options.authContext, env, practiceId)
      : await requirePracticeMemberRole(request, env, practiceId);
    return {
      isMember: true,
      memberRole: result.memberRole,
    };
  } catch {
    return { isMember: false };
  }
}
