import { parseJsonBody } from '../utils.js';
import { HttpErrors } from '../errorHandler.js';
import type { Env } from '../types.js';
import { ConversationService } from '../services/ConversationService.js';
import { optionalAuth, checkPracticeMembership } from '../middleware/auth.js';
import { withPracticeContext, getPracticeId } from '../middleware/practiceContext.js';

function createJsonResponse(data: unknown): Response {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function handleConversations(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const segments = url.pathname.split('/').filter(Boolean);

  if (segments[0] !== 'api' || segments[1] !== 'conversations') {
    throw HttpErrors.notFound('Conversation route not found');
  }

  // Support optional auth for anonymous users (Better Auth anonymous plugin)
  const authContext = await optionalAuth(request, env);
  if (!authContext) {
    throw HttpErrors.unauthorized("Authentication required - anonymous or authenticated session needed");
  }
  const userId = authContext.user.id;

  // Get practice context
  const requestWithContext = await withPracticeContext(request, env, {
    requirePractice: true,
    allowUrlOverride: true
  });
  const practiceId = getPracticeId(requestWithContext);

  const conversationService = new ConversationService(env);

  // POST /api/conversations - Create new conversation
  if (segments.length === 2 && request.method === 'POST') {
    const body = await parseJsonBody(request) as {
      matterId?: string;
      participantUserIds: string[];
      metadata?: Record<string, unknown>;
    };

    if (!Array.isArray(body.participantUserIds) || body.participantUserIds.length === 0) {
      throw HttpErrors.badRequest('participantUserIds must be a non-empty array');
    }

    // Ensure creator is included in participants
    const participants = Array.from(new Set([userId, ...body.participantUserIds]));

    const conversation = await conversationService.createConversation({
      practiceId,
      userId,
      matterId: body.matterId || null,
      participantUserIds: participants,
      metadata: body.metadata
    });

    return createJsonResponse(conversation);
  }

  // GET /api/conversations - Smart endpoint that detects user type
  if (segments.length === 2 && request.method === 'GET') {
    // Check if user is practice member
    const membershipCheck = await checkPracticeMembership(request, env, practiceId);
    
    if (membershipCheck.isMember) {
      // Practice member: Redirect to inbox endpoint
      const inboxUrl = new URL(request.url);
      inboxUrl.pathname = '/api/inbox/conversations';
      return Response.redirect(inboxUrl.toString(), 302);
    }
    
    // Check if anonymous user
    const isAnonymous = authContext.isAnonymous === true;
    
    if (isAnonymous) {
      // Anonymous user: Return single conversation (get-or-create)
      const conversation = await conversationService.getOrCreateCurrentConversation(
        userId,
        practiceId,
        request
      );
      return createJsonResponse({ conversation }); // Single object
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

  // GET /api/conversations/current - Get or create current conversation
  if (segments.length === 3 && segments[2] === 'current' && request.method === 'GET') {
    const conversation = await conversationService.getOrCreateCurrentConversation(
      userId,
      practiceId,
      request
    );
    return createJsonResponse({ conversation });
  }

  // GET /api/conversations/:id - Get single conversation
  if (segments.length === 3 && request.method === 'GET') {
    const conversationId = segments[2];

    // Validate user has access
    await conversationService.validateParticipantAccess(conversationId, practiceId, userId);

    const conversation = await conversationService.getConversation(conversationId, practiceId);
    return createJsonResponse(conversation);
  }

  // PATCH /api/conversations/:id - Update conversation
  if (segments.length === 3 && segments[2] !== 'current' && request.method === 'PATCH') {
    const conversationId = segments[2];
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

  throw HttpErrors.methodNotAllowed('Unsupported method for conversations endpoint');
}

