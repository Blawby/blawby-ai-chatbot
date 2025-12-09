import { parseJsonBody } from '../utils.js';
import { HttpErrors } from '../errorHandler.js';
import type { Env } from '../types.js';
import { ConversationService } from '../services/ConversationService.js';
import { requireOrganizationMember } from '../middleware/auth.js';
import { withPracticeContext, getPracticeId } from '../middleware/practiceContext.js';

function createJsonResponse(data: unknown): Response {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Team inbox routes for practice members to manage conversations
 * Requires organization membership (practice member role)
 */
export async function handleInbox(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const segments = url.pathname.split('/').filter(Boolean);

  if (segments[0] !== 'api' || segments[1] !== 'inbox') {
    throw HttpErrors.notFound('Inbox route not found');
  }

  // Get practice context first (this only attaches practice metadata, preserves auth headers)
  const requestWithContext = await withPracticeContext(request, env, {
    requirePractice: true,
    allowUrlOverride: true
  });
  const practiceId = getPracticeId(requestWithContext);

  // SECURITY: Always use the original request for authentication to ensure
  // URL parameters cannot affect which user is authenticated.
  // 
  // CRITICAL: practiceId is an authorization parameter, not mere metadata. It determines
  // which practice's data the user can access (lines 60, 82, 91, etc.). The allowUrlOverride: true
  // setting allows practiceId to be influenced by URL parameters, which could enable authorization
  // bypass if not properly validated.
  //
  // This approach is safe ONLY because requireOrganizationMember validates that the authenticated
  // user (from the original request's Authorization header) is actually a member of the specific
  // practiceId provided. If an attacker manipulates practiceId via URL parameters, 
  // requireOrganizationMember will fail with 403 Forbidden if they are not a member of that practice.
  // 
  // If requireOrganizationMember did not validate membership against the provided practiceId,
  // this would be a critical authorization bypass vulnerability.
  const memberContext = await requireOrganizationMember(request, env, practiceId, 'paralegal');
  const userId = memberContext.user.id;
  const conversationService = new ConversationService(env);

  // GET /api/inbox/conversations - List conversations with filters
  if (segments.length === 3 && segments[2] === 'conversations' && request.method === 'GET') {
    const assignedTo = url.searchParams.get('assignedTo'); // 'me', 'unassigned', or user ID
    const status = url.searchParams.get('status') as 'active' | 'archived' | 'closed' | null;
    const priority = url.searchParams.get('priority') as 'low' | 'normal' | 'high' | 'urgent' | null;
    const tagsParam = url.searchParams.get('tags'); // Comma-separated tags
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);
    const sortBy = (url.searchParams.get('sortBy') || 'last_message_at') as 'last_message_at' | 'created_at' | 'priority';
    const sortOrder = (url.searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc';

    // Handle 'me' assignment filter
    let assignedToFilter: string | null = assignedTo;
    if (assignedTo === 'me') {
      assignedToFilter = userId;
    }

    const tags = tagsParam ? tagsParam.split(',').map(t => t.trim()).filter(Boolean) : undefined;

    const result = await conversationService.getInboxConversations({
      practiceId,
      assignedTo: assignedToFilter || undefined,
      status: status || undefined,
      priority: priority || undefined,
      tags,
      limit,
      offset,
      sortBy,
      sortOrder
    });

    return createJsonResponse({
      conversations: result.conversations,
      total: result.total,
      limit,
      offset
    });
  }

  // GET /api/inbox/stats - Get inbox statistics
  if (segments.length === 3 && segments[2] === 'stats' && request.method === 'GET') {
    const stats = await conversationService.getInboxStats(practiceId, userId);
    return createJsonResponse(stats);
  }

  // GET /api/inbox/conversations/:id - Get single conversation (inbox view)
  if (segments.length === 4 && segments[2] === 'conversations' && request.method === 'GET') {
    const conversationId = segments[3];
    
    // Practice members can view any conversation in their practice
    const conversation = await conversationService.getConversation(conversationId, practiceId);
    return createJsonResponse(conversation);
  }

  // PATCH /api/inbox/conversations/:id - Update conversation (assignment, priority, notes, status)
  if (segments.length === 4 && segments[2] === 'conversations' && request.method === 'PATCH') {
    const conversationId = segments[3];
    const body = await parseJsonBody(request) as {
      assigned_to?: string | null;
      priority?: 'low' | 'normal' | 'high' | 'urgent';
      tags?: string[];
      internal_notes?: string | null;
      status?: 'active' | 'archived' | 'closed';
    };

    // Handle 'me' assignment
    let assignedTo: string | null | undefined = body.assigned_to;
    if (assignedTo === 'me') {
      assignedTo = userId;
    }

    const conversation = await conversationService.updateInboxConversation(
      conversationId,
      practiceId,
      {
        assigned_to: assignedTo,
        priority: body.priority,
        tags: body.tags,
        internal_notes: body.internal_notes,
        status: body.status
      }
    );

    return createJsonResponse(conversation);
  }

  // POST /api/inbox/conversations/:id/assign - Assign conversation
  if (segments.length === 5 && segments[2] === 'conversations' && segments[4] === 'assign' && request.method === 'POST') {
    const conversationId = segments[3];
    const body = await parseJsonBody(request) as {
      assigned_to: string | null | 'me';
    };

    // Handle 'me' assignment
    let assignedTo: string | null = body.assigned_to;
    if (assignedTo === 'me') {
      assignedTo = userId;
    }

    const conversation = await conversationService.assignConversation(
      conversationId,
      practiceId,
      assignedTo
    );

    return createJsonResponse(conversation);
  }

  // POST /api/inbox/conversations/:id/messages - Send message as practice member
  if (segments.length === 5 && segments[2] === 'conversations' && segments[4] === 'messages' && request.method === 'POST') {
    const conversationId = segments[3];
    const body = await parseJsonBody(request) as {
      content: string;
      metadata?: Record<string, unknown>;
    };

    if (!body.content || typeof body.content !== 'string') {
      throw HttpErrors.badRequest('Message content is required');
    }

    // Ensure practice member is a participant
    try {
      await conversationService.validateParticipantAccess(conversationId, practiceId, userId);
    } catch {
      // If not a participant, add them
      await conversationService.addParticipant(conversationId, practiceId, userId);
    }

    // Send message
    const message = await conversationService.sendMessage({
      conversationId,
      practiceId,
      senderUserId: userId,
      content: body.content,
      role: 'assistant', // Practice members send as 'assistant' to distinguish from clients
      metadata: body.metadata
    });

    // Update first_response_at if this is the first practice member response
    await conversationService.updateFirstResponseAt(conversationId, practiceId);

    return createJsonResponse(message);
  }

  throw HttpErrors.methodNotAllowed('Unsupported method for inbox endpoint');
}

