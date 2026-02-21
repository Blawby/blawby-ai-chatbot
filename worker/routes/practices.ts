import { Env } from '../types.js';
import { requirePracticeMemberRole } from '../middleware/auth.js';
import { handleError, HttpErrors } from '../errorHandler.js';
import { RemoteApiService } from '../services/RemoteApiService.js';

function createSuccessResponse(data: unknown): Response {
  return new Response(
    JSON.stringify({ success: true, data }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }
  );
}

type PracticeRole = 'owner' | 'admin' | 'attorney' | 'paralegal';
const ROLE_HIERARCHY: Record<PracticeRole, number> = {
  paralegal: 1,
  attorney: 2,
  admin: 3,
  owner: 4
};

function normalizeRole(value: unknown): PracticeRole | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'owner' || normalized === 'admin' || normalized === 'attorney' || normalized === 'paralegal') {
    return normalized;
  }
  return null;
}

function requireMinimumRole(memberRole: string, minimumRole: PracticeRole): void {
  const normalizedRole = normalizeRole(memberRole);
  if (!normalizedRole) {
    throw HttpErrors.forbidden(`Invalid practice role: ${memberRole}`);
  }
  if (ROLE_HIERARCHY[normalizedRole] < ROLE_HIERARCHY[minimumRole]) {
    throw HttpErrors.forbidden(`Insufficient permissions. Required role: ${minimumRole}`);
  }
}

function parseLimit(rawLimit: string | null, defaultValue: number = 25): number {
  const parsed = Number(rawLimit);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return defaultValue;
  }
  return Math.min(parsed, 100);
}

export async function handlePractices(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const path = url.pathname.replace('/api/practices', '');

    // Only handle workspace endpoints - all other practice management is handled by remote API
    const isWorkspaceEndpoint = path.includes('/workspace');
    if (!isWorkspaceEndpoint) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Practice management endpoints are handled by remote API. Use /api/practices/:id/workspace/* for chatbot data.'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const pathParts = path.split('/').filter(Boolean);
    if (pathParts.length < 3 || pathParts[1] !== 'workspace') {
      throw HttpErrors.notFound('Workspace resource not found');
    }

    const practiceIdentifier = pathParts[0];
    const resource = pathParts[2];
    const practice = await RemoteApiService.getPractice(env, practiceIdentifier, request);

    if (!practice) {
      throw HttpErrors.notFound('Practice not found');
    }

    const authContext = await requirePracticeMemberRole(request, env, practice.id);
    const limit = parseLimit(url.searchParams.get('limit'));

    if (resource === 'sessions') {
      requireMinimumRole(authContext.memberRole, 'admin');

      const rawStatus = url.searchParams.get('status');
      const validStatuses = new Set<string>(['active', 'archived', 'closed']);
      if (rawStatus && !validStatuses.has(rawStatus)) {
        throw HttpErrors.badRequest(`Invalid status filter. Valid values: ${Array.from(validStatuses).join(', ')}`);
      }
      const statusFilter = (rawStatus as 'active' | 'archived' | 'closed' | null) ?? null;
      const baseQuery = `
        SELECT id,
               status,
               practice_id as practiceId,
               user_id as userId,
               matter_id as matterId,
               participants,
               user_info as userInfo,
               assigned_to as assignedTo,
               priority,
               tags,
               internal_notes as internalNotes,
               last_message_at as lastMessageAt,
               first_response_at as firstResponseAt,
               closed_at as closedAt,
               created_at as createdAt,
               updated_at as updatedAt
          FROM conversations
         WHERE practice_id = ?
         ${statusFilter ? 'AND status = ?' : ''}
         ORDER BY updated_at DESC
         LIMIT ?`;

      const bindings = statusFilter
        ? [practice.id, statusFilter, limit]
        : [practice.id, limit];

      const conversations = await env.DB.prepare(baseQuery).bind(...bindings).all();

      return createSuccessResponse({
        sessions: conversations.results?.map((conv) => ({
          id: conv.id,
          state: conv.status,
          statusReason: null,
          isHold: false,
          createdAt: conv.createdAt,
          updatedAt: conv.updatedAt,
          lastActive: conv.lastMessageAt || conv.updatedAt,
          closedAt: conv.closedAt || null,
          userId: conv.userId
        })) ?? []
      });
    }

    if (resource === 'matters') {
      throw HttpErrors.notFound('Workspace matters are handled by the backend API');
    }

    throw HttpErrors.notFound('Workspace resource not found');
  } catch (error) {
    return handleError(error);
  }
}
