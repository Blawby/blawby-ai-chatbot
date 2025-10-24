import type { Env } from '../types.js';
import { parseJsonBody } from '../utils.js';
import { HttpErrors } from '../errorHandler.js';
import { runPipeline } from '../middleware/pipeline.js';
import { ConversationContextManager } from '../middleware/conversationContextManager.js';
import { contentPolicyFilter } from '../middleware/contentPolicyFilter.js';
import { businessScopeValidator } from '../middleware/businessScopeValidator.js';
import { jurisdictionValidator } from '../middleware/jurisdictionValidator.js';
import { createLoggingMiddleware } from '../middleware/pipeline.js';
import { caseDraftMiddleware } from '../middleware/caseDraftMiddleware.js';
import { documentChecklistMiddleware } from '../middleware/documentChecklistMiddleware.js';
import { skipToLawyerMiddleware } from '../middleware/skipToLawyerMiddleware.js';
import { pdfGenerationMiddleware } from '../middleware/pdfGenerationMiddleware.js';
import { fileAnalysisMiddleware } from '../middleware/fileAnalysisMiddleware.js';
import { runLegalIntakeAgentStream } from '../agents/legal-intake/index.js';
import { getCloudflareLocation } from '../utils/cloudflareLocationValidator.js';
import { SessionService } from '../services/SessionService.js';
import { StatusService } from '../services/StatusService.js';
import { chunkResponseText } from '../utils/streaming.js';
import { Logger } from '../utils/logger.js';
import { ensureActiveSubscription } from '../middleware/subscription.js';
import { UsageService } from '../services/UsageService.js';
import { requireFeature } from '../middleware/featureGuard.js';
import { getBackendAuth } from '../middleware/backendAuth.js';

// Interface for the request body
interface RouteBody {
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
  organizationId?: string;
  sessionId?: string;
  aiProvider?: string;
  aiModel?: string;
  attachments?: Array<{
    id?: string;
    name: string;
    size: number;
    type: string;
    url: string;
  }>;
}

/**
 * Modern pipeline-based agent handler
 * Uses context-aware middleware instead of hard security filters
 */
