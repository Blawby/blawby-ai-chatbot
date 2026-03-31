import { Env, HttpError } from "../types";
import { HttpErrors } from "../errorHandler";
import { Logger } from "../utils/logger";
import { extractWidgetTokenFromRequest, validateWidgetAuthToken } from "../utils/widgetAuthToken.js";
import { RemoteApiService } from "../services/RemoteApiService.js";

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

type CachedMembership = {
  role: string;
  expiresAt: number;
};

const SESSION_CACHE_TTL_MS = 30 * 1000;
const SESSION_STALE_TTL_MS = 5 * 60 * 1000;
const SESSION_CACHE_MAX_ENTRIES = 200;
const sessionCache = new Map<string, CachedSession>();
const sessionValidationInflight = new Map<string, Promise<{ user: AuthenticatedUser; session: { id: string; expiresAt: Date } }>>();
const SESSION_COOKIE_NAMES = ['__Secure-better-auth.session_token', 'better-auth.session_token'];
const MEMBERSHIP_CACHE_TTL_MS = 30 * 1000;
const MEMBERSHIP_CACHE_MAX_ENTRIES = 500;
const membershipCache = new Map<string, CachedMembership>();
const membershipValidationInflight = new Map<string, Promise<string>>();

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

const getMembershipCacheKey = (practiceId: string, userId: string): string =>
  `${practiceId}:${userId}`;

