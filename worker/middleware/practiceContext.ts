import { Env } from '../types.js';
import { HttpErrors } from '../errorHandler.js';
import { SessionService } from '../services/SessionService.js';
import { optionalAuth } from './auth.js'; // Uses remote auth validation

export interface PracticeContext {
  practiceId: string;
  source: 'auth' | 'session' | 'url' | 'default';
  sessionId?: string;
  isAuthenticated: boolean;
  userId?: string;
}

export interface OptionalPracticeContext {
  practiceId: string | null;
  source: 'auth' | 'session' | 'url' | 'default' | 'none';
  sessionId?: string;
  isAuthenticated: boolean;
  userId?: string;
}

export interface RequestWithPracticeContext extends Request {
  practiceContext?: PracticeContext | OptionalPracticeContext;
}

/**
 * List of query parameter names that are auth-related and must be rejected
 * to prevent URL-based authentication manipulation
 */
const AUTH_RELATED_QUERY_PARAMS = [
  'token',
  'authorization',
  'auth',
  'bearer',
  'access_token',
  'accessToken',
  'userId',
  'user_id',
  'userEmail',
  'user_email',
  'sessionId',
  'session_id',
  'cookie',
  'apiKey',
  'api_key',
  'apikey',
  'jwt',
  'refresh_token',
  'refreshToken'
];

/**
 * Validates that URL query parameters do not contain auth-related parameters
 * Throws an error if any auth-related parameters are found
 */
function validateNoAuthQueryParams(url: URL): void {
  for (const param of AUTH_RELATED_QUERY_PARAMS) {
    if (url.searchParams.has(param)) {
      throw HttpErrors.badRequest(
        `Security violation: Auth-related query parameter '${param}' is not allowed. ` +
        'Authentication must be provided via Authorization header or cookies only.'
      );
    }
  }
}

/**
 * Middleware that extracts practice context from multiple sources:
 * 1. Better-Auth session (authenticated users)
 * 2. Session cookie (anonymous users with session)
 * 3. URL query param (fallback)
 * 4. Default practice (last resort)
 * 
 * SECURITY: This function explicitly preserves all authentication-related
 * properties (headers, cookies, tokens) and only extracts practice metadata.
 * URL parameters cannot be used to modify authentication.
 */