export async function handleAgentStreamV2(request: Request, env: Env): Promise<Response> {
  // Optional backend authentication (allow anonymous chat)
  const authContext = await getBackendAuth(request, env);

  // Handle GET requests for SSE connections
  if (request.method === 'GET') {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get('sessionId');
    const organizationId = url.searchParams.get('organizationId');
    
    if (!sessionId) {
      throw HttpErrors.badRequest('sessionId parameter is required');
    }

    if (!organizationId) {
      throw HttpErrors.badRequest('organizationId parameter is required');
    }

    // Verify session ownership before subscribing
    const session = await SessionService.getSessionById(env, sessionId);
    if (!session) {
      throw HttpErrors.badRequest('Session not found');
    }
    if (session.organizationId !== organizationId) {
      throw HttpErrors.forbidden('Session does not belong to the specified organization');
    }

    // Create SSE response for status updates
    const headers = new Headers({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      // CORS headers will be added by the global CORS middleware
    });

    // Register session subscription for real-time updates
    try {
      await StatusService.subscribeSession(env, sessionId, organizationId);
    } catch (error) {
      Logger.error('Failed to subscribe session for SSE updates', {
        error: error instanceof Error ? error.message : String(error),
        sessionId,
        organizationId,
        env: env ? 'present' : 'missing'
      });
      
      // Return error response with SSE error event
      const errorEvent = `data: ${JSON.stringify({
        type: 'error',
        message: 'Failed to establish session subscription for real-time updates',
        error: error instanceof Error ? error.message : String(error),
        sessionId,
        timestamp: Date.now()
      })}\n\n`;
      
      return new Response(errorEvent, { headers });
    }

    // Create SSE stream with real-time status polling
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let lastSeen = Date.now();
        let isActive = true;
        let errorCount = 0;
        let pollTimeoutId: ReturnType<typeof setTimeout> | null = null;

        const sendEvent = (event: unknown) => {
          if (!isActive) return;
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          } catch (error) {
            console.error('Failed to send SSE event:', error);
            isActive = false;
          }
        };

        // Send initial connection message
        sendEvent({ 
          type: 'connected', 
          message: 'SSE connection established',
          sessionId,
          timestamp: Date.now()
        });

        // Self-scheduling async poll function with exponential backoff
        const pollForUpdates = async () => {
          if (!isActive) return;

          try {
            // Get recent status updates
            const recentStatuses = await StatusService.getRecentStatuses(env, sessionId, lastSeen);
            
            if (recentStatuses.length > 0) {
              // Send each status update as a separate event
              for (const status of recentStatuses) {
                sendEvent({
                  type: 'status_update',
                  data: {
                    id: status.id,
                    type: status.type,
                    status: status.status,
                    message: status.message,
                    progress: status.progress,
                    data: status.data,
                    timestamp: status.updatedAt
                  }
                });
              }
              
              // Update last seen timestamp safely to handle out-of-order timestamps
              // Filter and normalize timestamps to avoid NaN from invalid values
              const validTimestamps = [
                lastSeen, // Include current lastSeen in candidate set
                ...recentStatuses
                  .map(s => s.updatedAt)
                  .map(timestamp => typeof timestamp === 'string' ? Date.parse(timestamp) : Number(timestamp))
                  .filter(timestamp => isFinite(timestamp))
              ];
              lastSeen = Math.max(...validTimestamps);
              await StatusService.updateSubscriptionLastSeen(env, sessionId, lastSeen);
            }

            // Send periodic ping to keep connection alive
            sendEvent({ 
              type: 'ping', 
              timestamp: Date.now(),
              lastSeen
            });

            // Reset error count on successful poll
            errorCount = 0;

          } catch (error) {
            console.error('Error polling status updates:', error);
            errorCount++;
            
            sendEvent({
              type: 'error',
              message: 'Failed to fetch status updates',
              timestamp: Date.now()
            });
          }

          // Schedule next poll with exponential backoff on errors
          if (isActive) {
            const baseInterval = StatusService.getPollInterval(env);
            const delay = errorCount > 0 
              ? StatusService.calculateBackoffDelay(baseInterval, errorCount)
              : baseInterval;
            
            pollTimeoutId = setTimeout(pollForUpdates, delay);
          }
        };

        // Start the polling loop
        pollForUpdates();

        // Clean up on close
        let cleanedUp = false;
        const cleanup = () => {
          if (cleanedUp) return;
          cleanedUp = true;
          isActive = false;
          if (pollTimeoutId !== null) {
            clearTimeout(pollTimeoutId);
            pollTimeoutId = null;
          }
          StatusService.unsubscribeSession(env, sessionId).catch(error => {
            console.error('Failed to unsubscribe session:', error);
          });
          try {
            controller.close();
          } catch (error) {
            console.error('Failed to close controller:', error);
          }
        };

        request.signal?.addEventListener('abort', cleanup);
        
        // Also cleanup after 1 hour to prevent long-running connections
        setTimeout(cleanup, 60 * 60 * 1000);
      }
    });

    return new Response(stream, { headers });
  }

  if (request.method !== 'POST') {
    throw HttpErrors.methodNotAllowed('Only POST and GET methods are allowed');
  }

  // Set SSE headers for streaming
  const headers = new Headers({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
    // CORS headers will be added by the global CORS middleware
  });

  try {
    const rawBody = await parseJsonBody(request);
    
    // Runtime validation of request body
    if (!isValidRouteBody(rawBody)) {
      throw HttpErrors.badRequest('Invalid request body format. Expected messages array with valid message objects.');
    }
    
    const body = rawBody as RouteBody;
    const { messages, organizationId, sessionId, attachments = [], aiProvider, aiModel } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      throw HttpErrors.badRequest('No message content provided');
    }
    
    const normalizedMessages = messages.map(message => {
      const rawRole = typeof message.role === 'string' ? message.role.trim().toLowerCase() : '';
      const normalizedRole: 'user' | 'assistant' | 'system' = rawRole === 'user'
        ? 'user'
        : rawRole === 'system'
          ? 'system'
          : 'assistant';

      const content = typeof message.content === 'string' ? message.content : '';

      return {
        ...message,
        role: normalizedRole,
        content
      };
    });

    let latestMessage = normalizedMessages[normalizedMessages.length - 1];

    if (!latestMessage?.content) {
      if (attachments.length > 0) {
        latestMessage = {
          ...latestMessage,
          content: latestMessage?.content?.trim().length
            ? latestMessage.content
            : 'User uploaded new documents for review.'
        };
        normalizedMessages[normalizedMessages.length - 1] = latestMessage;
      } else {
        throw HttpErrors.badRequest('No message content provided');
      }
    }

    if (latestMessage.role !== 'user') {
      if (attachments.length > 0) {
        latestMessage = {
          ...latestMessage,
          role: 'user'
        };
        normalizedMessages[normalizedMessages.length - 1] = latestMessage;
      } else {
        throw HttpErrors.badRequest('Latest message must be from user');
      }
    }

    const trimmedSessionId = typeof sessionId === 'string' && sessionId.trim().length > 0
      ? sessionId.trim()
      : undefined;

    let effectiveOrganizationId = typeof organizationId === 'string' && organizationId.trim().length > 0
      ? organizationId.trim()
      : undefined;

    if (!effectiveOrganizationId && trimmedSessionId) {
      try {
        const priorSession = await SessionService.getSessionById(env, trimmedSessionId);
        if (priorSession) {
          effectiveOrganizationId = priorSession.organizationId;
        }
      } catch (lookupError) {
        console.warn('Failed to lookup existing session before resolution', lookupError);
      }
    }

    if (!effectiveOrganizationId) {
      throw HttpErrors.badRequest('organizationId is required for agent interactions');
    }

    const providerOverride = typeof aiProvider === 'string' && aiProvider.trim().length > 0
      ? aiProvider.trim()
      : undefined;
    const modelOverride = typeof aiModel === 'string' && aiModel.trim().length > 0
      ? aiModel.trim()
      : undefined;

    const sessionResolution = await SessionService.resolveSession(env, {
      request,
      sessionId: trimmedSessionId,
      organizationId: effectiveOrganizationId,
      createIfMissing: true
    });

    const resolvedSessionId = sessionResolution.session.id;
    const resolvedOrganizationId = sessionResolution.session.organizationId;

    // Security check: ensure session belongs to the requested organization
    if (resolvedOrganizationId !== effectiveOrganizationId) {
      throw HttpErrors.forbidden('Session does not belong to the specified organization');
    }

    if (sessionResolution.cookie) {
      headers.append('Set-Cookie', sessionResolution.cookie);
    }

    const stripeSubscriptionsEnabled =
      env.ENABLE_STRIPE_SUBSCRIPTIONS === 'true' ||
      env.ENABLE_STRIPE_SUBSCRIPTIONS === true;

    if (stripeSubscriptionsEnabled) {
      try {
        await ensureActiveSubscription(env, {
          organizationId: resolvedOrganizationId,
          refreshIfMissing: false,
        });
      } catch (subscriptionError) {
        console.warn('Subscription check failed; allowing request to proceed for now', {
          error: subscriptionError instanceof Error ? subscriptionError.message : String(subscriptionError),
          organizationId: resolvedOrganizationId,
          sessionId: resolvedSessionId,
        });
      }
    }

    await requireFeature(
      request,
      env,
      {
        feature: 'chat',
        allowAnonymous: true,
        quotaMetric: 'messages',
      },
      {
        organizationId: resolvedOrganizationId,
        sessionId: resolvedSessionId,
      }
    );

    // Increment usage atomically before processing to prevent TOCTOU races
    try {
      const incrementResult = await UsageService.incrementUsageAtomic(env, resolvedOrganizationId, 'messages');
      if (incrementResult === null) {
        console.warn('Message processing blocked: quota limit reached', {
          organizationId: resolvedOrganizationId,
          sessionId: resolvedSessionId,
        });
        // Return error response when quota is exceeded - no further processing
        return new Response(
          JSON.stringify({
            error: 'Payment Required',
            message: 'You have reached your message limit. Please upgrade your plan or wait for the next billing period.'
          }),
          {
            status: 402,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': headers.get('Cache-Control') || 'no-cache',
              'Connection': headers.get('Connection') || 'keep-alive'
            }
          }
        );
      }
    } catch (usageError) {
      console.warn('Usage tracking failed; blocking request to prevent quota bypass', {
        error: usageError instanceof Error ? usageError.message : String(usageError),
        organizationId: resolvedOrganizationId,
        sessionId: resolvedSessionId,
      });
      // Return error response when usage tracking fails - no further processing
      return new Response(
        JSON.stringify({
          error: 'Usage tracking failed',
          message: 'Unable to track usage. Please try again.'
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': headers.get('Cache-Control') || 'no-cache',
            'Connection': headers.get('Connection') || 'keep-alive'
          }
        }
      );
    }

    // Persist the latest user message for auditing (only after successful usage increment)
    try {
      const metadata = attachments.length > 0
        ? {
            attachments: attachments.map(att => ({
              id: att.id ?? null,
              name: att.name,
              size: att.size,
              type: att.type,
              url: att.url
            }))
          }
        : undefined;

      const messageRecord = latestMessage as { id?: unknown };
      const messageId = typeof messageRecord.id === 'string' ? messageRecord.id : undefined;

      await SessionService.persistMessage(env, {
        sessionId: resolvedSessionId,
        organizationId: resolvedOrganizationId,
        role: 'user',
        content: latestMessage.content,
        metadata,
        messageId
      });
    } catch (persistError) {
      console.warn('Failed to persist chat message to D1', persistError);
    }

    // Get organization configuration
    let organizationConfig = null;
    if (effectiveOrganizationId) {
      try {
        const { AIService } = await import('../services/AIService.js');
        const aiService = new AIService(env.AI, env);
        const rawOrganizationConfig = await aiService.getOrganizationConfig(effectiveOrganizationId);
        organizationConfig = rawOrganizationConfig;
      } catch (error) {
        console.warn('Failed to get organization config:', error);
      }
    }

    // Get Cloudflare location data
    const cloudflareLocation = getCloudflareLocation(request);

    // Load conversation context
    const context = await ConversationContextManager.load(resolvedSessionId, resolvedOrganizationId, env);

    // Update context with the full conversation before running pipeline
    const updatedContext = ConversationContextManager.updateContext(context, normalizedMessages);
    
    // Add current attachments to context for middleware processing
    if (attachments && attachments.length > 0) {
      updatedContext.currentAttachments = attachments;
    }

    // Run through pipeline with full conversation history
    const pipelineResult = await runPipeline(
      normalizedMessages,
      updatedContext,
      organizationConfig,
      [
        createLoggingMiddleware(),
        contentPolicyFilter,
        skipToLawyerMiddleware,
        businessScopeValidator,
        fileAnalysisMiddleware, // Handle file analysis early in pipeline
        jurisdictionValidator,
        caseDraftMiddleware,
        documentChecklistMiddleware,
        pdfGenerationMiddleware
      ],
      env
    );

    // Save updated context
    const saveSuccess = await ConversationContextManager.save(pipelineResult.context, env);
    if (!saveSuccess) {
      console.warn('Failed to save conversation context for session:', pipelineResult.context.sessionId);
    }

    // If pipeline provided a response, return it with UI components
    if (pipelineResult.response && pipelineResult.response !== 'AI_HANDLE') {
      // Create streaming response to include UI components
      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          const sendEvent = (event: unknown) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          };

          try {
            sendEvent({ type: 'connected' });

            const responseChunks = chunkResponseText(pipelineResult.response);
            if (responseChunks.length === 0) {
              sendEvent({ type: 'text', text: pipelineResult.response });
            } else {
              for (const chunk of responseChunks) {
                sendEvent({ type: 'text', text: chunk });
              }
            }

            // Check for UI components in context and send them as separate events
            if (pipelineResult.context.caseDraft) {
              sendEvent({
                type: 'matter_canvas',
                data: {
                  matterId: pipelineResult.context.caseDraft.matter_type?.toLowerCase().replace(/\s+/g, '-') || 'general-case',
                  matterNumber: `CASE-${Date.now()}`,
                  service: pipelineResult.context.caseDraft.matter_type || 'General Consultation',
                  matterSummary: pipelineResult.context.caseDraft.key_facts?.join(' ') || 'Case information organized',
                  answers: {}
                }
              });
            }

            if (pipelineResult.context.documentChecklist) {
              const { documentChecklist } = pipelineResult.context;
              const providedSet = new Set((documentChecklist.provided || []).map(name => name.toLowerCase().trim()));

              sendEvent({
                type: 'document_checklist',
                data: {
                  matterType: documentChecklist.matter_type,
                  documents: (documentChecklist.required || []).map(name => ({
                    id: name.toLowerCase().replace(/\s+/g, '-'),
                    name,
                    description: `Required document for ${documentChecklist.matter_type}`,
                    required: true,
                    status: providedSet.has(name.toLowerCase().trim()) ? 'provided' : 'missing'
                  }))
                }
              });
            }

            if (pipelineResult.context.generatedPDF) {
              sendEvent({
                type: 'pdf_generation',
                data: {
                  filename: pipelineResult.context.generatedPDF.filename,
                  size: pipelineResult.context.generatedPDF.size,
                  generatedAt: pipelineResult.context.generatedPDF.generatedAt,
                  matterType: pipelineResult.context.generatedPDF.matterType
                }
              });
            }

            if (pipelineResult.context.lawyerSearchResults) {
              sendEvent({
                type: 'lawyer_search',
                data: {
                  matterType: pipelineResult.context.lawyerSearchResults.matterType,
                  lawyers: pipelineResult.context.lawyerSearchResults.lawyers,
                  total: pipelineResult.context.lawyerSearchResults.total
                }
              });
            }

            sendEvent({
              type: 'final',
              response: pipelineResult.response,
              middlewareUsed: pipelineResult.middlewareUsed,
              context: {
                establishedMatters: pipelineResult.context.establishedMatters,
                userIntent: pipelineResult.context.userIntent,
                conversationPhase: pipelineResult.context.conversationPhase
              }
            });

            sendEvent({ type: 'complete' });
            controller.close();

          } catch (error) {
            console.error('Error in pipeline response stream:', error);
            sendEvent({
              type: 'error',
              message: error instanceof Error ? error.message : String(error)
            });
            sendEvent({ type: 'complete' });
            controller.close();
          }
        }
      });
      
      return new Response(stream, { headers });
    }

    // Pipeline didn't provide a response - let AI handle it
    console.log('✅ Pipeline passed, creating AI stream...');

    // Create streaming response using ReadableStream
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send initial connection event
          controller.enqueue(new TextEncoder().encode('data: {"type":"connected"}\n\n'));
          
          // Convert messages to the format expected by the AI agent
        const formattedMessages = normalizedMessages.map(msg => ({
            role: msg.role as 'user' | 'assistant' | 'system',
            content: msg.content
          }));

          // Validate attachment sizes before processing
          const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10MB limit
          const oversizedAttachments: string[] = [];
          
          for (const att of attachments) {
            if (att.size > MAX_ATTACHMENT_SIZE) {
              oversizedAttachments.push(`${att.name} (${(att.size / 1024 / 1024).toFixed(1)}MB)`);
            }
          }
          
          if (oversizedAttachments.length > 0) {
            throw HttpErrors.payloadTooLarge(
              `Attachment size limit exceeded. Maximum allowed size is ${MAX_ATTACHMENT_SIZE / 1024 / 1024}MB. ` +
              `Oversized attachments: ${oversizedAttachments.join(', ')}`
            );
          }

          const fileAttachments = attachments.map(att => ({
            id: att.id || crypto.randomUUID(),
            name: att.name,
            type: att.type,
            size: att.size,
            url: att.url
          }));

          // Run the AI agent with updated context
          await runLegalIntakeAgentStream(
            env,
            formattedMessages,
            effectiveOrganizationId,
            resolvedSessionId,
            cloudflareLocation,
            controller,
            fileAttachments,
            {
              provider: providerOverride,
              model: modelOverride
            }
          );
          
        } catch (error) {
          console.error('🚨 ERROR in AI agent:', error);
          
          // Send error event via SSE
          const errorEvent = `data: ${JSON.stringify({
            type: 'error',
            message: `Agent error: ${error instanceof Error ? error.message : String(error)}`,
            correlationId: `route_${Date.now()}`
          })}\n\n`;
          controller.enqueue(new TextEncoder().encode(errorEvent));
          
          // Send complete event
          const completeEvent = `data: ${JSON.stringify({
            type: 'complete'
          })}\n\n`;
          controller.enqueue(new TextEncoder().encode(completeEvent));
          
          // Close controller
          controller.close();
        }
      }
    });

    return new Response(stream, { headers });

  } catch (error) {
    console.error('🚨 ERROR in agent route:', error);
    
    const errorEvent = `data: ${JSON.stringify({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
      correlationId: `route_${Date.now()}`
    })}\n\n`;
    
    return new Response(errorEvent, { headers });
  }
}

