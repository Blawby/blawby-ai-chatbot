import { Env, HttpError } from "../types";
import { HttpErrors } from "../errorHandler";

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  image?: string;
}

export interface AuthContext {
  user: AuthenticatedUser;
  session: {
    id: string;
    expiresAt: Date;
  };
  token: string;
  isAnonymous?: boolean; // Flag for anonymous users (Better Auth anonymous plugin)
}

/**
 * Validate Bearer token by calling remote Better Auth API directly
 * 
 * NOTE: For server-to-server calls (Worker → Better Auth backend), we make a direct HTTP call
 * to the Better Auth API endpoint (/api/auth/get-session), not using the client library.
 * 
 * The Better Auth client library (createAuthClient) is meant for browser/frontend use.
 * For server-to-server calls, we use direct HTTP fetch with Bearer token in Authorization header.
 * 
 * Architecture:
 * - Frontend: Uses createAuthClient from 'better-auth/react' (browser/client-side)
 * - Worker: Makes direct HTTP fetch to Better Auth API (server-to-server)
 */
async function validateTokenWithRemoteServer(
  token: string,
  env: Env
): Promise<{ user: AuthenticatedUser; session: { id: string; expiresAt: Date } }> {
  // ENV VAR: REMOTE_API_URL (worker/.dev.vars or wrangler.toml)
  // Points to Better Auth backend (e.g., http://localhost:3000 or https://staging-api.blawby.com)
  const authServerUrl = env.REMOTE_API_URL || 'https://staging-api.blawby.com';

  const AUTH_TIMEOUT_MS = 3000; // 3 second timeout for auth validation

  // Create AbortController for timeout handling
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);

  try {
    // Call Better Auth API directly (server-to-server)
    // Better Auth API endpoint: /api/auth/get-session
    // We pass the Bearer token in Authorization header
    const getSessionUrl = `${authServerUrl}/api/auth/get-session`;

    // Make direct HTTP call to Better Auth API
    const response = await fetch(getSessionUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });

    // Clear timeout on successful fetch start
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error('[Auth] Better Auth API validation failed:', response.status, errorText.substring(0, 200));
      throw HttpErrors.unauthorized(`Authentication failed: ${response.status} ${response.statusText}`);
    }

    // Parse Better Auth API response
    // Better Auth can return different formats:
    // - Raw: { user: {...}, session: {...} }
    // - Wrapped: { data: { user: {...}, session: {...} } }
    // - Error: { error: {...} } or { message: "..." }
    const rawResponse = await response.json() as Record<string, unknown>;

    // Check for error responses
    if (rawResponse.error) {
      const errorObj = rawResponse.error as { message?: string };
      console.error('[Auth] Better Auth API returned error:', errorObj.message || 'Unknown error');
      throw HttpErrors.unauthorized(errorObj.message || "Invalid or expired token");
    }

    if (rawResponse.message && typeof rawResponse.message === 'string') {
      // Error format: { message: "..." }
      throw HttpErrors.unauthorized(rawResponse.message);
    }

    // Extract user and session - handle both wrapped and unwrapped formats
    let user: { id: string; email: string; name: string; emailVerified?: boolean; image?: string | null } | undefined;
    let session: { id: string; expiresAt: Date | string } | undefined;

    if (rawResponse.data && typeof rawResponse.data === 'object') {
      // Wrapped format: { data: { user, session } }
      const data = rawResponse.data as { user?: typeof user; session?: typeof session };
      user = data.user;
      session = data.session;
    } else if (rawResponse.user && typeof rawResponse.user === 'object') {
      // Raw format: { user, session }
      user = rawResponse.user as typeof user;
      session = rawResponse.session as typeof session;
    }

    if (!user?.id) {
      console.error('[Auth] No user in session data from Better Auth API');
      throw HttpErrors.unauthorized("Invalid session data - no user found");
    }

    const sessionData = { user, session };

    return {
      user: {
        id: sessionData.user.id,
        email: sessionData.user.email,
        name: sessionData.user.name,
        emailVerified: sessionData.user.emailVerified ?? false,
        image: sessionData.user.image ?? undefined,
      },
      session: {
        id: sessionData.session?.id || sessionData.user.id,
        expiresAt: sessionData.session?.expiresAt
          ? new Date(sessionData.session.expiresAt)
          : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Default 7 days
      },
    };
  } catch (error) {
    // Clear timeout in case of error
    clearTimeout(timeoutId);

    // Handle timeout/abort errors specifically
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('[Auth] Validation timeout after 3s:', authServerUrl);
      throw HttpErrors.gatewayTimeout("Authentication server timeout - please try again");
    }

    // Handle HTTP errors
    if (error instanceof HttpError) {
      throw error;
    }

    // Handle other errors
    console.error('[Auth] Token validation error:', error instanceof Error ? error.message : String(error));
    throw HttpErrors.unauthorized("Failed to validate authentication token");
  }
}

