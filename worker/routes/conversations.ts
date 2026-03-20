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
  const prevAnonId = authContext.previousAnonUserId ?? null;

  const conversationService = new ConversationService(env);

  // GET /api/conversations/:id/messages - Get messages for a conversation
  if (segments.length === 4 && segments[3] === 'messages' && request.method === 'GET') {
    const requestWithContext = await withPracticeContext(request, env, {
      requirePractice: true,
      authContext,
    });
    const conversationId = segments[2];
    const conversationPracticeId = getPracticeId(requestWithContext);

    if (authContext.isAnonymous) {
      await conversationService.validateParticipantAccess(conversationId, conversationPracticeId, userId, { previousAnonUserId: prevAnonId });
    } else {
      const membership = await checkPracticeMembership(request, env, conversationPracticeId, { authContext });
      if (!isStaffMemberRole(membership.memberRole)) {
        await conversationService.validateParticipantAccess(conversationId, conversationPracticeId, userId, { previousAnonUserId: prevAnonId });
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
      await conversationService.validateParticipantAccess(conversationId, conversationPracticeId, userId, { previousAnonUserId: prevAnonId });
    } else {
      const membership = await checkPracticeMembership(request, env, conversationPracticeId, { authContext });
      if (!isStaffMemberRole(membership.memberRole)) {
        await conversationService.validateParticipantAccess(conversationId, conversationPracticeId, userId, { previousAnonUserId: prevAnonId });
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
      await conversationService.validateParticipantAccess(conversationId, practiceId, userId, { previousAnonUserId: prevAnonId });
    } else {
      const membership = await checkPracticeMembership(request, env, practiceId, { authContext });
      isMember = membership.isMember;
      if (isStaffMemberRole(membership.memberRole)) {
        await requirePracticeMember(request, env, practiceId, 'paralegal');
      } else {
        await conversationService.validateParticipantAccess(conversationId, practiceId, userId, { previousAnonUserId: prevAnonId });
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

    const participantUserIds = Array.isArray(body.participantUserIds) ? body.participantUserIds : [];

    // Check if anonymous user
    const isAnonymous = authContext.isAnonymous === true;
    
    // Ensure creator is included in participants
    const participants = Array.from(new Set([userId, ...participantUserIds]));

    const conversation = await conversationService.createConversation({
      practiceId,
      userId,
      isAnonymous,
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
      const assignedTo = url.searchParams.get('assignedTo');
      const limit = parseInt(url.searchParams.get('limit') || '50', 10);
      const conversations = await conversationService.getConversations({
        practiceId,
        userId,
        bypassParticipantFilter: true,
        status: status || undefined,
        assignedTo: assignedTo === 'none' ? 'none' : undefined,
        limit
      });
      return createJsonResponse({ conversations });
    }
    
    // Signed-in client: Return list of their conversations with this practice
    const matterId = url.searchParams.get('matterId');
    const status = url.searchParams.get('status') as 'active' | 'archived' | 'closed' | null;
    const assignedTo = url.searchParams.get('assignedTo');
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    
    const conversations = await conversationService.getConversations({
      practiceId,
      matterId: matterId || null,
      userId, // Filter to conversations where user is a participant
      status: status || undefined,
      assignedTo: assignedTo === 'none' ? 'none' : undefined,
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
      await conversationService.validateParticipantAccess(conversationId, practiceId, userId, { previousAnonUserId: prevAnonId });
    } else {
      const membership = await checkPracticeMembership(request, env, practiceId, { authContext });
      if (isStaffMemberRole(membership.memberRole)) {
        await requirePracticeMember(request, env, practiceId, 'paralegal');
      } else {
        await conversationService.validateParticipantAccess(conversationId, practiceId, userId, { previousAnonUserId: prevAnonId });
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

  // POST/DELETE /api/conversations/:id/tags - Add/remove conversation tags
  if (segments.length === 4 && segments[3] === 'tags' && (request.method === 'POST' || request.method === 'DELETE')) {
    const requestWithContext = await withPracticeContext(request, env, {
      requirePractice: true,
      authContext
    });
    const conversationId = segments[2];
    const practiceId = getPracticeId(requestWithContext);

    if (authContext.isAnonymous) {
      throw HttpErrors.unauthorized('Authentication required');
    }
    await requirePracticeMember(request, env, practiceId, 'paralegal');

    const body = await parseJsonBody(request) as { tag?: string };
    if (typeof body.tag !== 'string' || body.tag.trim().length === 0) {
      throw HttpErrors.badRequest('tag is required');
    }

    const conversation = request.method === 'POST'
      ? await conversationService.addConversationTag(conversationId, practiceId, body.tag)
      : await conversationService.removeConversationTag(conversationId, practiceId, body.tag);

    return createJsonResponse(conversation);
  }

  // PATCH /api/conversations/:id/mentions - Set mention user IDs on conversation metadata
  if (segments.length === 4 && segments[3] === 'mentions' && request.method === 'PATCH') {
    const requestWithContext = await withPracticeContext(request, env, {
      requirePractice: true,
      authContext
    });
    const conversationId = segments[2];
    const practiceId = getPracticeId(requestWithContext);
    const body = await parseJsonBody(request) as { mentionedUserIds?: string[] };

    if (authContext.isAnonymous) {
      throw HttpErrors.unauthorized('Authentication required');
    }
    await requirePracticeMember(request, env, practiceId, 'paralegal');

    if (!Array.isArray(body.mentionedUserIds)) {
      throw HttpErrors.badRequest('mentionedUserIds must be an array');
    }

    // Validate each element is a non-empty string and sanitize
    const sanitizedMentionedUserIds: string[] = [];
    for (let i = 0; i < body.mentionedUserIds.length; i++) {
      const el = body.mentionedUserIds[i];
      if (typeof el !== 'string' || el.trim().length === 0) {
        throw HttpErrors.badRequest(`mentionedUserIds contains invalid element at index ${i}: must be a non-empty string`);
      }
      sanitizedMentionedUserIds.push(el.trim());
    }

    const conversation = await conversationService.setConversationMentions(
      conversationId,
      practiceId,
      sanitizedMentionedUserIds,
      { request }
    );

    return createJsonResponse(conversation);
  }

  // PATCH /api/conversations/:id/link - Link anonymous conversation to authenticated user
  if (
    segments.length === 4 &&
    segments[3] === 'link' &&
    request.method === 'PATCH'
  ) {
    const conversationId = segments[2];
    const linkTraceId = `link-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

    Logger.info('[Conversations][link] request received', {
      traceId: linkTraceId,
      conversationId,
      userId,
      isAnonymous: authContext.isAnonymous,
      activeOrganizationId: authContext.activeOrganizationId ?? null,
      previousAnonUserId: authContext.previousAnonUserId ?? null,
      urlPracticeId: url.searchParams.get('practiceId'),
    });

    // Allow the practiceId from the URL query param even for authenticated users so
    // that the public widget's anon→auth handoff can reference the original practice.
    // This is safe because the conversation itself is gated by practiceId match in D1.
    const requestWithContext = await withPracticeContext(request, env, {
      requirePractice: true,
      authContext,
      allowAuthenticatedUrlPracticeId: true,
    });
    const practiceId = getPracticeId(requestWithContext);

    Logger.info('[Conversations][link] practice context resolved', {
      traceId: linkTraceId,
      practiceId,
      contextSource: (requestWithContext as { practiceContext?: { source?: string } }).practiceContext?.source ?? 'unknown',
    });

    const contentLength = request.headers.get('content-length');
    const linkBody = (contentLength && Number(contentLength) > 0)
      ? await parseJsonBody(request) as { previousParticipantId?: string; anonymousSessionId?: string }
      : null;
    const requestedPreviousParticipantId = typeof linkBody?.previousParticipantId === 'string'
      ? linkBody.previousParticipantId.trim()
      : null;
    const requestedAnonymousSessionId = typeof linkBody?.anonymousSessionId === 'string'
      ? linkBody.anonymousSessionId.trim()
      : null;

    if (authContext.isAnonymous) {
      Logger.warn('[Conversations][link] rejected: caller is still anonymous', {
        traceId: linkTraceId,
        reason: 'caller_is_anonymous',
        userId,
      });
      throw HttpErrors.unauthorized('Sign in is required to link a conversation');
    }

    let conversation;
    try {
      conversation = await conversationService.getConversation(conversationId, practiceId);
    } catch (lookupError) {
      Logger.warn('[Conversations][link] conversation lookup failed', {
        traceId: linkTraceId,
        reason: 'conversation_not_found',
        conversationId,
        practiceId,
        error: lookupError instanceof Error ? lookupError.message : String(lookupError),
      });
      throw lookupError;
    }

    if (conversation.user_id === userId) {
      Logger.info('[Conversations][link] already owned by caller, returning early', {
        traceId: linkTraceId,
        conversationId,
        userId,
      });
      return createJsonResponse(conversation);
    }

    const conversationMetadata =
      conversation.user_info && typeof conversation.user_info === 'object'
        ? conversation.user_info as Record<string, unknown>
        : null;
    const metadataAnonParticipantId =
      typeof conversationMetadata?.anonParticipantId === 'string'
        ? conversationMetadata.anonParticipantId
        : typeof conversationMetadata?.anon_participant_id === 'string'
          ? conversationMetadata.anon_participant_id
          : null;
    const inferredAnonOwnerId =
      conversation.is_anonymous &&
      typeof conversation.user_id === 'string' &&
      conversation.user_id.trim().length > 0
        ? conversation.user_id
        : null;
    const serverPreviousAnonUserId = authContext.previousAnonUserId ?? null;
    const previousParticipantMatchesAuthContext =
      !requestedPreviousParticipantId ||
      (serverPreviousAnonUserId !== null && requestedPreviousParticipantId === serverPreviousAnonUserId);
    const anonymousSessionMatchesAuthContext =
      !requestedAnonymousSessionId ||
      requestedAnonymousSessionId === authContext.session.id;

    if (!previousParticipantMatchesAuthContext || !anonymousSessionMatchesAuthContext) {
      Logger.warn('[Conversations][link] rejected: client-provided prior anon identity did not match authenticated context', {
        traceId: linkTraceId,
        conversationId,
        practiceId,
        userId,
        requestedPreviousParticipantId: requestedPreviousParticipantId ?? null,
        serverPreviousAnonUserId,
        hasRequestedAnonymousSession: Boolean(requestedAnonymousSessionId),
        hasAuthSession: Boolean(authContext?.session?.id),
      });
      throw HttpErrors.conflict('Unable to verify previous anonymous identity for link');
    }

    const hasValidatedPriorAnonIdentity = Boolean(serverPreviousAnonUserId);

    if (!hasValidatedPriorAnonIdentity) {
      Logger.warn('[Conversations][link] rejected: prior anonymous ownership was not server-validated', {
        traceId: linkTraceId,
        conversationId,
        practiceId,
        userId,
        hasMetadataAnonParticipantId: Boolean(metadataAnonParticipantId),
        hasInferredAnonOwnerId: Boolean(inferredAnonOwnerId),
      });
      throw HttpErrors.conflict('Unable to verify previous anonymous identity for link');
    }

    Logger.info('[Conversations][link] attempting linkConversationToUser', {
      traceId: linkTraceId,
      conversationId,
      practiceId,
      userId,
      previousAnonUserId: serverPreviousAnonUserId,
      conversationOwnerId: conversation.user_id ?? null,
      isConversationAnonymous: conversation.is_anonymous ?? null,
    });

    try {
      const linkedConversation = await conversationService.linkConversationToUser(
        conversationId,
        practiceId,
        userId,
        {
          previousParticipantId: serverPreviousAnonUserId
        }
      );
      Logger.info('[Conversations][link] link succeeded', {
        traceId: linkTraceId,
        conversationId,
        practiceId,
        userId,
      });
      return createJsonResponse(linkedConversation);
    } catch (error) {
      if (error instanceof HttpError && error.status === 409) {
        if (!hasValidatedPriorAnonIdentity) {
          Logger.warn('[Conversations][link] conflict (409) but prior anon ownership was not validated; refusing participant add', {
            traceId: linkTraceId,
            conversationId,
            practiceId,
            userId,
            serverPreviousAnonUserId,
          });
          throw HttpErrors.conflict('Conversation already linked and prior anonymous ownership could not be validated');
        }
        Logger.info('[Conversations][link] link conflict (409), adding participant after validated prior anon ownership', {
          traceId: linkTraceId,
          conversationId,
          practiceId,
          userId,
          serverPreviousAnonUserId,
        });
        try {
          await conversationService.addParticipant(conversationId, practiceId, userId);
        } catch (participantError) {
          Logger.warn('[Conversations][link] addParticipant after 409 failed', {
            traceId: linkTraceId,
            conversationId,
            practiceId,
            userId,
            error: participantError instanceof Error ? participantError.message : String(participantError)
          });
          throw participantError;
        }
        const refreshedConversation = await conversationService.getConversation(conversationId, practiceId);
        return createJsonResponse(refreshedConversation);
      }
      Logger.warn('[Conversations][link] linkConversationToUser threw non-409 error', {
        traceId: linkTraceId,
        conversationId,
        practiceId,
        userId,
        errorStatus: error instanceof HttpError ? error.status : null,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
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
      assignedTo?: string | null;
      priority?: 'low' | 'normal' | 'high' | 'urgent';
      internalNotes?: string | null;
    };

    const isTriageUpdate = body.assignedTo !== undefined
      || body.priority !== undefined
      || body.internalNotes !== undefined;

    if (isTriageUpdate) {
      if (body.assignedTo !== undefined && body.assignedTo !== null && typeof body.assignedTo !== 'string') {
        throw HttpErrors.badRequest('assignedTo must be a string or null');
      }
      if (body.internalNotes !== undefined && body.internalNotes !== null && typeof body.internalNotes !== 'string') {
        throw HttpErrors.badRequest('internalNotes must be a string or null');
      }

      if (authContext.isAnonymous) {
        throw HttpErrors.unauthorized('Authentication required');
      }
      await requirePracticeMember(request, env, practiceId, 'paralegal');
    } else {
      if (body.metadata && 'mentionedUserIds' in body.metadata) {
        delete body.metadata.mentionedUserIds;
      }
      if (authContext.isAnonymous) {
        await conversationService.validateParticipantAccess(conversationId, practiceId, userId, { previousAnonUserId: prevAnonId });
      } else {
        const membership = await checkPracticeMembership(request, env, practiceId, { authContext });
        if (!isStaffMemberRole(membership.memberRole)) {
          await conversationService.validateParticipantAccess(conversationId, practiceId, userId, { previousAnonUserId: prevAnonId });
        }
      }
    }

    if (body.priority !== undefined) {
      const allowed = new Set(['low', 'normal', 'high', 'urgent']);
      if (!allowed.has(body.priority)) {
        throw HttpErrors.badRequest('priority must be one of: low, normal, high, urgent');
      }
    }

    const conversation = await conversationService.updateConversation(
      conversationId,
      practiceId,
      {
        status: body.status,
        metadata: body.metadata,
        assignedTo: body.assignedTo,
        priority: body.priority,
        internalNotes: body.internalNotes
      },
      { request }
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

    await conversationService.validateParticipantAccess(conversationId, practiceId, userId, { previousAnonUserId: prevAnonId });

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

  // GET /api/conversations/:id/participants - Get participant profiles for a conversation
  if (segments.length === 4 && segments[3] === 'participants' && request.method === 'GET') {
    const requestWithContext = await withPracticeContext(request, env, {
      requirePractice: true,
      authContext
    });
    const conversationId = segments[2];
    const practiceId = getPracticeId(requestWithContext);

    // Allow if caller is either a participant OR a staff practice member.
    let hasAccess = false;
    try {
      await conversationService.validateParticipantAccess(conversationId, practiceId, userId, { previousAnonUserId: prevAnonId });
      hasAccess = true;
    } catch (error) {
      if (!(error instanceof HttpError) || error.status !== 403) {
        throw error;
      }
    }
    let callerIsStaff = false;
    try {
      const membership = await checkPracticeMembership(request, env, practiceId, { authContext });
      callerIsStaff = isStaffMemberRole(membership.memberRole);
    } catch (error) {
      if (!(error instanceof HttpError) || error.status !== 403) {
        throw error;
      }
    }
    if (!hasAccess && !callerIsStaff) {
      throw HttpErrors.forbidden('User is not authorized to view participants for this conversation');
    }

    const [conversation, members] = await Promise.all([
      conversationService.getConversation(conversationId, practiceId),
      RemoteApiService.getPracticeMembers(env, practiceId, request)
    ]);

    const participantIds = Array.from(new Set([
      ...conversation.participants.filter((id) => typeof id === 'string' && id.trim().length > 0),
      ...(conversation.user_id ? [conversation.user_id] : [])
    ]));
    const staffMemberIds = members
      .filter((member) => member.role !== 'client')
      .map((member) => member.user_id)
      .filter((id) => typeof id === 'string' && id.trim().length > 0);
    const mentionableUserIds = callerIsStaff
      ? Array.from(new Set([
        ...participantIds,
        ...staffMemberIds
      ]))
      : participantIds;
    const memberById = new Map(members.map((member) => [member.user_id, member]));

    const participants = mentionableUserIds.map((participantUserId) => {
      const member = memberById.get(participantUserId);
      return {
        userId: participantUserId,
        role: member?.role ?? null,
        name: member?.name ?? null,
        image: member?.image ?? null,
      };
    });

    return createJsonResponse({
      conversationId,
      practiceId,
      participants
    });
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

    // Allow if caller is either a participant OR a staff practice member.
    let hasAccess = false;
    try {
      await conversationService.validateParticipantAccess(conversationId, practiceId, userId, { previousAnonUserId: prevAnonId });
      hasAccess = true;
    } catch (error) {
      if (!(error instanceof HttpError) || error.status !== 403) {
        throw error;
      }
    }
    if (!hasAccess) {
      const membership = await checkPracticeMembership(request, env, practiceId, { authContext });
      if (!isStaffMemberRole(membership.memberRole)) {
        throw HttpErrors.forbidden('User is not authorized to add participants to this conversation');
      }
    }

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
    // Pass the already-resolved authContext to avoid a second remote auth round-trip.
    return handleSubmitIntake(request, env, conversationId, authContext);
  }

  throw HttpErrors.methodNotAllowed('Unsupported method for conversations endpoint');
}
