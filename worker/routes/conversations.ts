import type { Request as WorkerRequest } from '@cloudflare/workers-types';
import { parseJsonBody } from '../utils.js';
import { HttpErrors } from '../errorHandler.js';
import { HttpError, type Env } from '../types.js';
import { ConversationService } from '../services/ConversationService.js';
import { RemoteApiService } from '../services/RemoteApiService.js';
import { optionalAuth, requirePracticeMember, checkPracticeMembership } from '../middleware/auth.js';
import type { AuthContext } from '../middleware/auth.js';
import { withPracticeContext, getPracticeId } from '../middleware/practiceContext.js';
import { Logger } from '../utils/logger.js';
import { SessionAuditService } from '../services/SessionAuditService.js';
import { handleSubmitIntake } from './submitIntake.js';

const SYSTEM_MESSAGE_ALLOWLIST = new Set([
  'system-intro',
  'system-ask-question-help',
  'system-intake-decision',
  'system-contact-form',
  'system-intake-contact-ack',
  'system-intake-opening',
  'system-submission-confirm',
  'system-lead-accepted',
  'system-lead-declined',
  'system-intake-submit'
]);

const isAllowedSystemMessageId = (clientId: string): boolean => {
  if (SYSTEM_MESSAGE_ALLOWLIST.has(clientId)) return true;
  return clientId.startsWith('system-payment-');
};

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
  memberRole?: string;
};

const STAFF_MEMBER_ROLES = new Set(['owner', 'admin', 'attorney', 'paralegal']);

const isStaffMemberRole = (role: string | undefined): boolean => {
  if (!role) return false;
  return STAFF_MEMBER_ROLES.has(role);
};

const resolvePracticeContext = async (options: {
  request: Request;
  env: Env;
  authContext: AuthContext | null;
}): Promise<PracticeContextResolution> => {
  const { request, env, authContext } = options;
  const requestWithContext = await withPracticeContext(request, env, {
    requirePractice: true,
    authContext: authContext ?? undefined
  });
  const practiceId = getPracticeId(requestWithContext);
  const isAnonymous = authContext?.isAnonymous === true;
  const membership = isAnonymous
    ? { isMember: false }
    : await checkPracticeMembership(request, env, practiceId, {
      authContext: authContext ?? undefined
    });

  return {
    practiceId,
    isMember: membership.isMember,
    memberRole: membership.memberRole
  };
};