export async function requireAuth(
  request: Request,
  env: Env
): Promise<AuthContext> {
  // Extract Bearer token from Authorization header
  const authHeader = request.headers.get('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw HttpErrors.unauthorized("Authentication required - Bearer token missing");
  }

  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) {
    throw HttpErrors.unauthorized("Authentication required - invalid token format");
  }

  // Validate token with remote auth server
  const authResult = await validateTokenWithRemoteServer(token, env);

  // Detect anonymous users (Better Auth anonymous plugin)
  // Anonymous users typically have:
  // - null/empty email
  // - name containing "Anonymous" or similar
  // - email starting with "anonymous-"
  const isAnonymous = !authResult.user.email ||
    authResult.user.email.trim() === '' ||
    authResult.user.email.startsWith('anonymous-') ||
    authResult.user.name?.toLowerCase().includes('anonymous') ||
    authResult.user.name === 'Anonymous User';

  return {
    ...authResult,
    token,
    isAnonymous
  };
}

type RemoteMemberRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

function extractMembersPayload(payload: unknown): RemoteMemberRecord[] {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord);
  }
  if (isRecord(payload)) {
    if (Array.isArray(payload.members)) {
      return payload.members.filter(isRecord);
    }
    if (isRecord(payload.data) && Array.isArray(payload.data.members)) {
      return payload.data.members.filter(isRecord);
    }
  }
  return [];
}

function extractMemberIdentifiers(member: RemoteMemberRecord): {
  userId?: string;
  email?: string;
  role?: string;
} {
  const userId =
    typeof member.user_id === 'string'
      ? member.user_id
      : typeof member.userId === 'string'
        ? member.userId
        : undefined;
  const email =
    typeof member.email === 'string'
      ? member.email.toLowerCase()
      : undefined;
  const role =
    typeof member.role === 'string'
      ? member.role
      : typeof member.permission === 'string'
        ? member.permission
        : undefined;

  return { userId, email, role };
}

async function fetchMemberRoleFromRemote(
  token: string,
  env: Env,
  practiceId: string,
  userId: string,
  userEmail: string
): Promise<string> {
  // ENV VAR: REMOTE_API_URL (worker/.dev.vars or wrangler.toml)
  const baseUrl = env.REMOTE_API_URL || 'https://staging-api.blawby.com';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(
      `${baseUrl}/api/practice/${encodeURIComponent(practiceId)}/members`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        signal: controller.signal
      }
    );
    clearTimeout(timeoutId);

    if (response.status === 404) {
      throw HttpErrors.notFound("Practice not found");
    }

    if (!response.ok) {
      throw HttpErrors.badGateway(`Failed to verify membership (status ${response.status})`);
    }

    const payload = await response.json().catch(() => ({}));
    const members = extractMembersPayload(payload);
    const normalizedEmail = userEmail.toLowerCase();

    const match = members.find((member) => {
      const { userId: memberUserId, email } = extractMemberIdentifiers(member);
      if (memberUserId && memberUserId === userId) {
        return true;
      }
      if (email && normalizedEmail && email === normalizedEmail) {
        return true;
      }
      return false;
    });

    if (!match) {
      throw HttpErrors.forbidden("User is not a member of this practice");
    }

    const { role } = extractMemberIdentifiers(match);
    if (!role) {
      throw HttpErrors.forbidden("User membership is missing role information");
    }

    return role;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof HttpError) {
      throw error;
    }
    if (error instanceof Error && error.name === 'AbortError') {
      throw HttpErrors.gatewayTimeout("Membership verification timed out");
    }
    console.error('Error verifying practice membership via remote API:', error);
    throw HttpErrors.badGateway("Failed to verify practice membership");
  }
}

export async function requirePracticeMember(
  request: Request,
  env: Env,
  practiceId: string,
  minimumRole?: "owner" | "admin" | "attorney" | "paralegal"
): Promise<AuthContext & { memberRole: string }> {
  const authContext = await requireAuth(request, env);

  // 1. Validate practiceId
  if (!practiceId || typeof practiceId !== 'string' || practiceId.trim() === '') {
    throw HttpErrors.badRequest("Invalid or missing practiceId");
  }

  // 2. Fetch user's membership from remote API
  try {
    const userRole = await fetchMemberRoleFromRemote(
      authContext.token,
      env,
      practiceId,
      authContext.user.id,
      authContext.user.email
    );

    // 3. Enforce role requirements if minimumRole is specified
    if (minimumRole) {
      const roleHierarchy: Record<string, number> = {
        'paralegal': 1,
        'attorney': 2,
        'admin': 3,
        'owner': 4
      };

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

    // 4. Return authContext with actual memberRole
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
  } catch (_error) {
    // Silently return null for optional auth - errors are expected when no token is provided
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
  minimumRole?: "owner" | "admin" | "attorney" | "paralegal"
): Promise<AuthContext & { memberRole: string }> {
  // Delegate to the primary implementation to prevent drift
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
  practiceId: string
): Promise<{ hasAccess: boolean; memberRole?: string }> {
  try {
    const result = await requirePracticeMemberRole(request, env, practiceId);
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
  practiceId: string
): Promise<{ isMember: boolean; memberRole?: string }> {
  try {
    const result = await requirePracticeMemberRole(request, env, practiceId);
    return {
      isMember: true,
      memberRole: result.memberRole,
    };
  } catch {
    return { isMember: false };
  }
}
