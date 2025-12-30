import { MatterService } from '../services/MatterService.js';
import { ConversationService } from '../services/ConversationService.js';
import { Env } from '../types.js';
import { requireAuth, requirePracticeMemberRole } from '../middleware/auth.js';
import { handleError, HttpErrors } from '../errorHandler.js';
import { parseJsonBody } from '../utils.js';
import { NotificationService } from '../services/NotificationService.js';
import { RemoteApiService } from '../services/RemoteApiService.js';
import { Buffer } from 'buffer';

/**
 * Helper function to create standardized success responses
 */
function createSuccessResponse(data: unknown): Response {
  return new Response(
    JSON.stringify({ 
      success: true, 
      data 
    }), 
    { 
      status: 200,
      headers: { 'Content-Type': 'application/json' } 
    }
  );
}

type MatterStatusValue = 'lead' | 'open' | 'in_progress' | 'completed' | 'archived';
const MATTER_STATUS_VALUES: Set<MatterStatusValue> = new Set(['lead', 'open', 'in_progress', 'completed', 'archived']);

type WorkspaceMatterRow = {
  id: string;
  title: string;
  matterType: string;
  status: MatterStatusValue;
  priority: string;
  clientName?: string | null;
  leadSource?: string | null;
  createdAt: string;
  updatedAt: string;
  acceptedByUserId?: string | null;
  acceptedAt?: string | null;
};

function parseLimit(rawLimit: string | null, defaultValue: number = 25): number {
  const parsed = Number(rawLimit);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return defaultValue;
  }
  return Math.min(parsed, 100);
}