function createJsonResponse(data: unknown, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...(headers ?? {}) }
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

  // WebSocket handoff: let the ChatRoom DO perform the single authoritative
  // auth + membership check for the connection to avoid duplicate validation
  // in this route and again in the DO.
  if (segments.length === 4 && segments[3] === 'ws' && request.method === 'GET') {
    const conversationId = segments[2];
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

  // Support optional auth for anonymous users (Better Auth anonymous plugin)
  const authContext = await optionalAuth(request, env);
  if (!authContext) {
    throw HttpErrors.unauthorized('Authentication required - anonymous or authenticated session needed');
  }
  const userId = authContext.user.id;

  const conversationService = new ConversationService(env);

  // GET /api/conversations/:id/messages - Get messages for a conversation
  if (segments.length === 4 && segments[3] === 'messages' && request.method === 'GET') {
    const requestWithContext = await withPracticeContext(request, env, {
      requirePractice: true,
      authContext
    });
    const conversationId = segments[2];
    const conversationPracticeId = getPracticeId(requestWithContext);

    if (authContext.isAnonymous) {
      await conversationService.validateParticipantAccess(conversationId, conversationPracticeId, userId);
    } else {
      const membership = await checkPracticeMembership(request, env, conversationPracticeId, { authContext });
      if (!isStaffMemberRole(membership.memberRole)) {
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
    const requestSource = url.searchParams.get('source') || undefined;
    const traceId = `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
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

    Logger.info('[Conversations][messages] request', {
      traceId,
      routeConversationId: conversationId,
      routePracticeId: conversationPracticeId,
      limit,
      cursor: cursor ?? null,
      fromSeq: fromSeq ?? null,
      requestSource: requestSource ?? null
    });

    let result;
    try {
      result = await conversationService.getMessages(conversationId, conversationPracticeId, {
        limit,
        cursor,
        fromSeq,
        traceId,
        requestSource,
        viewerId: userId
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
      requirePractice: true,
      authContext
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
      const membership = await checkPracticeMembership(request, env, conversationPracticeId, { authContext });
      if (!isStaffMemberRole(membership.memberRole)) {
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
      requirePractice: true,
      authContext
    });
    const conversationId = segments[2];
    const practiceId = getPracticeId(requestWithContext);

    let isMember = false;
    if (authContext.isAnonymous) {
      await conversationService.validateParticipantAccess(conversationId, practiceId, userId);
    } else {
      const membership = await checkPracticeMembership(request, env, practiceId, { authContext });
      isMember = membership.isMember;
      if (isStaffMemberRole(membership.memberRole)) {
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
    if (!isAllowedSystemMessageId(rawClientId)) {
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

    if (practiceContext.isMember && isStaffMemberRole(practiceContext.memberRole)) {
      await requirePracticeMember(request, env, practiceId, 'paralegal');

      const status = url.searchParams.get('status') as 'active' | 'archived' | 'closed' | null;
      const limit = parseInt(url.searchParams.get('limit') || '50', 10);
      const conversations = await conversationService.getConversations({
        practiceId,
        userId,
        status: status || undefined,
        limit
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
      requirePractice: true,
      authContext
    });
    const conversationId = segments[2];
    const practiceId = getPracticeId(requestWithContext);

    // Validate user has access
    if (authContext.isAnonymous) {
      await conversationService.validateParticipantAccess(conversationId, practiceId, userId);
    } else {
      const membership = await checkPracticeMembership(request, env, practiceId, { authContext });
      if (isStaffMemberRole(membership.memberRole)) {
        await requirePracticeMember(request, env, practiceId, 'paralegal');
      } else {
        await conversationService.validateParticipantAccess(conversationId, practiceId, userId);
      }
    }

    const conversation = await conversationService.getConversation(conversationId, practiceId);
    return createJsonResponse(conversation);
  }

  // PATCH /api/conversations/:id/matter - Link or unlink a conversation to a matter
  if (segments.length === 4 && segments[3] === 'matter' && request.method === 'PATCH') {
    const requestWithContext = await withPracticeContext(request, env, {
      requirePractice: true,
      authContext
    });
    const conversationId = segments[2];
    const practiceId = getPracticeId(requestWithContext);
    const body = await parseJsonBody(request) as { matterId?: string | null };

    if (authContext.isAnonymous) {
      throw HttpErrors.unauthorized('Authentication required');
    }

    await requirePracticeMember(request, env, practiceId, 'paralegal');

    if (body.matterId === undefined) {
      throw HttpErrors.badRequest('matterId is required');
    }

    if (body.matterId !== null && typeof body.matterId !== 'string') {
      throw HttpErrors.badRequest('matterId must be a string or null');
    }

    const trimmedMatterId = typeof body.matterId === 'string'
      ? body.matterId.trim()
      : body.matterId;

    if (trimmedMatterId === '') {
      throw HttpErrors.badRequest('matterId cannot be empty or whitespace');
    }

    const conversation = trimmedMatterId === null
      ? await conversationService.detachMatter(conversationId, practiceId)
      : await conversationService.attachMatter(conversationId, practiceId, trimmedMatterId);

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
      authContext
    });
    const conversationId = segments[2];
    const practiceId = getPracticeId(requestWithContext);
    const body = await parseJsonBody(request) as {
      userId?: string | null;
      anonymousSessionId?: string | null;
      previousParticipantId?: string | null;
    };

    if (authContext.isAnonymous) {
      throw HttpErrors.unauthorized('Sign in is required to link a conversation');
    }

    const targetUserId = body.userId || userId;
    if (targetUserId !== userId) {
      throw HttpErrors.forbidden('Cannot link conversation to a different user');
    }

    // Allow authenticated users to claim anonymous conversations on first load.
    // This supports direct refresh on /public/:slug/conversations/:id after auth.
    // Require explict ownership proof before allowing claim.
    try {
      await conversationService.validateParticipantAccess(conversationId, practiceId, userId);
    } catch (error) {
      if (!(error instanceof HttpError) || error.status !== 403) {
        throw error;
      }
      const conversation = await conversationService.getConversation(conversationId, practiceId);
      if (conversation.user_id) {
        throw error;
      }

      const participants = Array.isArray(conversation.participants) ? conversation.participants : [];
      const hasPreviousParticipantProof =
        typeof body.previousParticipantId === 'string' &&
        participants.includes(body.previousParticipantId);

      if (!hasPreviousParticipantProof) {
        const conversationAnonymousSessionId =
          (conversation as { anonymous_session_id?: string | null }).anonymous_session_id;
        if (!body.anonymousSessionId || body.anonymousSessionId !== conversationAnonymousSessionId) {
          throw error;
        }
      }
    }

    const conversation = await conversationService.linkConversationToUser(
      conversationId,
      practiceId,
      targetUserId,
      {
        previousParticipantId:
          typeof body.previousParticipantId === 'string' ? body.previousParticipantId : null,
      }
    );

    return createJsonResponse(conversation);
  }

  // PATCH /api/conversations/:id - Update conversation
  if (segments.length === 3 && segments[2] !== 'active' && segments[2] !== 'current' && request.method === 'PATCH') {
    const requestWithContext = await withPracticeContext(request, env, {
      requirePractice: true,
      authContext
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
      requirePractice: true,
      authContext
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
      requirePractice: true,
      authContext
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

  // POST /api/conversations/:id/submit-intake
  // Submission bridge: maps D1 conversation metadata -> backend client-intakes/create
  if (segments.length === 4 && segments[3] === 'submit-intake' && request.method === 'POST') {
    const conversationId = segments[2];
    return handleSubmitIntake(request, env, conversationId);
  }

  throw HttpErrors.methodNotAllowed('Unsupported method for conversations endpoint');
}
