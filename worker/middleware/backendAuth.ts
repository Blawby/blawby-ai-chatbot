import type { Env } from '../types';
import { requireAuth } from './auth';

export interface BackendAuthContext {
  user: {
    id: string;
    email: string;
    name: string | null;
  };
  organizationId: string | null;
}

export async function requireBackendAuth(request: Request, env: Env): Promise<BackendAuthContext> {
  const authContext = await requireAuth(request, env);

  return {
    user: {
      id: authContext.user.id,
      email: authContext.user.email,
      name: authContext.user.name ?? null
    },
    organizationId: null
  };
}

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