const pruneMembershipCache = (): void => {
  if (membershipCache.size <= MEMBERSHIP_CACHE_MAX_ENTRIES) return;
  const now = Date.now();
  for (const [key, entry] of membershipCache) {
    if (entry.expiresAt <= now) {
      membershipCache.delete(key);
    }
    if (membershipCache.size <= MEMBERSHIP_CACHE_MAX_ENTRIES) {
      return;
    }
  }
  while (membershipCache.size > MEMBERSHIP_CACHE_MAX_ENTRIES) {
    const firstKey = membershipCache.keys().next().value as string | undefined;
    if (!firstKey) break;
    membershipCache.delete(firstKey);
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
    console.error('[Auth] Invalid session payload from Better Auth API:', rawResponse);
    throw HttpErrors.unauthorized('Invalid session data - empty response');
  }

  const responseRecord = rawResponse as Record<string, unknown>;

  if (responseRecord.error) {
    const errorObj = responseRecord.error as { message?: string };
    console.error('[Auth] Better Auth API returned error:', errorObj.message || 'Unknown error');
    throw HttpErrors.unauthorized(errorObj.message || 'Invalid or expired session');
  }

  const dataPayload =
    responseRecord.data && typeof responseRecord.data === 'object'
      ? responseRecord.data as Record<string, unknown>
      : null;

  const hasUserPayload =
    !!responseRecord.user ||
    (!!dataPayload && ('user' in dataPayload || 'session' in dataPayload));

  if (responseRecord.message && typeof responseRecord.message === 'string' && !hasUserPayload) {
    throw HttpErrors.unauthorized(responseRecord.message);
  }

  let user: {
    id: string;
    email?: string | null;
    name: string;
    emailVerified?: boolean;
    image?: string | null;
    isAnonymous?: boolean;
    is_anonymous?: boolean;
  } | undefined;
  let session: { id: string; expiresAt: Date | string } | undefined;

  if (responseRecord.data && typeof responseRecord.data === 'object') {
    const data = responseRecord.data as { user?: typeof user; session?: typeof session };
    user = data.user;
    session = data.session;
  } else if (responseRecord.user && typeof responseRecord.user === 'object') {
    user = responseRecord.user as typeof user;
    session = responseRecord.session as typeof session;
  }

  if (!user?.id) {
    console.error('[Auth] No user in session data from Better Auth API');
    throw HttpErrors.unauthorized('Invalid session data - no user found');
  }

  if (user.email !== undefined && user.email !== null && typeof user.email !== 'string') {
    console.error('[Auth] Invalid email type in session data from Better Auth API');
    throw HttpErrors.unauthorized('Invalid session data - invalid user email');
  }

  if (!user.name || typeof user.name !== 'string') {
    console.error('[Auth] Invalid or missing name in session data from Better Auth API');
    throw HttpErrors.unauthorized('Invalid session data - missing user name');
  }

  const sessionData = { user, session };
  const sessionRecord = session && typeof session === 'object'
    ? session as Record<string, unknown>
    : null;
  const routingRecord = dataPayload?.routing && typeof dataPayload.routing === 'object'
    ? dataPayload.routing as Record<string, unknown>
    : (responseRecord.routing && typeof responseRecord.routing === 'object'
      ? responseRecord.routing as Record<string, unknown>
      : null);
  const sessionRoutingRecord = sessionRecord?.routing && typeof sessionRecord.routing === 'object'
    ? sessionRecord.routing as Record<string, unknown>
    : null;
  const activeOrganizationId =
    typeof sessionRecord?.activeOrganizationId === 'string'
      ? sessionRecord.activeOrganizationId
      : typeof sessionRecord?.active_organization_id === 'string'
        ? sessionRecord.active_organization_id
        : typeof dataPayload?.activeOrganizationId === 'string'
          ? dataPayload.activeOrganizationId
          : typeof dataPayload?.active_organization_id === 'string'
            ? dataPayload.active_organization_id
            : typeof responseRecord.activeOrganizationId === 'string'
              ? responseRecord.activeOrganizationId
              : typeof responseRecord.active_organization_id === 'string'
                ? responseRecord.active_organization_id
        : null;
  const activeMembershipRole =
    typeof routingRecord?.active_membership_role === 'string'
      ? routingRecord.active_membership_role
      : typeof sessionRoutingRecord?.active_membership_role === 'string'
        ? sessionRoutingRecord.active_membership_role
        : typeof dataPayload?.active_membership_role === 'string'
          ? dataPayload.active_membership_role
          : typeof responseRecord.active_membership_role === 'string'
            ? responseRecord.active_membership_role
            : typeof user.role === 'string'
              ? user.role
              : typeof sessionRecord?.activeMembershipRole === 'string'
                ? sessionRecord.activeMembershipRole
                : typeof sessionRecord?.active_membership_role === 'string'
                  ? sessionRecord.active_membership_role
                  : null;
  const previousAnonUserId =
    typeof sessionRecord?.previous_anon_user_id === 'string'
      ? sessionRecord.previous_anon_user_id
      : typeof sessionRecord?.previousAnonUserId === 'string'
        ? sessionRecord.previousAnonUserId
        : typeof (responseRecord as Record<string, unknown>).previous_anon_user_id === 'string'
          ? (responseRecord as Record<string, unknown>).previous_anon_user_id as string
          : null;

  if (
    typeof activeOrganizationId === 'string'
    && activeOrganizationId.trim().length > 0
    && !(typeof activeMembershipRole === 'string' && activeMembershipRole.trim().length > 0)
  ) {
    Logger.warn('[Auth] Session payload missing active membership role', {
      topLevelKeys: Object.keys(responseRecord),
      dataKeys: dataPayload ? Object.keys(dataPayload) : [],
      userKeys: user ? Object.keys(user as Record<string, unknown>) : [],
      sessionKeys: sessionRecord ? Object.keys(sessionRecord) : [],
      routingKeys: routingRecord ? Object.keys(routingRecord) : [],
      sessionRoutingKeys: sessionRoutingRecord ? Object.keys(sessionRoutingRecord) : [],
      candidateRoleValues: {
        routingActiveMembershipRole:
          typeof routingRecord?.active_membership_role === 'string' ? routingRecord.active_membership_role : null,
        sessionRoutingActiveMembershipRole:
          typeof sessionRoutingRecord?.active_membership_role === 'string' ? sessionRoutingRecord.active_membership_role : null,
        dataActiveMembershipRole:
          typeof dataPayload?.active_membership_role === 'string' ? dataPayload.active_membership_role : null,
        responseActiveMembershipRole:
          typeof responseRecord.active_membership_role === 'string' ? responseRecord.active_membership_role : null,
        userRole:
          typeof user.role === 'string' ? user.role : null,
        sessionActiveMembershipRole:
          typeof sessionRecord?.activeMembershipRole === 'string' ? sessionRecord.activeMembershipRole : null,
        sessionSnakeActiveMembershipRole:
          typeof sessionRecord?.active_membership_role === 'string' ? sessionRecord.active_membership_role : null,
      },
    });
  }

  return {
    user: {
      id: sessionData.user.id,
      email: sessionData.user.email ?? undefined,
      name: sessionData.user.name,
      emailVerified: sessionData.user.emailVerified ?? false,
      image: sessionData.user.image ?? undefined,
      isAnonymous:
        typeof sessionData.user.isAnonymous === 'boolean'
          ? sessionData.user.isAnonymous
          : typeof sessionData.user.is_anonymous === 'boolean'
            ? sessionData.user.is_anonymous
            : undefined,
    },
    session: {
      id: sessionData.session?.id || sessionData.user.id,
      expiresAt: sessionData.session?.expiresAt
        ? new Date(sessionData.session.expiresAt)
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
    activeOrganizationId: typeof activeOrganizationId === 'string' && activeOrganizationId.trim().length > 0
      ? activeOrganizationId.trim()
      : null,
    activeMembershipRole: typeof activeMembershipRole === 'string' && activeMembershipRole.trim().length > 0
      ? activeMembershipRole.trim().toLowerCase()
      : null,
    previousAnonUserId: typeof previousAnonUserId === 'string' && previousAnonUserId.trim().length > 0
      ? previousAnonUserId.trim()
      : null
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
  const AUTH_TIMEOUT_MS = 3000;
  const validationPromise = (async () => {
    try {
      const getSessionUrl = `${authServerUrl}/api/auth/get-session`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);

      try {
        const response = await fetch(getSessionUrl, {
          method: 'GET',
          headers: {
            'Cookie': cookie,
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          console.error('[Auth] Better Auth session validation failed:', response.status, errorText.substring(0, 200));
          throw HttpErrors.unauthorized(`Authentication failed: ${response.status} ${response.statusText}`);
        }

        const rawResponse = await response.json() as Record<string, unknown>;
        const parsed = parseAuthSessionPayload(rawResponse);

        const ttlFromSession = parsed.session.expiresAt.getTime() - Date.now();
        const ttl = Math.min(SESSION_CACHE_TTL_MS, ttlFromSession);
        const staleTtl = Math.min(SESSION_STALE_TTL_MS, ttlFromSession);
        if (ttl > 0 || staleTtl > 0) {
          const now = Date.now();
          sessionCache.set(cacheKey, {
            value: parsed,
            expiresAt: now + Math.max(0, ttl),
            staleExpiresAt: now + Math.max(0, staleTtl)
          });
          if (sessionCache.size > SESSION_CACHE_MAX_ENTRIES) {
            for (const [key, entry] of sessionCache) {
              if (entry.expiresAt <= Date.now()) {
                sessionCache.delete(key);
              }
              if (sessionCache.size <= SESSION_CACHE_MAX_ENTRIES) {
                break;
              }
            }
            while (sessionCache.size > SESSION_CACHE_MAX_ENTRIES) {
              const firstKey = sessionCache.keys().next().value as string | undefined;
              if (!firstKey) break;
              sessionCache.delete(firstKey);
            }
          }
        }

        return parsed;
      } catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === 'AbortError') {
          if (options?.allowStaleOnTimeout) {
            const staleCached = sessionCache.get(cacheKey);
            if (staleCached && staleCached.staleExpiresAt > Date.now()) {
              Logger.warn('Using stale cached auth session after auth timeout', {
                cacheKeyPrefix: cacheKey.slice(0, 24)
              });
              return staleCached.value;
            }
          }
          throw HttpErrors.gatewayTimeout('Authentication server timeout - please try again');
        }
        if (error instanceof HttpError) {
          throw error;
        }
        throw error;
      }

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.error('[Auth] Session validation timeout after 3s:', authServerUrl);
        throw HttpErrors.gatewayTimeout('Authentication server timeout - please try again');
      }

      if (error instanceof HttpError) {
        throw error;
      }

      console.error('[Auth] Session validation error:', error instanceof Error ? error.message : String(error));
      throw HttpErrors.unauthorized('Failed to validate authentication session');
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
    if (widgetTokenSource === 'query' && !requestPath.endsWith('/ws')) {
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
    // Only fallback to widget token when cookie auth is truly unauthenticated.
    if (error instanceof HttpError && error.status === 401 && widgetToken) {
      return buildWidgetTokenContext();
    }
    throw error;
  }

  // Detect anonymous users (Better Auth anonymous plugin)
  // Anonymous users typically have:
  // - null/empty email
  // - name containing "Anonymous" or similar
  // - email starting with "anonymous-"
  const isAnonymous = typeof authResult.user.isAnonymous === 'boolean'
    ? authResult.user.isAnonymous
    : !authResult.user.email ||
      authResult.user.email.trim() === '' ||
      authResult.user.email.startsWith('anonymous-') ||
      authResult.user.name?.toLowerCase().includes('anonymous') ||
      authResult.user.name === 'Anonymous User';

  let previousAnonUserId = authResult.previousAnonUserId ?? null;
  // If Better Auth session omitted previous_anon_user_id, recover it from a
  // valid widget token that was minted for the same browser session.
  if (!isAnonymous && !previousAnonUserId && widgetToken && !(widgetTokenSource === 'query' && !requestPath.endsWith('/ws'))) {
    try {
      const widgetAuth = await validateWidgetAuthToken(widgetToken, env);
      if (widgetAuth.userId !== authResult.user.id) {
        previousAnonUserId = widgetAuth.userId;
      }
    } catch {
      // Ignore malformed/expired widget token when cookie auth already succeeded.
    }
  }

  return {
    ...authResult,
    cookie: normalizedCookie,
    isAnonymous,
    activeMembershipRole: authResult.activeMembershipRole ?? null,
    previousAnonUserId
  };
}

async function fetchMemberRoleFromRemote(
  cookie: string,
  env: Env,
  practiceId: string,
  userId: string,
  userEmail: string
): Promise<string> {
  const cacheKey = getMembershipCacheKey(practiceId, userId);
  const cached = membershipCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.role;
  }
  if (cached) {
    membershipCache.delete(cacheKey);
  }

  const inflight = membershipValidationInflight.get(cacheKey);
  if (inflight) {
    return inflight;
  }

  const validationPromise = (async () => {
    try {
      if (!cookie || !cookie.trim()) {
        throw HttpErrors.unauthorized('Authentication required');
      }
      const membershipRequest = new Request(`https://worker.invalid/api/practice/${encodeURIComponent(practiceId)}`, {
        method: 'GET',
        headers: {
          Cookie: cookie,
        },
      });
      const members = await RemoteApiService.getPracticeMembers(env, practiceId, membershipRequest);
      const normalizedEmail = userEmail ? userEmail.toLowerCase() : undefined;
      const match = members.find((member) => {
        if (member.user_id === userId) {
          return true;
        }
        if (normalizedEmail && typeof member.email === 'string' && member.email.toLowerCase() === normalizedEmail) {
          return true;
        }
        return false;
      });

      Logger.warn('[Auth] Remote practice membership lookup', {
        practiceId,
        userId,
        normalizedEmailPresent: Boolean(normalizedEmail),
        memberCount: members.length,
        memberUserIdsSample: members.slice(0, 10).map((member) => member.user_id),
        matchedUserId: match?.user_id ?? null,
        matchedRole: match?.role ?? null,
      });

      if (!match) {
        throw HttpErrors.forbidden('User is not a member of this practice');
      }

      if (!match.role) {
        throw HttpErrors.forbidden('User membership is missing role information');
      }

      membershipCache.set(cacheKey, {
        role: match.role,
        expiresAt: Date.now() + MEMBERSHIP_CACHE_TTL_MS
      });
      pruneMembershipCache();

      return match.role;
    } finally {
      membershipValidationInflight.delete(cacheKey);
    }
  })();

  membershipValidationInflight.set(cacheKey, validationPromise);
  return validationPromise;
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

async function requirePracticeMemberWithAuthContext(
  authContext: AuthContext,
  env: Env,
  practiceId: string,
  minimumRole?: "owner" | "admin" | "attorney" | "paralegal"
): Promise<AuthContext & { memberRole: string }> {
  const roleHierarchy: Record<string, number> = {
    'paralegal': 1,
    'attorney': 2,
    'admin': 3,
    'owner': 4
  };

  // 1. Validate practiceId
  if (!practiceId || typeof practiceId !== 'string' || practiceId.trim() === '') {
    throw HttpErrors.badRequest("Invalid or missing practiceId");
  }

  const normalizedPracticeId = practiceId.trim();
  const activeOrganizationId = authContext.activeOrganizationId?.trim() ?? null;
  const claimedRole = authContext.activeMembershipRole?.trim().toLowerCase() ?? null;

  // 2. Prefer Better Auth routing/session claims for the active org when available.
  // This avoids re-deriving same-org membership from the remote practice payload for
  // every protected write and keeps auth aligned with the current session context.
  let userRole: string | null = null;
  if (activeOrganizationId && activeOrganizationId === normalizedPracticeId && claimedRole) {
    userRole = claimedRole;
  }

  Logger.warn('[Auth] requirePracticeMemberWithAuthContext start', {
    practiceId: normalizedPracticeId,
    userId: authContext.user.id,
    isAnonymous: authContext.isAnonymous === true,
    activeOrganizationId,
    claimedRole,
    usedClaimedRole: Boolean(userRole),
    minimumRole: minimumRole ?? null,
    hasCookie: authContext.cookie.trim().length > 0,
  });

  // 3. Fall back to the remote membership lookup for non-active org contexts or
  // sessions that do not yet include routing membership claims.
  try {
    if (!userRole) {
      userRole = await fetchMemberRoleFromRemote(
        authContext.cookie,
        env,
        normalizedPracticeId,
        authContext.user.id,
        authContext.user.email
      );
    }

    // 4. Enforce role requirements if minimumRole is specified
    if (minimumRole) {
      // Validate that userRole exists in hierarchy
      const userRoleLevel = roleHierarchy[userRole];
      if (userRoleLevel === undefined) {
        throw HttpErrors.forbidden(`Invalid user role: ${userRole}. User has an unknown role in this practice.`);
      }

      // Validate that minimumRole exists in hierarchy
      const requiredRoleLevel = roleHierarchy[minimumRole];
      if (requiredRoleLevel === undefined) {
        throw HttpErrors.internalServerError(`Invalid configured minimum role: ${minimumRole}. This is a developer configuration error.`);
      }

      if (userRoleLevel < requiredRoleLevel) {
        throw HttpErrors.forbidden(`Insufficient permissions. Required role: ${minimumRole}, user role: ${userRole}`);
      }
    }

    // 5. Return authContext with actual memberRole
    return {
      ...authContext,
      memberRole: userRole,
    };
  } catch (error) {
    if (error instanceof HttpError) {
      throw error; // Re-throw HTTP errors
    }
    console.error('Error checking practice membership:', error);
    throw HttpErrors.internalServerError("Failed to verify practice membership");
  }
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
