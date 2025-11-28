import { Env } from '../types.js';
import { HttpErrors } from '../errorHandler.js';
import { SessionService } from '../services/SessionService.js';
import { optionalAuth } from './auth.js'; // Uses remote auth validation

export interface OrganizationContext {
  organizationId: string;
  source: 'auth' | 'session' | 'url' | 'default';
  sessionId?: string;
  isAuthenticated: boolean;
  userId?: string;
}

export interface OptionalOrganizationContext {
  organizationId: string | null;
  source: 'auth' | 'session' | 'url' | 'default' | 'none';
  sessionId?: string;
  isAuthenticated: boolean;
  userId?: string;
}

export interface RequestWithOrganizationContext extends Request {
  organizationContext?: OrganizationContext | OptionalOrganizationContext;
}

/**
 * Middleware that extracts organization context from multiple sources:
 * 1. Better-Auth session (authenticated users)
 * 2. Session cookie (anonymous users with session)
 * 3. URL query param (fallback)
 * 4. Default organization (last resort)
 */
export async function extractOrganizationContext(
  request: Request,
  env: Env,
  options: {
    requireOrganization?: boolean;
    defaultOrganizationId?: string;
    allowUrlOverride?: boolean;
  } = {}
): Promise<OrganizationContext | OptionalOrganizationContext> {
  const {
    requireOrganization = true,
    defaultOrganizationId,
    allowUrlOverride = true
  } = options;

  const url = new URL(request.url);
  const urlOrganizationId = url.searchParams.get('organizationId');

  // Try to get auth context first (for authenticated users)
  try {
    const authContext = await optionalAuth(request, env);
    if (authContext) {
      // For authenticated users, we could potentially get organization from their membership
      // For now, we'll still use URL param or session as primary source
      // This could be enhanced to get the user's active organization from better-auth
      
      // Check if user has a session with organization context
      const sessionToken = SessionService.getSessionTokenFromCookie(request);
      if (sessionToken) {
        try {
          // Compute target organization ID and ensure it's defined
          const targetOrgId = urlOrganizationId ?? defaultOrganizationId;
          if (!targetOrgId) {
            // No organization ID available, skip session resolution
            if (requireOrganization) {
              throw HttpErrors.badRequest('Organization context is required but could not be determined');
            }
            return {
              organizationId: null,
              source: 'none',
              isAuthenticated: true,
              userId: authContext.user.id
            };
          }
          
          // Try to resolve session by token to get organization
          const sessionResolution = await SessionService.resolveSession(env, {
            request,
            sessionToken,
            organizationId: targetOrgId,
            createIfMissing: false
          });

          return {
            organizationId: sessionResolution.session.organizationId,
            source: 'session',
            sessionId: sessionResolution.session.id,
            isAuthenticated: true,
            userId: authContext.user.id
          };
        } catch (sessionError) {
          // Session resolution failed, fall back to URL param
          console.warn('Session resolution failed for authenticated user:', sessionError);
        }
      }

      // Fall back to URL param for authenticated users
      if (urlOrganizationId) {
        return {
          organizationId: urlOrganizationId,
          source: 'url',
          isAuthenticated: true,
          userId: authContext.user.id
        };
      }
    }
  } catch (authError) {
    // Auth failed, continue with anonymous flow
    console.debug('Auth check failed, continuing with anonymous flow:', authError);
  }

  // For anonymous users, try session cookie first
  const sessionToken = SessionService.getSessionTokenFromCookie(request);
  if (sessionToken) {
    // Check if this is a read-only request that doesn't need session resolution
    const isReadOnlyRequest = request.method === 'GET' || request.method === 'HEAD';
    
    if (!isReadOnlyRequest) {
      // Only resolve session for endpoints that actually need it
      try {
        // Try to resolve session with URL param or default
        const targetOrgId = urlOrganizationId ?? defaultOrganizationId;
        if (!targetOrgId) {
          // No organization ID available, return without session resolution
          if (requireOrganization) {
            throw HttpErrors.badRequest('Organization context is required but could not be determined');
          }
          return {
            organizationId: null,
            source: 'none',
            isAuthenticated: false
          };
        }
        
        const sessionResolution = await SessionService.resolveSession(env, {
          request,
          sessionToken,
          organizationId: targetOrgId,
          createIfMissing: false
        });

        return {
          organizationId: sessionResolution.session.organizationId,
          source: 'session',
          sessionId: sessionResolution.session.id,
          isAuthenticated: false
        };
      } catch (sessionError) {
        // Session resolution failed, fall back to URL param
        console.warn('Session resolution failed for anonymous user:', sessionError);
      }
    }
  }

  // Fall back to URL parameter
  if (urlOrganizationId && allowUrlOverride) {
    return {
      organizationId: urlOrganizationId,
      source: 'url',
      isAuthenticated: false
    };
  }

  // Use default organization if provided
  if (defaultOrganizationId) {
    return {
      organizationId: defaultOrganizationId,
      source: 'default',
      isAuthenticated: false
    };
  }

  // No organization found and it's required
  if (requireOrganization) {
    throw HttpErrors.badRequest('Organization context is required but could not be determined');
  }

  // Return undefined organization when not required and no default provided
  return {
    organizationId: '',
    source: 'default',
    isAuthenticated: false
  };
}

/**
 * Middleware function that can be used in route handlers
 * Attaches organization context to the request object
 */
export async function withOrganizationContext(
  request: Request,
  env: Env,
  options: {
    requireOrganization?: boolean;
    defaultOrganizationId?: string;
    allowUrlOverride?: boolean;
  } = {}
): Promise<RequestWithOrganizationContext> {
  const context = await extractOrganizationContext(request, env, options);
  
  // Attach context to request
  (request as RequestWithOrganizationContext).organizationContext = context;
  
  return request as RequestWithOrganizationContext;
}

/**
 * Helper to get organization context from a request that has been processed by the middleware
 */
export function getOrganizationContext(request: Request): OrganizationContext | OptionalOrganizationContext {
  const req = request as RequestWithOrganizationContext;
  if (!req.organizationContext) {
    throw new Error('Request has not been processed by organization context middleware');
  }
  return req.organizationContext;
}

/**
 * Helper to get just the organization ID from context
 */
export function getOrganizationId(request: Request): string {
  const context = getOrganizationContext(request);
  if (context.organizationId === null) {
    throw new Error('Organization ID is null - this should not happen when requireOrganization is true');
  }
  return context.organizationId;
}

/**
 * Helper to check if the request is from an authenticated user
 */
export function isAuthenticated(request: Request): boolean {
  return getOrganizationContext(request).isAuthenticated;
}

/**
 * Helper to get the user ID if authenticated
 */
export function getUserId(request: Request): string | undefined {
  return getOrganizationContext(request).userId;
}

/**
 * Helper to get the session ID if available
 */
export function getSessionId(request: Request): string | undefined {
  return getOrganizationContext(request).sessionId;
}
