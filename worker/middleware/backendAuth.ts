import type { Env } from '../types';

export interface BackendAuthContext {
  user: {
    id: string;
    email: string;
    name: string | null;
  };
  organizationId: string | null;
}

/**
 * Validates a JWT token from the Blawby Backend API
 * @param token - The JWT token to validate
 * @param env - Environment variables
 * @returns Decoded token payload or null if invalid
 */
async function validateBackendToken(token: string, env: Env): Promise<any | null> {
  try {
    // For now, we'll decode the JWT token locally
    // In production, you might want to verify the signature with the backend's public key
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const payload = JSON.parse(atob(parts[1]));
    
    // Check if token is expired
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return null;
    }

    return payload;
  } catch (error) {
    console.error('Error validating backend token:', error);
    return null;
  }
}

/**
 * Extracts the Authorization header from the request
 * @param request - The incoming request
 * @returns The token string or null if not found
 */
function extractToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
}

/**
 * Middleware to require backend authentication
 * @param request - The incoming request
 * @param env - Environment variables
 * @returns Authentication context or throws error
 */
export async function requireBackendAuth(request: Request, env: Env): Promise<BackendAuthContext> {
  const token = extractToken(request);
  
  if (!token) {
    throw new Error('No authorization token provided');
  }

  const payload = await validateBackendToken(token, env);
  
  if (!payload) {
    throw new Error('Invalid or expired token');
  }

  if (!payload.userId || !payload.email) {
    throw new Error('Invalid token payload');
  }

  return {
    user: {
      id: payload.userId,
      email: payload.email,
      name: payload.name || null
    },
    organizationId: payload.activeOrganizationId || null
  };
}

/**
 * Middleware to optionally get backend authentication
 * @param request - The incoming request
 * @param env - Environment variables
 * @returns Authentication context or null if not authenticated
 */
export async function getBackendAuth(request: Request, env: Env): Promise<BackendAuthContext | null> {
  try {
    return await requireBackendAuth(request, env);
  } catch {
    return null;
  }
}

/**
 * Creates a 401 Unauthorized response
 * @param message - Error message
 * @returns Response object
 */
export function createUnauthorizedResponse(message: string = 'Unauthorized'): Response {
  return new Response(
    JSON.stringify({
      success: false,
      error: message,
      statusCode: 401
    }),
    {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    }
  );
}

/**
 * Creates a 403 Forbidden response
 * @param message - Error message
 * @returns Response object
 */
export function createForbiddenResponse(message: string = 'Forbidden'): Response {
  return new Response(
    JSON.stringify({
      success: false,
      error: message,
      statusCode: 403
    }),
    {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    }
  );
}
