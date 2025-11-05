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
        const result = await env.DB.prepare(
          `UPDATE users SET welcomed_at = ? WHERE id = ?`
        ).bind(nowIso, user.id).run();
        // Drizzle-D1 run() returns an object; rows affected is vendor-specific: use 'changes' if available
        const affected = (result as unknown as { changes?: number; rowsAffected?: number }).changes ?? (result as unknown as { rowsAffected?: number }).rowsAffected ?? 0;
        if (!affected || affected === 0) {
          console.error('Failed to update welcomed_at: no matching user', { userId: user.id });
          throw HttpErrors.internalServerError('Failed to mark user as welcomed: no matching user');
        }
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