function parseJsonField<T = unknown>(value: unknown): T | null {
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

async function notifyIntakeDecision(options: {
  env: Env;
  practiceId: string;
  matterId: string;
  actorUserId: string;
  decision: 'accepted' | 'rejected';
  reason?: string | null;
}): Promise<void> {
  const { env, practiceId, matterId, actorUserId, decision, reason } = options;

  const record = await env.DB.prepare(
    `SELECT custom_fields
       FROM matters
      WHERE id = ? AND practice_id = ?`
  ).bind(matterId, practiceId).first<{ custom_fields?: string | null } | null>();

  const customFields = parseJsonField<Record<string, unknown>>(record?.custom_fields ?? null);
  const sessionId = typeof customFields?.sessionId === 'string' ? customFields.sessionId : null;
  if (!sessionId) return;

  const conversationService = new ConversationService(env);
  try {
    await conversationService.attachMatter(sessionId, practiceId, matterId);
  } catch {
    // ignore attach failures; still try to post the system message
  }
  try {
    await conversationService.addParticipants(sessionId, practiceId, [actorUserId]);
  } catch {
    // ignore participant add failures; still try to post the system message
  }

  let isConversationLinked = false;
  try {
    const conversation = await conversationService.getConversation(sessionId, practiceId);
    isConversationLinked = Boolean(conversation.user_id);
  } catch {
    // If we can't read the conversation, fall back to anonymous messaging
    isConversationLinked = false;
  }

  const signInPath = `/auth?mode=signin&conversationId=${encodeURIComponent(sessionId)}&practiceId=${encodeURIComponent(practiceId)}`;

  const content = decision === 'accepted'
    ? (isConversationLinked
      ? 'Your intake has been accepted. Continue the conversation below.'
      : `Your intake has been accepted. [Sign in](${signInPath}) to continue this conversation and share more details.`)
    : (isConversationLinked
      ? `Your intake was reviewed and declined.${reason ? ` Reason: ${reason}` : ''} If you'd like to follow up, you can submit another request at any time.`
      : `Your intake was reviewed and declined.${reason ? ` Reason: ${reason}` : ''} If you'd like to follow up, you can [sign in](${signInPath}) or submit another request at any time.`);

  try {
    await conversationService.sendMessage({
      conversationId: sessionId,
      practiceId,
      senderUserId: actorUserId,
      content,
      role: 'system',
      metadata: {
        intakeDecision: decision
      }
    });
  } catch (error) {
    console.error('[Practice] Failed to notify intake decision in conversation:', error);
  }
}

function normalizeMatterStatus(value: string): MatterStatusValue {
  const normalized = value.trim().toLowerCase();
  if (!MATTER_STATUS_VALUES.has(normalized as MatterStatusValue)) {
    throw HttpErrors.badRequest(`Invalid matter status: ${value}`);
  }
  return normalized as MatterStatusValue;
}

type MattersCursor = { createdAt: string; id: string };

function encodeMattersCursor(cursor: MattersCursor): string {
  const payload = JSON.stringify(cursor);
  const encoder = new TextEncoder();
  const bytes = encoder.encode(payload);
  const binaryString = String.fromCharCode(...bytes);
  const base64 = btoa(binaryString);

  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}

function decodeMattersCursor(cursor: string): MattersCursor {
  try {
    const padding = '='.repeat((4 - cursor.length % 4) % 4);
    const base64 = (cursor + padding).replace(/-/g, '+').replace(/_/g, '/');
    const decoded = Buffer.from(base64, 'base64').toString('utf8');
    const parsed = JSON.parse(decoded) as Partial<MattersCursor>;

    if (!parsed.createdAt || !parsed.id) {
      throw new Error('Invalid cursor payload');
    }

    return {
      createdAt: String(parsed.createdAt),
      id: String(parsed.id)
    };
  } catch {
    throw HttpErrors.badRequest('Invalid cursor');
  }
}

async function validateIdempotencyKeyLength(key: string): Promise<void> {
  if (key.length > 128) {
    throw HttpErrors.badRequest('Idempotency key exceeds maximum length');
  }
}

function buildMatterIdempotencyKey(practiceId: string, key: string): string {
  return `idempotency:matters:${practiceId}:${key}`;
}

async function getMatterMutationResult(env: Env, practiceId: string, key: string): Promise<Record<string, unknown> | null> {
  const storageKey = buildMatterIdempotencyKey(practiceId, key);
  const raw = await env.CHAT_SESSIONS.get(storageKey);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function storeMatterMutationResult(env: Env, practiceId: string, key: string, value: Record<string, unknown>): Promise<void> {
  const storageKey = buildMatterIdempotencyKey(practiceId, key);
  await env.CHAT_SESSIONS.put(storageKey, JSON.stringify(value), { expirationTtl: 60 * 60 * 24 });
}

  export async function handlePractices(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const path = url.pathname.replace('/api/practices', '');
    
    // Only handle workspace endpoints - all other practice management is handled by remote API
    const isWorkspaceEndpoint = path.includes('/workspace');
    
    if (!isWorkspaceEndpoint) {
      // Return 404 for all non-workspace endpoints (management is handled by remote API)
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Practice management endpoints are handled by remote API. Use /api/practices/:id/workspace/* for chatbot data.' 
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Practice workspace analytics + data feeds
    if (path.includes('/workspace')) {
      const pathParts = path.split('/').filter(Boolean);
      if (pathParts.length >= 3 && pathParts[1] === 'workspace') {
        const practiceIdentifier = pathParts[0];
        const resource = pathParts[2];
        // Fetch practice from remote API
        const practice = await RemoteApiService.getPractice(env, practiceIdentifier, request);

        if (!practice) {
          throw HttpErrors.notFound('Practice not found');
        }

        // Require at least admin access for dashboard data
        await requirePracticeMemberRole(request, env, practice.id, 'admin');

        const limit = parseLimit(url.searchParams.get('limit'));

        if (resource === 'sessions') {
          // Sessions removed - returning conversations instead
          // Note: This endpoint may need to be renamed to 'conversations' in the future
          const statusFilter = url.searchParams.get('status') as 'active' | 'archived' | 'closed' | null;
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

          // Preact usage: feed conversation list or analytics widgets.
          return createSuccessResponse({
            sessions: conversations.results?.map(conv => ({
              id: conv.id,
              state: conv.status, // Map status to state for backward compatibility
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
          const matterService = new MatterService(env);

          if (pathParts.length >= 4) {
            const matterId = pathParts[3];
            if (!matterId) {
              throw HttpErrors.badRequest('matterId is required');
            }

            const action = pathParts[4] ?? null;

            if (!action && request.method === 'GET') {
              const record = await env.DB.prepare(
                `SELECT id,
                        title,
                        matter_type as matterType,
                        status,
                        priority,
                        client_name as clientName,
                        lead_source as leadSource,
                        created_at as createdAt,
                        updated_at as updatedAt,
                        (
                          SELECT created_by_lawyer_id
                            FROM matter_events
                           WHERE matter_id = matters.id
                             AND event_type = 'accept'
                           ORDER BY event_date DESC
                           LIMIT 1
                        ) AS acceptedByUserId,
                        (
                          SELECT event_date
                            FROM matter_events
                           WHERE matter_id = matters.id
                             AND event_type = 'accept'
                           ORDER BY event_date DESC
                           LIMIT 1
                        ) AS acceptedAt
                   FROM matters
                  WHERE practice_id = ?
                    AND id = ?`
              ).bind(practice.id, matterId).first<WorkspaceMatterRow | null>();

              if (!record) {
                throw HttpErrors.notFound('Matter not found');
              }

              const payload = {
                id: record.id,
                title: record.title,
                matterType: record.matterType,
                status: record.status,
                priority: record.priority,
                clientName: record.clientName ?? null,
                leadSource: record.leadSource ?? null,
                createdAt: record.createdAt,
                updatedAt: record.updatedAt,
                acceptedBy: record.acceptedByUserId
                  ? {
                      userId: record.acceptedByUserId,
                      acceptedAt: record.acceptedAt ?? null
                    }
                  : null
              };

              return createSuccessResponse({ matter: payload });
            }

            if (action === 'accept' && request.method === 'POST') {
              const authContext = await requireAuth(request, env);
              await requirePracticeMemberRole(request, env, practice.id, 'admin');

              let idempotencyKey = request.headers.get('Idempotency-Key');
              if (idempotencyKey) await validateIdempotencyKeyLength(idempotencyKey);

              if (idempotencyKey) {
                const existing = await getMatterMutationResult(env, practice.id, idempotencyKey);
                if (existing) {
                  return createSuccessResponse(existing);
                }
              }

              const result = await matterService.acceptLead({
                practiceId: practice.id,
                matterId,
                actorUserId: authContext.user.id
              });

              if (idempotencyKey) {
                await storeMatterMutationResult(env, practice.id, idempotencyKey, result as unknown as Record<string, unknown>);
              }

              try {
                const notifier = new NotificationService(env);
                const prevStatusCandidate = (result as unknown as { previousStatus?: unknown }).previousStatus;
                const prevStatus = typeof prevStatusCandidate === 'string' ? prevStatusCandidate : undefined;
                await notifier.sendMatterUpdateNotification({
                  type: 'matter_update',
                  practiceConfig: practice,
                  matterInfo: { type: 'Lead' },
                  update: {
                    action: 'accept',
                    fromStatus: prevStatus,
                    toStatus: result.status,
                    actorId: authContext.user.id
                  }
                });
              } catch (error) { void error; }

              await notifyIntakeDecision({
                env,
                practiceId: practice.id,
                matterId,
                actorUserId: authContext.user.id,
                decision: 'accepted'
              });

              return createSuccessResponse(result);
            }

            if (action === 'reject' && request.method === 'POST') {
              const authContext = await requireAuth(request, env);
              await requirePracticeMemberRole(request, env, practice.id, 'admin');

              let idempotencyKey = request.headers.get('Idempotency-Key');
              if (idempotencyKey) await validateIdempotencyKeyLength(idempotencyKey);

              const body: Record<string, unknown> = (await parseJsonBody(request).catch(() => ({}))) as Record<string, unknown>;
              const reason = typeof body.reason === 'string' && body.reason.trim().length > 0 ? (body.reason as string).trim() : null;

              if (idempotencyKey) {
                const existing = await getMatterMutationResult(env, practice.id, idempotencyKey);
                if (existing) {
                  return createSuccessResponse(existing);
                }
              }

              const result = await matterService.rejectLead({
                practiceId: practice.id,
                matterId,
                actorUserId: authContext.user.id,
                reason
              });

              if (idempotencyKey) {
                await storeMatterMutationResult(env, practice.id, idempotencyKey, result as unknown as Record<string, unknown>);
              }

              try {
                const notifier = new NotificationService(env);
                const prevStatusCandidate2 = (result as unknown as { previousStatus?: unknown }).previousStatus;
                const prevStatus = typeof prevStatusCandidate2 === 'string' ? prevStatusCandidate2 : undefined;
                await notifier.sendMatterUpdateNotification({
                  type: 'matter_update',
                  practiceConfig: practice,
                  matterInfo: { type: 'Lead' },
                  update: {
                    action: 'reject',
                    fromStatus: prevStatus,
                    toStatus: result.status,
                    actorId: authContext.user.id
                  }
                });
              } catch (error) { void error; }

              await notifyIntakeDecision({
                env,
                practiceId: practice.id,
                matterId,
                actorUserId: authContext.user.id,
                decision: 'rejected',
                reason
              });

              return createSuccessResponse(result);
            }

            if (action === 'status' && request.method === 'PATCH') {
              const authContext = await requireAuth(request, env);
              await requirePracticeMemberRole(request, env, practice.id, 'attorney');

              let idempotencyKey = request.headers.get('Idempotency-Key');
              if (idempotencyKey) await validateIdempotencyKeyLength(idempotencyKey);

              const body = await parseJsonBody(request);
              const targetStatusRaw = (body as Record<string, unknown>).status;
              if (typeof targetStatusRaw !== 'string' || targetStatusRaw.trim().length === 0) {
                throw HttpErrors.badRequest('status is required');
              }
              const targetStatus = normalizeMatterStatus(String(targetStatusRaw));
              const reason = typeof (body as Record<string, unknown>).reason === 'string'
                ? ((body as Record<string, unknown>).reason as string).trim()
                : null;

              if (idempotencyKey) {
                const existing = await getMatterMutationResult(env, practice.id, idempotencyKey);
                if (existing) {
                  return createSuccessResponse(existing);
                }
              }

              const result = await matterService.transitionStatus({
                practiceId: practice.id,
                matterId,
                targetStatus,
                actorUserId: authContext.user.id,
                reason
              });

              if (idempotencyKey) {
                await storeMatterMutationResult(env, practice.id, idempotencyKey, result as unknown as Record<string, unknown>);
              }

              try {
                const notifier = new NotificationService(env);
                const prevStatusCandidate3 = (result as unknown as { previousStatus?: unknown }).previousStatus;
                const prevStatus = typeof prevStatusCandidate3 === 'string' ? prevStatusCandidate3 : undefined;
                await notifier.sendMatterUpdateNotification({
                  type: 'matter_update',
                  practiceConfig: practice,
                  matterInfo: { type: 'Lead' },
                  update: {
                    action: 'status_change',
                    fromStatus: prevStatus,
                    toStatus: result.status,
                    actorId: authContext.user.id
                  }
                });
              } catch (error) { void error; }

              return createSuccessResponse(result);
            }

            throw HttpErrors.methodNotAllowed('Unsupported matter action');
          }

          if (request.method !== 'GET') {
            throw HttpErrors.methodNotAllowed('Unsupported method for matters workspace endpoint');
          }

          const statusFilterRaw = url.searchParams.get('status');
          const statusFilter = statusFilterRaw ? normalizeMatterStatus(statusFilterRaw) : null;
          const searchTerm = url.searchParams.get('q');
          const limitWithBuffer = limit;
          const cursorParam = url.searchParams.get('cursor');

          const cursor = cursorParam ? decodeMattersCursor(cursorParam) : null;

          const conditions: string[] = ['practice_id = ?'];
          const bindings: unknown[] = [practice.id];

          if (statusFilter) {
            conditions.push('status = ?');
            bindings.push(statusFilter);
          }

          if (searchTerm && searchTerm.trim().length > 0) {
            const likeValue = `%${searchTerm.trim().toLowerCase()}%`;
            conditions.push('(LOWER(title) LIKE ? OR LOWER(client_name) LIKE ?)');
            bindings.push(likeValue, likeValue);
          }

          if (cursor) {
            conditions.push('(created_at < ? OR (created_at = ? AND id < ?))');
            bindings.push(cursor.createdAt, cursor.createdAt, cursor.id);
          }

          const query = `
            SELECT id,
                   title,
                   matter_type as matterType,
                   status,
                   priority,
                   client_name as clientName,
                   lead_source as leadSource,
                   created_at as createdAt,
                   updated_at as updatedAt,
                   (
                     SELECT created_by_lawyer_id
                       FROM matter_events
                      WHERE matter_id = matters.id
                        AND event_type = 'accept'
                      ORDER BY event_date DESC
                      LIMIT 1
                   ) AS acceptedByUserId,
                   (
                     SELECT event_date
                       FROM matter_events
                      WHERE matter_id = matters.id
                        AND event_type = 'accept'
                      ORDER BY event_date DESC
                      LIMIT 1
                   ) AS acceptedAt
              FROM matters
             WHERE ${conditions.join(' AND ')}
             ORDER BY created_at DESC, id DESC
             LIMIT ?`;

          const results = await env.DB.prepare(query).bind(...bindings, limitWithBuffer + 1).all<WorkspaceMatterRow>();

          const rows = results.results ?? [];
          const hasMore = rows.length > limitWithBuffer;
          const slicedRows = hasMore ? rows.slice(0, limitWithBuffer) : rows;

          const items = slicedRows.map(row => ({
            id: row.id,
            title: row.title,
            matterType: row.matterType,
            status: row.status,
            priority: row.priority,
            clientName: row.clientName ?? null,
            leadSource: row.leadSource ?? null,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            acceptedBy: row.acceptedByUserId
              ? {
                  userId: row.acceptedByUserId,
                  acceptedAt: row.acceptedAt ?? null
                }
              : null
          }));

          const nextCursor = hasMore
            ? encodeMattersCursor({
                createdAt: slicedRows[slicedRows.length - 1].createdAt,
                id: slicedRows[slicedRows.length - 1].id
              })
            : null;

          return createSuccessResponse({
            items,
            matters: items,
            hasMore,
            nextCursor
          });
        }

        throw HttpErrors.notFound('Workspace resource not found');
      }
    }

    return new Response(JSON.stringify({
      success: false,
      error: 'Method not allowed'
    }), { 
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return handleError(error);
  }
}
