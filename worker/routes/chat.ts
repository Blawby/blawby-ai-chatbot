import { HttpErrors } from '../errorHandler.js';
import type { Env } from '../types.js';
import { ConversationService } from '../services/ConversationService.js';
import { optionalAuth } from '../middleware/auth.js';
import { withPracticeContext, getPracticeId } from '../middleware/practiceContext.js';

function createJsonResponse(data: unknown): Response {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function handleChat(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const segments = url.pathname.split('/').filter(Boolean);

  if (segments[0] !== 'api' || segments[1] !== 'chat') {
    throw HttpErrors.notFound('Chat route not found');
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
  // POST /api/chat/messages removed: all message writes go through ChatRoom DO.
  if (segments.length === 3 && segments[2] === 'messages' && request.method === 'POST') {
    return new Response(JSON.stringify({
      success: false,
      error: 'Message writes must use WebSocket (ChatRoom DO)',
      errorCode: 'CHAT_WRITE_REMOVED'
    }), {
      status: 410,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // GET /api/chat/messages - Get messages
  if (segments.length === 3 && segments[2] === 'messages' && request.method === 'GET') {
    const conversationId = url.searchParams.get('conversationId');
    
    if (!conversationId) {
      throw HttpErrors.badRequest('conversationId query parameter is required');
    }

    // Validate user has access to conversation
    await conversationService.validateParticipantAccess(conversationId, practiceId, userId);

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

    const result = await conversationService.getMessages(conversationId, practiceId, {
      limit,
      cursor,
      fromSeq
    });

    return createJsonResponse(result);
  }

  throw HttpErrors.methodNotAllowed('Unsupported method for chat endpoint');
}