/**
 * Validate request body format
 */
function isValidRouteBody(obj: unknown): obj is RouteBody {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const body = obj as Record<string, unknown>;
  
  if (!Array.isArray(body.messages)) {
    return false;
  }

  // Validate each message
  for (const message of body.messages) {
    if (!message || typeof message !== 'object') {
      return false;
    }
    
    const msg = message as Record<string, unknown>;
    
    if (typeof msg.role !== 'string' || !['user', 'assistant', 'system'].includes(msg.role)) {
      return false;
    }
    
    if (typeof msg.content !== 'string') {
      return false;
    }
  }

  // Optional fields validation
  if (body.organizationId !== undefined && typeof body.organizationId !== 'string') return false;
  if (body.sessionId !== undefined && typeof body.sessionId !== 'string') return false;

  if (body.aiProvider !== undefined && typeof body.aiProvider !== 'string') return false;
  if (body.aiModel !== undefined && typeof body.aiModel !== 'string') return false;

  if (body.attachments !== undefined) {
    if (!Array.isArray(body.attachments)) return false;
    for (const item of body.attachments) {
      if (!item || typeof item !== 'object') return false;
      const att = item as Record<string, unknown>;
      const name = att.name;
      const type = att.type;
      const size = att.size;
      const url = att.url;

      const nameOk = typeof name === 'string' && name.length > 0;
      const typeOk = typeof type === 'string' && type.length > 0;
      const sizeOk = typeof size === 'number' && size >= 0 && Number.isFinite(size);
      const urlOk = typeof url === 'string' && (
        /^(https?):\/\//i.test(url) || (url.startsWith('/') && !url.startsWith('//'))
      );
      if (!(nameOk && typeOk && sizeOk && urlOk)) return false;
    }
  }

  return true;
}
