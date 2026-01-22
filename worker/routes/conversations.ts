import type { Request as WorkerRequest } from '@cloudflare/workers-types';
import { parseJsonBody } from '../utils.js';
import { HttpErrors } from '../errorHandler.js';
import type { Env } from '../types.js';
import { ConversationService } from '../services/ConversationService.js';
import { RemoteApiService } from '../services/RemoteApiService.js';
import { optionalAuth, requirePracticeMember, checkPracticeMembership } from '../middleware/auth.js';
import { withPracticeContext, getPracticeId } from '../middleware/practiceContext.js';
import { Logger } from '../utils/logger.js';
import { SessionAuditService } from '../services/SessionAuditService.js';

const looksLikeUuid = (value: string): boolean => (
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
);

const resolvePracticeIdForConversation = async (
  conversationService: ConversationService,
  conversationId: string,
  practiceId: string
): Promise<string> => {
  if (looksLikeUuid(practiceId)) {
    return practiceId;
  }
  const conversation = await conversationService.getConversationById(conversationId);
  return conversation.practice_id;
};

function createJsonResponse(data: unknown): Response {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function handleConversations(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const segments = url.pathname.split('/').filter(Boolean);
  const scope = url.searchParams.get('scope');
  const wantsAllScope = scope === 'all';

  if (segments[0] !== 'api' || segments[1] !== 'conversations') {
    throw HttpErrors.notFound('Conversation route not found');
  }

  // Support optional auth for anonymous users (Better Auth anonymous plugin)
  const authContext = await optionalAuth(request, env);
  if (!authContext) {
    throw HttpErrors.unauthorized('Authentication required - anonymous or authenticated session needed');
  }
  const userId = authContext.user.id;

  const conversationService = new ConversationService(env);

  if (segments.length === 4 && segments[3] === 'ws' && request.method === 'GET') {
    const conversationId = segments[2];
    const conversation = await conversationService.getConversationById(conversationId);
    if (authContext.isAnonymous) {
      await conversationService.validateParticipantAccess(conversationId, conversation.practice_id, userId);
    } else {
      const membership = await checkPracticeMembership(request, env, conversation.practice_id);
      if (!membership.isMember) {
        await conversationService.validateParticipantAccess(conversationId, conversation.practice_id, userId);
      }
    }
    const id = env.CHAT_ROOM.idFromName(conversationId);
    const stub = env.CHAT_ROOM.get(id);
    const wsUrl = new URL(request.url);
    wsUrl.pathname = `/ws/${conversationId}`;
    const wsRequest = new Request(wsUrl.toString(), request);
    return stub.fetch(wsRequest as unknown as WorkerRequest) as unknown as Response;
  }

  if (segments.length === 4 && segments[3] === 'ws') {
    throw HttpErrors.methodNotAllowed('Unsupported method for conversation WS endpoint');
  }

  // POST /api/conversations - Create new conversation
  if (segments.length === 2 && request.method === 'POST') {
    const requestWithContext = await withPracticeContext(request, env, {
      requirePractice: true,
      allowUrlOverride: true
    });
    const practiceId = getPracticeId(requestWithContext);

    const body = await parseJsonBody(request) as {
      matterId?: string;
      participantUserIds: string[];
      metadata?: Record<string, unknown>;
    };

    if (!Array.isArray(body.participantUserIds) || body.participantUserIds.length === 0) {
      throw HttpErrors.badRequest('participantUserIds must be a non-empty array');
    }

    // Check if anonymous user
    const isAnonymous = authContext.isAnonymous === true;
    
    // Ensure creator is included in participants
    const participants = Array.from(new Set([userId, ...body.participantUserIds]));

    const conversation = await conversationService.createConversation({
      practiceId,
      userId: isAnonymous ? null : userId, // Null user_id for anonymous users
      matterId: body.matterId || null,
      participantUserIds: participants,
      metadata: body.metadata
    }, request);

    return createJsonResponse(conversation);
  }

  // GET /api/conversations - Smart endpoint that detects user type
  if (segments.length === 2 && request.method === 'GET') {
    if (wantsAllScope) {
      if (authContext.isAnonymous) {
        throw HttpErrors.unauthorized('Sign in is required to list conversations');
      }

      const status = url.searchParams.get('status') as 'active' | 'archived' | 'closed' | null;
      const limit = parseInt(url.searchParams.get('limit') || '50', 10);
      const offset = parseInt(url.searchParams.get('offset') || '0', 10);

      const conversations = await conversationService.getConversationsForUser({
        userId,
        status: status || undefined,
        limit,
        offset
      });

      const practiceIds = Array.from(new Set(conversations.map((conversation) => conversation.practice_id)));
      const practiceEntries = await Promise.all(
        practiceIds.map(async (practiceId) => {
          try {
            const practice = await RemoteApiService.getPractice(env, practiceId, request);
            if (!practice) return null;
            return [practiceId, { id: practice.id, name: practice.name, slug: practice.slug }] as const;
          } catch (error) {
            Logger.warn('Failed to fetch practice info for conversation list', {
              practiceId,
              error: error instanceof Error ? error.message : String(error)
            });
            return null;
          }
        })
      );

      const practiceMap = new Map(
        practiceEntries.filter((entry): entry is Readonly<[string, { id: string; name: string; slug: string }]> => Boolean(entry))
      );

      const conversationsWithPractice = conversations.map((conversation) => ({
        ...conversation,
        practice: practiceMap.get(conversation.practice_id)
      }));

      return createJsonResponse({ conversations: conversationsWithPractice });
    }

    // Get practice context
    const requestWithContext = await withPracticeContext(request, env, {
      requirePractice: true,
      allowUrlOverride: true
    });
    const practiceId = getPracticeId(requestWithContext);

    // Check if anonymous user
    const isAnonymous = authContext.isAnonymous === true;

    const isPracticeWorkspace = looksLikeUuid(practiceId);

    if (isAnonymous) {
      // Anonymous user: Return single conversation (get-or-create)
      const conversation = await conversationService.getOrCreateCurrentConversation(
        userId,
        practiceId,
        request,
        isAnonymous
      );
      return createJsonResponse({ conversation }); // Single object
    }

    if (isPracticeWorkspace) {
      await requirePracticeMember(request, env, practiceId, 'paralegal');

      const status = url.searchParams.get('status') as 'active' | 'archived' | 'closed' | null;
      const limit = parseInt(url.searchParams.get('limit') || '50', 10);
      const offset = parseInt(url.searchParams.get('offset') || '0', 10);
      const sortBy = (url.searchParams.get('sortBy') || 'last_message_at') as 'last_message_at' | 'created_at' | 'priority';
      const sortOrder = (url.searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc';

      const conversations = await conversationService.getPracticeConversations({
        practiceId,
        userId,
        status: status || undefined,
        limit,
        offset,
        sortBy,
        sortOrder
      });

      return createJsonResponse({ conversations });
    }
    
    // Signed-in client: Return list of their conversations with this practice
    const matterId = url.searchParams.get('matterId');
    const status = url.searchParams.get('status') as 'active' | 'archived' | 'closed' | null;
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    
    const conversations = await conversationService.getConversations({
      practiceId,
      matterId: matterId || null,
      userId, // Filter to conversations where user is a participant
      status: status || undefined,
      limit
    });
    
    return createJsonResponse({ conversations }); // Array wrapped in object
  }

  // GET /api/conversations/(active|current) - Get or create current conversation
  if (segments.length === 3 && (segments[2] === 'active' || segments[2] === 'current') && request.method === 'GET') {
    const requestWithContext = await withPracticeContext(request, env, {
      requirePractice: true,
      allowUrlOverride: true
    });
    const practiceId = getPracticeId(requestWithContext);
    const isLegacyPath = segments[2] === 'current';
    const isAnonymous = authContext.isAnonymous === true;
    const conversation = await conversationService.getOrCreateCurrentConversation(
      userId,
      practiceId,
      request,
      isAnonymous
    );
    const response = createJsonResponse({ conversation });
    if (isLegacyPath) {
      response.headers.set('Warning', '299 - "Deprecated path /api/conversations/current; use /api/conversations/active"');
    }
    return response;
  }

  // GET /api/conversations/:id - Get single conversation
  if (segments.length === 3 && request.method === 'GET') {
    const requestWithContext = await withPracticeContext(request, env, {
      requirePractice: true,
      allowUrlOverride: true
    });
    const conversationId = segments[2];
    const rawPracticeId = getPracticeId(requestWithContext);
    const practiceId = await resolvePracticeIdForConversation(
      conversationService,
      conversationId,
      rawPracticeId
    );

    // Validate user has access
    if (!authContext.isAnonymous && looksLikeUuid(rawPracticeId)) {
      await requirePracticeMember(request, env, practiceId, 'paralegal');
    } else {
      await conversationService.validateParticipantAccess(conversationId, practiceId, userId);
    }

    const conversation = await conversationService.getConversation(conversationId, practiceId);
    return createJsonResponse(conversation);
  }

  // PATCH /api/conversations/:id/link - Link anonymous conversation to authenticated user
  if (
    segments.length === 4 &&
    segments[3] === 'link' &&
    request.method === 'PATCH'
  ) {
    const requestWithContext = await withPracticeContext(request, env, {
      requirePractice: true,
      allowUrlOverride: true
    });
    const conversationId = segments[2];
    const practiceId = await resolvePracticeIdForConversation(
      conversationService,
      conversationId,
      getPracticeId(requestWithContext)
    );
    const body = await parseJsonBody(request) as { userId?: string | null };

    if (authContext.isAnonymous) {
      throw HttpErrors.unauthorized('Sign in is required to link a conversation');
    }

    const targetUserId = body.userId || userId;
    if (targetUserId !== userId) {
      throw HttpErrors.forbidden('Cannot link conversation to a different user');
    }

    // Validate user has access to the conversation
    await conversationService.validateParticipantAccess(conversationId, practiceId, userId);

    const conversation = await conversationService.linkConversationToUser(
      conversationId,
      practiceId,
      targetUserId
    );

    return createJsonResponse(conversation);
  }

  // PATCH /api/conversations/:id - Update conversation
  if (segments.length === 3 && segments[2] !== 'active' && segments[2] !== 'current' && request.method === 'PATCH') {
    const requestWithContext = await withPracticeContext(request, env, {
      requirePractice: true,
      allowUrlOverride: true
    });
    const conversationId = segments[2];
    const practiceId = await resolvePracticeIdForConversation(
      conversationService,
      conversationId,
      getPracticeId(requestWithContext)
    );
    const body = await parseJsonBody(request) as {
      status?: 'active' | 'archived' | 'closed';
      metadata?: Record<string, unknown>;
    };

    // Validate user has access
    await conversationService.validateParticipantAccess(conversationId, practiceId, userId);

    const conversation = await conversationService.updateConversation(
      conversationId,
      practiceId,
      {
        status: body.status,
        metadata: body.metadata
      }
    );

    return createJsonResponse(conversation);
  }

  // POST /api/conversations/:id/audit - Log conversation audit events
  if (segments.length === 4 && segments[3] === 'audit' && request.method === 'POST') {
    const requestWithContext = await withPracticeContext(request, env, {
      requirePractice: true,
      allowUrlOverride: true
    });
    const conversationId = segments[2];
    const practiceId = await resolvePracticeIdForConversation(
      conversationService,
      conversationId,
      getPracticeId(requestWithContext)
    );
    const body = await parseJsonBody(request) as {
      eventType?: string;
      payload?: Record<string, unknown>;
    };

    if (!body.eventType || typeof body.eventType !== 'string') {
      throw HttpErrors.badRequest('eventType is required');
    }

    await conversationService.validateParticipantAccess(conversationId, practiceId, userId);

    const auditService = new SessionAuditService(env);
    await auditService.createEvent({
      conversationId,
      practiceId,
      eventType: body.eventType,
      actorType: 'user',
      actorId: userId,
      payload: body.payload ?? null
    });

    return createJsonResponse({ logged: true });
  }

  // POST /api/conversations/:id/participants - Add participants to a conversation
  if (segments.length === 4 && segments[3] === 'participants' && request.method === 'POST') {
    const requestWithContext = await withPracticeContext(request, env, {
      requirePractice: true,
      allowUrlOverride: true
    });
    const conversationId = segments[2];
    const practiceId = await resolvePracticeIdForConversation(
      conversationService,
      conversationId,
      getPracticeId(requestWithContext)
    );
    const body = await parseJsonBody(request) as {
      participantUserIds: string[];
    };

    if (!Array.isArray(body.participantUserIds) || body.participantUserIds.length === 0) {
      throw HttpErrors.badRequest('participantUserIds must be a non-empty array');
    }

    // Validate user has access before allowing them to add others
    await conversationService.validateParticipantAccess(conversationId, practiceId, userId);

    const conversation = await conversationService.addParticipants(
      conversationId,
      practiceId,
      body.participantUserIds
    );

    return createJsonResponse(conversation);
  }

  throw HttpErrors.methodNotAllowed('Unsupported method for conversations endpoint');
}