export async function extractPracticeContext(
  request: Request,
  env: Env,
  options: {
    requirePractice?: boolean;
    defaultPracticeId?: string;
    allowUrlOverride?: boolean;
  } = {}
): Promise<PracticeContext | OptionalPracticeContext> {
  const {
    requirePractice = true,
    defaultPracticeId,
    allowUrlOverride = true
  } = options;

  const url = new URL(request.url);
  
  // SECURITY: Reject any auth-related query parameters to prevent URL-based auth manipulation
  validateNoAuthQueryParams(url);
  
  const urlPracticeId = url.searchParams.get('practiceId');

  // Try to get auth context first (for authenticated users)
  try {
    const authContext = await optionalAuth(request, env);
    if (authContext) {
      // For authenticated users, we could potentially get practice from their membership
      // For now, we'll still use URL param or session as primary source
      // This could be enhanced to get the user's active practice from better-auth
      
      // Check if user has a session with practice context
      const sessionToken = SessionService.getSessionTokenFromCookie(request);
      if (sessionToken) {
        try {
          // Compute target practice ID and ensure it's defined
          const targetPracticeId = urlPracticeId ?? defaultPracticeId;
          if (!targetPracticeId) {
            // No practice ID available, skip session resolution
            if (requirePractice) {
              throw HttpErrors.badRequest('Practice context is required but could not be determined');
            }
            return {
              practiceId: null,
              source: 'none',
              isAuthenticated: true,
              userId: authContext.user.id
            };
          }
          
          // Try to resolve session by token to get practice
          const sessionResolution = await SessionService.resolveSession(env, {
            request,
            sessionToken,
            practiceId: targetPracticeId,
            createIfMissing: false
          });

          return {
            practiceId: sessionResolution.session.practiceId,
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
      if (urlPracticeId) {
        return {
          practiceId: urlPracticeId,
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
        const targetPracticeId = urlPracticeId ?? defaultPracticeId;
        if (!targetPracticeId) {
          // No practice ID available, return without session resolution
          if (requirePractice) {
            throw HttpErrors.badRequest('Practice context is required but could not be determined');
          }
          return {
            practiceId: null,
            source: 'none',
            isAuthenticated: false
          };
        }
        
        const sessionResolution = await SessionService.resolveSession(env, {
          request,
          sessionToken,
          practiceId: targetPracticeId,
          createIfMissing: false
        });

        return {
          practiceId: sessionResolution.session.practiceId,
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
  if (urlPracticeId && allowUrlOverride) {
    return {
      practiceId: urlPracticeId,
      source: 'url',
      isAuthenticated: false
    };
  }

  // Use default practice if provided
  if (defaultPracticeId) {
    return {
      practiceId: defaultPracticeId,
      source: 'default',
      isAuthenticated: false
    };
  }

  // No practice found and it's required
  if (requirePractice) {
    throw HttpErrors.badRequest('Practice context is required but could not be determined');
  }

  // Return undefined practice when not required and no default provided
  return {
    practiceId: null,
    source: 'none',
    isAuthenticated: false
  };
}

/**
 * Middleware function that can be used in route handlers
 * Attaches practice context to the request object
 * 
 * SECURITY: This function explicitly preserves all authentication-related
 * properties (headers, cookies, tokens) and only attaches practice metadata.
 * The returned request object maintains the original request's authentication
 * headers and cookies unchanged. URL parameters cannot modify authentication.
 * 
 * @param request - Original request with authentication headers/cookies
 * @param env - Environment configuration
 * @param options - Options for practice context extraction
 * @returns Request with practice context attached (auth headers preserved)
 */
export async function withPracticeContext(
  request: Request,
  env: Env,
  options: {
    requirePractice?: boolean;
    defaultPracticeId?: string;
    allowUrlOverride?: boolean;
  } = {}
): Promise<RequestWithPracticeContext> {
  // SECURITY: Extract practice context without modifying the original request
  // The original request's headers, cookies, and authentication remain unchanged
  const context = await extractPracticeContext(request, env, {
    requirePractice: options.requirePractice,
    defaultPracticeId: options.defaultPracticeId,
    allowUrlOverride: options.allowUrlOverride
  });
  
  // SECURITY: Cast the original request (preserving all headers/cookies/auth)
  // and only attach practice metadata. The original request object is not cloned
  // or modified, so all authentication properties remain intact.
  const req = request as RequestWithPracticeContext;
  req.practiceContext = context;
  
  // SECURITY: Verify that auth headers are preserved
  // This is a defensive check to ensure we haven't accidentally modified the request
  const originalAuthHeader = request.headers.get('Authorization');
  const preservedAuthHeader = req.headers.get('Authorization');
  if (originalAuthHeader !== preservedAuthHeader) {
    throw new Error(
      'Security violation: withPracticeContext must preserve Authorization header. ' +
      'This indicates a bug in the middleware implementation.'
    );
  }
  
  return req;
}

/**
 * Helper to get practice context from a request that has been processed by the middleware
 */
export function getPracticeContext(request: Request): PracticeContext | OptionalPracticeContext {
  const req = request as RequestWithPracticeContext;
  if (!req.practiceContext) {
    throw new Error('Request has not been processed by practice context middleware');
  }
  return req.practiceContext;
}

/**
 * Helper to get just the practice ID from context
 */
export function getPracticeId(request: Request): string {
  const context = getPracticeContext(request);
  if (context.practiceId === null || context.practiceId === undefined) {
    throw new Error('Practice ID is null - this should not happen when requirePractice is true');
  }
  return context.practiceId;
}

/**
 * Helper to check if the request is from an authenticated user
 */
export function isAuthenticated(request: Request): boolean {
  return getPracticeContext(request).isAuthenticated;
}

/**
 * Helper to get the user ID if authenticated
 */
export function getUserId(request: Request): string | undefined {
  return getPracticeContext(request).userId;
}

/**
 * Helper to get the session ID if available
 */
export function getSessionId(request: Request): string | undefined {
  return getPracticeContext(request).sessionId;
}
