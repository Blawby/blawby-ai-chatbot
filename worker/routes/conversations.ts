import type { Request as WorkerRequest } from '@cloudflare/workers-types';
import { parseJsonBody } from '../utils.js';
import { HttpErrors } from '../errorHandler.js';
import type { Env } from '../types.js';
import { ConversationService, type Conversation } from '../services/ConversationService.js';
import { RemoteApiService } from '../services/RemoteApiService.js';
import { optionalAuth, requirePracticeMember, checkPracticeMembership } from '../middleware/auth.js';
import { withPracticeContext, getPracticeId } from '../middleware/practiceContext.js';
import { Logger } from '../utils/logger.js';
import { SessionAuditService } from '../services/SessionAuditService.js';

const SYSTEM_MESSAGE_ALLOWLIST = new Set([
  'system-intro',
  'system-ask-question-help',
  'system-contact-form',
  'system-submission-confirm',
  'system-lead-accepted',
  'system-lead-declined'
]);

const isValidContactFormMetadata = (metadata: Record<string, unknown> | null | undefined): boolean => {
  if (!metadata) return false;
  const contactForm = metadata.contactForm as { fields?: unknown; required?: unknown } | undefined;
  if (!contactForm || typeof contactForm !== 'object') return false;
  if (!Array.isArray(contactForm.fields) || !Array.isArray(contactForm.required)) return false;
  return contactForm.fields.every((field) => typeof field === 'string')
    && contactForm.required.every((field) => typeof field === 'string');
};

type PracticeContextResolution = {
  practiceId: string;
  isMember: boolean;
};

const resolvePracticeContext = async (options: {
  request: Request;
  env: Env;
  authContext: { isAnonymous?: boolean } | null;
}): Promise<PracticeContextResolution> => {
  const { request, env, authContext } = options;
  const requestWithContext = await withPracticeContext(request, env, {
    requirePractice: true
  });
  const practiceId = getPracticeId(requestWithContext);
  const isAnonymous = authContext?.isAnonymous === true;
  const membership = isAnonymous
    ? { isMember: false }
    : await checkPracticeMembership(request, env, practiceId);

  return {
    practiceId,
    isMember: membership.isMember
  };
};

function createJsonResponse(data: unknown, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...(headers ?? {}) }
  });
}

