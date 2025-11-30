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
}

/**
 * Validate Bearer token by calling remote auth server
 */
async function validateTokenWithRemoteServer(
  token: string,
  env: Env
): Promise<{ user: AuthenticatedUser; session: { id: string; expiresAt: Date } }> {
  const authServerUrl = env.AUTH_SERVER_URL || 'https://staging-api.blawby.com';
  const AUTH_TIMEOUT_MS = 3000; // 3 second timeout for auth validation
  
  // Create AbortController for timeout handling
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);
  
  try {
    const response = await fetch(`${authServerUrl}/api/session`, {
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
      if (response.status === 401) {
        throw HttpErrors.unauthorized("Invalid or expired token");
      }
      throw HttpErrors.unauthorized(`Authentication failed: ${response.status}`);
    }

    const sessionData = await response.json() as {
      user?: {
        id: string;
        email: string;
        name: string;
        emailVerified: boolean;
        image?: string;
      };
      session?: {
        id: string;
        expiresAt: string | number;
      };
    };

    if (!sessionData?.user) {
      throw HttpErrors.unauthorized("Invalid session data");
    }

    return {
      user: {
        id: sessionData.user.id,
        email: sessionData.user.email,
        name: sessionData.user.name,
        emailVerified: sessionData.user.emailVerified ?? false,
        image: sessionData.user.image,
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
      console.error('Auth validation timeout after 3s:', authServerUrl);
      throw HttpErrors.gatewayTimeout("Authentication server timeout - please try again");
    }
    
    // Handle HTTP errors
    if (error instanceof HttpError) {
      throw error;
    }
    
    // Handle other errors
    console.error('Error validating token with remote server:', error);
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
  return {
    ...authResult,
    token
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
  organizationId: string,
  userId: string,
  userEmail: string
): Promise<string> {
  const baseUrl = env.REMOTE_API_URL || env.AUTH_SERVER_URL || 'https://staging-api.blawby.com';
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(
      `${baseUrl}/api/practice/${encodeURIComponent(organizationId)}/members`,
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
      throw HttpErrors.notFound("Organization not found");
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
      throw HttpErrors.forbidden("User is not a member of this organization");
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
    console.error('Error verifying organization membership via remote API:', error);
    throw HttpErrors.badGateway("Failed to verify organization membership");
  }
}

export async function requireOrganizationMember(
  request: Request,
  env: Env,
  organizationId: string,
  minimumRole?: "owner" | "admin" | "attorney" | "paralegal"
): Promise<AuthContext & { memberRole: string }> {
  const authContext = await requireAuth(request, env);

  // 1. Validate organizationId
  if (!organizationId || typeof organizationId !== 'string' || organizationId.trim() === '') {
    throw HttpErrors.badRequest("Invalid or missing organizationId");
  }

  // 2. Fetch user's membership from remote API
  try {
    const userRole = await fetchMemberRoleFromRemote(
      authContext.token,
      env,
      organizationId,
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
        throw HttpErrors.forbidden(`Invalid user role: ${userRole}. User has an unknown role in this organization.`);
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
    console.error('Error checking organization membership:', error);
    throw HttpErrors.internalServerError("Failed to verify organization membership");
  }
}

export async function optionalAuth(
  request: Request,
  env: Env
): Promise<AuthContext | null> {
  try {
    return await requireAuth(request, env);
  } catch {
    return null;
  }
}

/**
 * Organization-based RBAC middleware
 * Verifies user is a member of the organization with the required role
 */
export async function requireOrgMember(
  request: Request,
  env: Env,
  organizationId: string,
  minimumRole?: "owner" | "admin" | "attorney" | "paralegal"
): Promise<AuthContext & { memberRole: string }> {
  // Delegate to the primary implementation to prevent drift
  return requireOrganizationMember(request, env, organizationId, minimumRole);
}

/**
 * Shorthand for owner-only access
 */
export async function requireOrgOwner(
  request: Request,
  env: Env,
  organizationId: string
): Promise<AuthContext & { memberRole: string }> {
  return requireOrgMember(request, env, organizationId, "owner");
}

/**
 * Check if user has access to an organization
 * Returns the access type and role without throwing errors
 */
export async function checkOrgAccess(
  request: Request,
  env: Env,
  organizationId: string
): Promise<{ hasAccess: boolean; memberRole?: string }> {
  try {
    const result = await requireOrgMember(request, env, organizationId);
    return {
      hasAccess: true,
      memberRole: result.memberRole,
    };
  } catch {
    return { hasAccess: false };
  }
}
