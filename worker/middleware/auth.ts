import { Env, HttpError } from "../types";
import { HttpErrors } from "../errorHandler";
import { organizationMembershipSchema } from "../schemas/validation";

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  image?: string;
}

export interface AuthContext {
  user: AuthenticatedUser;
  token: string;
}

function getBackendBaseUrl(env: Env): string {
  if (env.BLAWBY_API_URL) {
    return env.BLAWBY_API_URL;
  }
  return 'https://blawby-backend-production.up.railway.app/api';
}

async function fetchAuthenticatedUser(token: string, env: Env): Promise<AuthenticatedUser> {
  const response = await fetch(`${getBackendBaseUrl(env)}/auth/me`, {
    method: 'GET',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw HttpErrors.unauthorized("Authentication required");
  }

  const payload = await response.json() as { user?: AuthenticatedUser };
  if (!payload.user) {
    throw HttpErrors.unauthorized("Authentication required");
  }

  return payload.user;
}

export async function requireAuth(
  request: Request,
  env: Env
): Promise<AuthContext> {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw HttpErrors.unauthorized("Authentication required");
  }

  const user = await fetchAuthenticatedUser(authHeader, env);

  return {
    user,
    token: authHeader.replace(/^Bearer\s+/i, '')
  };
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

  // 2. Fetch user's membership for the organization using direct database query
  try {
    const membershipResult = await env.DB.prepare(`
      SELECT role FROM members 
      WHERE organization_id = ? AND user_id = ?
    `).bind(organizationId, authContext.user.id).first();
    
    // 3. Check if user has membership and validate the result
    if (!membershipResult) {
      throw HttpErrors.forbidden("User is not a member of this organization");
    }

    // 4. Validate the membership result structure and role
    const validatedMembership = organizationMembershipSchema.safeParse(membershipResult);
    if (!validatedMembership.success) {
      console.error('Invalid membership result structure:', {
        membershipResult,
        errors: validatedMembership.error.issues
      });
      throw HttpErrors.forbidden("User is not a member of this organization");
    }

    const userRole = validatedMembership.data.role;

    // 5. Enforce role requirements if minimumRole is specified
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

    // 6. Return authContext with actual memberRole
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
