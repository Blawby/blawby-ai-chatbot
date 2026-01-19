import { Env } from '../types.js';
import { HttpErrors } from '../errorHandler.js';
import { optionalAuth } from './auth.js'; // Uses remote auth validation

export interface PracticeContext {
  practiceId: string;
  source: 'auth' | 'url' | 'default';
  isAuthenticated: boolean;
  userId?: string;
}

export interface OptionalPracticeContext {
  practiceId: string | null;
  source: 'auth' | 'url' | 'default' | 'none';
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
        'Authentication must be provided via session cookies only.'
      );
    }
  }
}

/**
 * Middleware that extracts practice context from multiple sources:
 * 1. Better-Auth session (authenticated and anonymous users)
 * 2. URL query param (fallback)
 * 3. Default practice (last resort)
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

  // Try to get auth context (works for both authenticated and anonymous users via Better Auth)
  try {
    const authContext = await optionalAuth(request, env);
    if (authContext) {
      // Both authenticated and anonymous users have a user.id from Better Auth
      // Use URL param or default for practice context
      if (urlPracticeId) {
        return {
          practiceId: urlPracticeId,
          source: 'url',
          isAuthenticated: !authContext.isAnonymous,
          userId: authContext.user.id
        };
      }
      
      // If no URL param, try default
      if (defaultPracticeId) {
        return {
          practiceId: defaultPracticeId,
          source: 'default',
          isAuthenticated: !authContext.isAnonymous,
          userId: authContext.user.id
        };
      }
      
      // No practice ID available
      if (requirePractice) {
        throw HttpErrors.badRequest('Practice context is required but could not be determined');
      }
      return {
        practiceId: null,
        source: 'none',
        isAuthenticated: !authContext.isAnonymous,
        userId: authContext.user.id
      };
    }
  } catch (authError) {
    // Auth failed, continue with fallback flow
    console.debug('Auth check failed, continuing with fallback flow:', authError);
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

// getSessionId removed - sessions are no longer used