const annotateLeadConversations = async (
  env: Env,
  practiceId: string,
  conversations: Conversation[]
): Promise<Conversation[]> => {
  const matterIds = conversations
    .map((conversation) => conversation.matter_id)
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

  if (matterIds.length === 0) {
    return conversations;
  }

  const placeholders = matterIds.map(() => '?').join(', ');
  const query = `
    SELECT id, status, lead_source as leadSource, created_at as createdAt
      FROM matters
     WHERE practice_id = ?
       AND id IN (${placeholders})
  `;
  const results = await env.DB.prepare(query)
    .bind(practiceId, ...matterIds)
    .all<{ id: string; status: string; leadSource?: string | null; createdAt?: string | null }>();

  const leadMap = new Map(results.results?.map((row) => [row.id, row]) ?? []);

  return conversations.map((conversation) => {
    const matterId = conversation.matter_id ?? null;
    const record = matterId ? leadMap.get(matterId) : null;
    if (!record || record.status !== 'lead') {
      return conversation;
    }
    return {
      ...conversation,
      lead: {
        isLead: true,
        leadId: record.id,
        matterId: record.id,
        leadSource: record.leadSource ?? null,
        createdAt: record.createdAt ?? null
      }
    };
  });
};

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
    const wsRequest = new Request(wsUrl.toString(), {
      method: request.method,
      headers: request.headers,
      cf: request.cf
    });
    return stub.fetch(wsRequest as unknown as WorkerRequest) as unknown as Response;
  }

  if (segments.length === 4 && segments[3] === 'ws') {
    throw HttpErrors.methodNotAllowed('Unsupported method for conversation WS endpoint');
  }

  // GET /api/conversations/:id/messages - Get messages for a conversation
  if (segments.length === 4 && segments[3] === 'messages' && request.method === 'GET') {
    const requestWithContext = await withPracticeContext(request, env, {
      requirePractice: true
    });
    const conversationId = segments[2];
    const conversationPracticeId = getPracticeId(requestWithContext);

    if (authContext.isAnonymous) {
      await conversationService.validateParticipantAccess(conversationId, conversationPracticeId, userId);
    } else {
      const membership = await checkPracticeMembership(request, env, conversationPracticeId);
      if (!membership.isMember) {
        await conversationService.validateParticipantAccess(conversationId, conversationPracticeId, userId);
      }
    }

    if (url.searchParams.has('since')) {
      throw HttpErrors.badRequest('since is no longer supported; use from_seq');
    }

    const limitParam = url.searchParams.get('limit');
    const limit = parseInt(limitParam || '50', 10);
    if (Number.isNaN(limit) || limit < 1) {
      throw HttpErrors.badRequest('limit must be a positive integer');
    }
    const cursor = url.searchParams.get('cursor') || undefined;
    const fromSeqParam = url.searchParams.get('from_seq');
    const fromSeq = fromSeqParam !== null ? parseInt(fromSeqParam, 10) : undefined;

    if (fromSeqParam !== null) {
      if (!limitParam) {
        throw HttpErrors.badRequest('limit is required when using from_seq');
      }
      if (Number.isNaN(fromSeq) || fromSeq < 0) {
        throw HttpErrors.badRequest('from_seq must be a non-negative integer');
      }
    }

    let result;
    try {
      result = await conversationService.getMessages(conversationId, conversationPracticeId, {
        limit,
        cursor,
        fromSeq
      });
    } catch (error) {
      Logger.warn('[Conversations] Failed to fetch messages', {
        conversationId,
        practiceId: conversationPracticeId,
        isAnonymous: authContext.isAnonymous,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }

    const responseHeaders = result.warning ? { 'X-Sequence-Warning': result.warning } : undefined;
    return createJsonResponse(result, responseHeaders);
  }

  // GET/POST/DELETE /api/conversations/:id/messages/:messageId/reactions
  if (segments.length === 6 && segments[3] === 'messages' && segments[5] === 'reactions') {
    const requestWithContext = await withPracticeContext(request, env, {
      requirePractice: true
    });
    const conversationId = segments[2];
    const messageId = segments[4];
    if (!messageId) {
      throw HttpErrors.badRequest('messageId is required');
    }

    const conversationPracticeId = getPracticeId(requestWithContext);

    if (authContext.isAnonymous) {
      await conversationService.validateParticipantAccess(conversationId, conversationPracticeId, userId);
    } else {
      const membership = await checkPracticeMembership(request, env, conversationPracticeId);
      if (!membership.isMember) {
        await conversationService.validateParticipantAccess(conversationId, conversationPracticeId, userId);
      }
    }

    if (request.method === 'GET') {
      const reactions = await conversationService.getMessageReactions({
        conversationId,
        practiceId: conversationPracticeId,
        messageId,
        viewerId: userId
      });
      return createJsonResponse(reactions);
    }

    if (request.method === 'POST') {
      const body = await parseJsonBody(request) as { emoji?: string };
      if (!body?.emoji || typeof body.emoji !== 'string') {
        throw HttpErrors.badRequest('emoji is required');
      }
      const reactions = await conversationService.addMessageReaction({
        conversationId,
        practiceId: conversationPracticeId,
        messageId,
        userId,
        emoji: body.emoji
      });
      return createJsonResponse(reactions);
    }

    if (request.method === 'DELETE') {
      const emojiParam = url.searchParams.get('emoji');
      let emoji = typeof emojiParam === 'string' && emojiParam.trim().length > 0 ? emojiParam : null;
      if (!emoji) {
        const contentLength = request.headers.get('content-length');
        if (contentLength && Number(contentLength) > 0) {
          const body = await parseJsonBody(request) as { emoji?: string };
          emoji = typeof body?.emoji === 'string' ? body.emoji : null;
        }
      }
      if (!emoji) {
        throw HttpErrors.badRequest('emoji is required');
      }
      const reactions = await conversationService.removeMessageReaction({
        conversationId,
        practiceId: conversationPracticeId,
        messageId,
        userId,
        emoji
      });
      return createJsonResponse(reactions);
    }

    throw HttpErrors.methodNotAllowed('Unsupported method for message reactions endpoint');
  }

  // POST /api/conversations/:id/system-messages - Persist system messages (intro/help/forms)
  if (segments.length === 4 && segments[3] === 'system-messages' && request.method === 'POST') {
    const requestWithContext = await withPracticeContext(request, env, {
      requirePractice: true
    });
    const conversationId = segments[2];
    const practiceId = getPracticeId(requestWithContext);

    let isMember = false;
    if (authContext.isAnonymous) {
      await conversationService.validateParticipantAccess(conversationId, practiceId, userId);
    } else {
      const membership = await checkPracticeMembership(request, env, practiceId);
      isMember = membership.isMember;
      if (membership.isMember) {
        await requirePracticeMember(request, env, practiceId, 'paralegal');
      } else {
        await conversationService.validateParticipantAccess(conversationId, practiceId, userId);
      }
    }

    const body = await parseJsonBody(request) as {
      clientId?: string;
      content?: string;
      metadata?: Record<string, unknown>;
    };

    const rawClientId = typeof body.clientId === 'string' ? body.clientId.trim() : '';
    if (!rawClientId) {
      throw HttpErrors.badRequest('clientId is required');
    }
    if (!SYSTEM_MESSAGE_ALLOWLIST.has(rawClientId)) {
      throw HttpErrors.badRequest('Unsupported system message id');
    }

    const content = typeof body.content === 'string' ? body.content.trim() : '';

    const metadata = (body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata))
      ? body.metadata as Record<string, unknown>
      : undefined;
    if (rawClientId === 'system-contact-form' && !isValidContactFormMetadata(metadata)) {
      throw HttpErrors.badRequest('contactForm metadata is required');
    }
    if (!content && rawClientId !== 'system-contact-form') {
      throw HttpErrors.badRequest('content is required');
    }

    const storedMessage = await conversationService.sendSystemMessage({
      conversationId,
      practiceId,
      content,
      metadata,
      clientId: rawClientId,
      allowEmptyContent: rawClientId === 'system-contact-form',
      skipPracticeValidation: !isMember,
      request
    });

    return createJsonResponse({ message: storedMessage });
  }

  // POST /api/conversations - Create new conversation
  if (segments.length === 2 && request.method === 'POST') {
    const practiceContext = await resolvePracticeContext({ request, env, authContext });
    const practiceId = practiceContext.practiceId;

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
      metadata: body.metadata,
      skipPracticeValidation: !practiceContext.isMember
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
    const practiceContext = await resolvePracticeContext({ request, env, authContext });
    const practiceId = practiceContext.practiceId;

    // Check if anonymous user
    const isAnonymous = authContext.isAnonymous === true;

    if (isAnonymous) {
      const listRequested = ['1', 'true'].includes(url.searchParams.get('list') || '');
      if (listRequested) {
        const status = url.searchParams.get('status') as 'active' | 'archived' | 'closed' | null;
        const limit = parseInt(url.searchParams.get('limit') || '50', 10);
        if (Number.isNaN(limit) || limit < 1) {
          throw HttpErrors.badRequest('limit must be a positive integer');
        }
        const conversations = await conversationService.getConversations({
          practiceId,
          userId,
          status: status || undefined,
          limit
        });
        return createJsonResponse({ conversations });
      }
      // Anonymous user: Return single conversation (get-or-create)
      const conversation = await conversationService.getOrCreateCurrentConversation(
        userId,
        practiceId,
        request,
        isAnonymous,
        { skipPracticeValidation: !practiceContext.isMember }
      );
      return createJsonResponse({ conversation }); // Single object
    }

    if (practiceContext.isMember) {
      await requirePracticeMember(request, env, practiceId, 'paralegal');

      const status = url.searchParams.get('status') as 'active' | 'archived' | 'closed' | null;
      const limit = parseInt(url.searchParams.get('limit') || '50', 10);
      const offset = parseInt(url.searchParams.get('offset') || '0', 10);
      const validSortBy = ['last_message_at', 'created_at', 'priority'] as const;
      const validSortOrder = ['asc', 'desc'] as const;
      const sortByParam = url.searchParams.get('sortBy') || 'last_message_at';
      const sortOrderParam = url.searchParams.get('sortOrder') || 'desc';
      const sortBy = validSortBy.includes(sortByParam as typeof validSortBy[number])
        ? (sortByParam as typeof validSortBy[number])
        : 'last_message_at';
      const sortOrder = validSortOrder.includes(sortOrderParam as typeof validSortOrder[number])
        ? (sortOrderParam as typeof validSortOrder[number])
        : 'desc';

      const conversations = await conversationService.getPracticeConversations({
        practiceId,
        userId,
        status: status || undefined,
        limit,
        offset,
        sortBy,
        sortOrder
      });

      const conversationsWithLead = await annotateLeadConversations(env, practiceId, conversations);

      return createJsonResponse({ conversations: conversationsWithLead });
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
    const practiceContext = await resolvePracticeContext({ request, env, authContext });
    const practiceId = practiceContext.practiceId;
    const isLegacyPath = segments[2] === 'current';
    const isAnonymous = authContext.isAnonymous === true;
    const conversation = await conversationService.getOrCreateCurrentConversation(
      userId,
      practiceId,
      request,
      isAnonymous,
      { skipPracticeValidation: !practiceContext.isMember }
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
      requirePractice: true
    });
    const conversationId = segments[2];
    const practiceId = getPracticeId(requestWithContext);

    // Validate user has access
    if (authContext.isAnonymous) {
      await conversationService.validateParticipantAccess(conversationId, practiceId, userId);
    } else {
      const membership = await checkPracticeMembership(request, env, practiceId);
      if (membership.isMember) {
        await requirePracticeMember(request, env, practiceId, 'paralegal');
      } else {
        await conversationService.validateParticipantAccess(conversationId, practiceId, userId);
      }
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
      requirePractice: true
    });
    const conversationId = segments[2];
    const practiceId = getPracticeId(requestWithContext);
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
      requirePractice: true
    });
    const conversationId = segments[2];
    const practiceId = getPracticeId(requestWithContext);
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
      requirePractice: true
    });
    const conversationId = segments[2];
    const practiceId = getPracticeId(requestWithContext);
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
      requirePractice: true
    });
    const conversationId = segments[2];
    const practiceId = getPracticeId(requestWithContext);
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
