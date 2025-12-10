import { parseJsonBody } from '../utils.js';
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

  // POST /api/chat/messages - Send message
  if (segments.length === 3 && segments[2] === 'messages' && request.method === 'POST') {
    const body = await parseJsonBody(request) as {
      conversationId: string;
      content: string;
      role?: 'user' | 'assistant' | 'system';
      metadata?: Record<string, unknown>;
    };

    if (!body.conversationId || typeof body.conversationId !== 'string') {
      throw HttpErrors.badRequest('conversationId is required');
    }

    if (!body.content || typeof body.content !== 'string' || body.content.trim().length === 0) {
      throw HttpErrors.badRequest('content is required and cannot be empty');
    }

    const message = await conversationService.sendMessage({
      conversationId: body.conversationId,
      practiceId,
      senderUserId: userId,
      content: body.content.trim(),
      role: body.role || 'user',
      metadata: body.metadata
    });

    // Check if this is a contact form submission and send email notifications
    if (body.metadata?.isContactFormSubmission) {
      try {
        const { parseContactData } = await import('../utils/contactValidation.js');
        
        // Parse and validate contact data from message content
        const contactData = parseContactData(body.content);
        
        if (!contactData) {
          console.warn('[Chat] Contact form submission detected but validation failed', {
            contentPreview: body.content.substring(0, 100)
          });
          return createJsonResponse(message);
        }

        // contactData is now fully validated with proper types
        const { NotificationService } = await import('../services/NotificationService.js');
        const { RemoteApiService } = await import('../services/RemoteApiService.js');
        
        const notificationService = new NotificationService(env);

        // Fetch practice object for email notification
        const practice = await RemoteApiService.getPractice(env, practiceId, request);

        if (practice) {
          // Send notification to practice members
          await notificationService.sendMatterCreatedNotification({
            type: 'matter_created',
            practiceConfig: practice,
            matterInfo: {
              type: 'Intake Form Submission',
              urgency: 'normal',
              description: `New lead from ${contactData.name}`
            },
            clientInfo: {
              name: contactData.name,
              email: contactData.email,
              phone: contactData.phone || undefined
            }
          });

          console.log('[Chat] Sent intake notification to practice', { 
            practiceId, 
            contactEmail: contactData.email 
          });
        }
      } catch (emailError) {
        // Log error but don't fail the message send
        console.error('[Chat] Failed to send email notification:', emailError);
      }
    }

    return createJsonResponse(message);
  }

  // GET /api/chat/messages - Get messages
  if (segments.length === 3 && segments[2] === 'messages' && request.method === 'GET') {
    const conversationId = url.searchParams.get('conversationId');
    
    if (!conversationId) {
      throw HttpErrors.badRequest('conversationId query parameter is required');
    }

    // Validate user has access to conversation
    await conversationService.validateParticipantAccess(conversationId, practiceId, userId);

    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const cursor = url.searchParams.get('cursor') || undefined;
    const sinceParam = url.searchParams.get('since');
    const since = sinceParam ? parseInt(sinceParam, 10) : undefined;

    const result = await conversationService.getMessages(conversationId, practiceId, {
      limit,
      cursor,
      since
    });

    return createJsonResponse(result);
  }

  throw HttpErrors.methodNotAllowed('Unsupported method for chat endpoint');
}

