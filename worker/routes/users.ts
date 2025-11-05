import type { Env } from '../types';
import { HttpErrors, handleError, createSuccessResponse } from '../errorHandler';
import { requireAuth } from '../middleware/auth';

/**
 * Users route handler
 *
 * - POST /api/users/welcome
 *   Marks the authenticated user as welcomed by setting welcomed_at timestamp.
 *   Idempotent: multiple calls simply overwrite with the latest timestamp.
 */
export async function handleUsers(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  try {
    if (path === '/api/users/welcome' && request.method === 'POST') {
      const { user } = await requireAuth(request, env);
      if (!user?.id) {
        throw HttpErrors.unauthorized('Authentication required');
      }

      const nowIso = new Date().toISOString();
      try {
        await env.DB.prepare(
          `UPDATE users SET welcomed_at = ? WHERE id = ?`
        ).bind(nowIso, user.id).run();
      } catch (dbErr) {
        console.error('Failed to update welcomed_at for user', { userId: user.id, error: dbErr });
        throw HttpErrors.internalServerError('Failed to mark user as welcomed');
      }

      return createSuccessResponse({ success: true, welcomedAt: nowIso });
    }

    throw HttpErrors.notFound('Endpoint not found');
  } catch (error) {
    return handleError(error);
  }
}
