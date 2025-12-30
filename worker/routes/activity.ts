import { ActivityService, type ActivityEvent } from '../services/ActivityService';
// SessionService removed - using conversations instead
import { rateLimit, getClientId } from '../middleware/rateLimit';
import { createRateLimitResponse } from '../errorHandler';
import { HttpErrors, handleError } from '../errorHandler';
import { parseJsonBody } from '../utils.js';
import type { Env } from '../types';
import { requirePracticeMember } from '../middleware/auth';

interface CreateActivityRequest {
  type: 'matter_event' | 'conversation_event';
  eventType: string;
  title: string;
  description?: string;
  eventDate: string;
  matterId?: string;
  conversationId?: string;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
}


export async function handleActivity(request: Request, env: Env): Promise<Response> {

  // Rate limiting
  const clientId = getClientId(request);
  if (!(await rateLimit(env, clientId, 50, 60))) { // 50 requests per minute
    return createRateLimitResponse(60, {
      limit: 50,
      remaining: 0,
      reset: Math.floor(Date.now() / 1000) + 60,
      errorMessage: 'Rate limit exceeded. Please try again later.'
    });
  }

  try {
    if (request.method === 'GET') {
      return await handleGetActivity(request, env);
    } else if (request.method === 'POST') {
      return await handleCreateActivity(request, env);
    } else {
      throw HttpErrors.methodNotAllowed('Only GET and POST methods are allowed');
    }
  } catch (error) {
    // Handle special cases that need custom responses
    if (error instanceof Error && error.message.includes('Invalid cursor')) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Invalid cursor',
        code: 'INVALID_CURSOR'
      }), {
        status: 400,
        headers: {  'Content-Type': 'application/json' }
      });
    }
    
    if (error instanceof Error && error.message.includes('Session')) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Authentication required',
        errorCode: 'UNAUTHORIZED'
      }), {
        status: 401,
        headers: {  'Content-Type': 'application/json' }
      });
    }
    
    // Use centralized error handling for all other errors
    return handleError(error);
  }
}

async function handleGetActivity(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const practiceId = url.searchParams.get('practiceId');
  
  if (!practiceId) {
    throw HttpErrors.badRequest('practiceId parameter is required');
  }

  // SECURITY: Validate practiceId format and user authorization before any data access
  // This ensures that:
  // 1. The auth token/session is valid (via requirePracticeMember -> requireAuth)
  // 2. The practiceId format is valid (non-empty string, validated by requirePracticeMember)
  // 3. The authenticated user has access to the requested practiceId
  // 4. Returns 403 Forbidden if the user is not a member of the practice
  // 
  // CRITICAL: This authorization check runs BEFORE any data fetch to prevent
  // unauthorized access to arbitrary practiceIds. The original request is used
  // (not a modified one) to ensure URL parameters cannot affect authentication.
  await requirePracticeMember(request, env, practiceId, 'paralegal');
  
  const resolvedPracticeId = practiceId;

  // Parse query parameters
  const matterId = url.searchParams.get('matterId') || undefined;
  const conversationId = url.searchParams.get('conversationId') || undefined;
  const limit = parseInt(url.searchParams.get('limit') || '25', 10);
  const cursor = url.searchParams.get('cursor') || undefined;
  const since = url.searchParams.get('since') || undefined;
  const until = url.searchParams.get('until') || undefined;
  const type = url.searchParams.get('type')?.split(',').filter(Boolean) || undefined;
  const actorTypeParam = url.searchParams.get('actorType');
  const actorType = actorTypeParam ? 
    (['user', 'lawyer', 'system'].includes(actorTypeParam) ? actorTypeParam as 'user' | 'lawyer' | 'system' : null) : 
    undefined;

  // Validate parameters
  if (actorType === null) {
    throw HttpErrors.badRequest('Invalid actorType');
  }
  if (!Number.isInteger(limit) || !Number.isFinite(limit) || limit < 1 || limit > 50) {
    throw HttpErrors.badRequest('Limit must be an integer between 1 and 50');
  }

  // Query activity
  const activityService = new ActivityService(env);
  let result;
  try {
    result = await activityService.queryActivity({
      practiceId: resolvedPracticeId,
      matterId,
      conversationId,
      limit,
      cursor,
      since,
      until,
      type,
      actorType
    });
  } catch (error) {
    console.error('Activity query error:', error);
    // Propagate the error instead of swallowing it
    if (error instanceof Error) {
      throw HttpErrors.internalServerError(`Activity query failed: ${error.message}`, error);
    } else {
      throw HttpErrors.internalServerError('Activity query failed', error);
    }
  }

  // Generate ETag for caching
  const etag = generateETag(result);
  
  // Check If-None-Match header for conditional requests
  const ifNoneMatch = request.headers.get('If-None-Match');
  if (ifNoneMatch === etag) {
    return new Response(null, {
      status: 304,
      headers: {
        'ETag': etag,
        'Cache-Control': 'private, max-age=60, must-revalidate',
        'Vary': 'Cookie'
      }
    });
  }

  // Set response headers
  const headers = {
    'Content-Type': 'application/json',
    'ETag': etag,
    'Cache-Control': 'private, max-age=60, must-revalidate',
    'Vary': 'Cookie'
  };

  // Add rate limit headers
  headers['X-RateLimit-Limit'] = '50';
  headers['X-RateLimit-Remaining'] = '49'; // Approximate
  headers['X-RateLimit-Reset'] = String(Math.floor(Date.now() / 1000) + 60);

  return new Response(JSON.stringify({
    success: true,
    data: result
  }), {
    status: 200,
    headers
  });
}

async function handleCreateActivity(request: Request, env: Env): Promise<Response> {
  // Parse request body
  let body: CreateActivityRequest;
  try {
    body = await parseJsonBody(request) as CreateActivityRequest;
  } catch (error) {
    if (error instanceof Error && error.message.includes('Invalid JSON')) {
      throw HttpErrors.badRequest('Invalid JSON body');
    }
    throw error; // Re-throw any other unexpected errors unchanged
  }
  
  // Validate required fields
  if (!body.type || !body.eventType || !body.title || !body.eventDate) {
    throw HttpErrors.badRequest('Missing required fields: type, eventType, title, eventDate');
  }
  
  // Type-specific validation
  if (body.type === 'matter_event' && !body.matterId) {
    throw HttpErrors.badRequest('matterId is required when type is matter_event');
  }
  if (body.type === 'conversation_event' && !body.conversationId) {
    throw HttpErrors.badRequest('conversationId is required when type is conversation_event');
  }

  // Extract practice ID from request (could be in body or query params)
  const url = new URL(request.url);
  const practiceId = (body.metadata?.practiceId as string) || url.searchParams.get('practiceId');
  
  if (!practiceId) {
    throw HttpErrors.badRequest('practiceId is required');
  }

  // SECURITY: Validate practiceId format and user authorization before any data access
  // This ensures that:
  // 1. The auth token/session is valid (via requirePracticeMember -> requireAuth)
  // 2. The practiceId format is valid (non-empty string, validated by requirePracticeMember)
  // 3. The authenticated user has access to the requested practiceId
  // 4. Returns 403 Forbidden if the user is not a member of the practice
  // 
  // CRITICAL: This authorization check runs BEFORE any data fetch or conversation validation
  // to prevent unauthorized access to arbitrary practiceIds. The original request is used
  // (not a modified one) to ensure URL parameters or body metadata cannot affect authentication.
  await requirePracticeMember(request, env, practiceId, 'paralegal');

  // Validate conversation exists and belongs to practice (if conversation event)
  let resolvedPracticeId = practiceId;
  if (body.type === 'conversation_event' && body.conversationId) {
    const { ConversationService } = await import('../services/ConversationService.js');
    const conversationService = new ConversationService(env);
    try {
      const conversation = await conversationService.getConversation(body.conversationId, practiceId);
      resolvedPracticeId = conversation.practice_id;
    } catch (error) {
      throw HttpErrors.badRequest(`Conversation not found or does not belong to practice: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Check for idempotency
  const idempotencyKey = request.headers.get('Idempotency-Key') || body.idempotencyKey;
  if (idempotencyKey) {
    const existingEvent = await checkIdempotency(env, idempotencyKey, resolvedPracticeId);
    if (existingEvent) {
      return new Response(JSON.stringify({
        success: true,
        data: existingEvent
      }), {
        status: 200, // Return existing event
        headers: {  'Content-Type': 'application/json' }
      });
    }
  }

  // Create the event
  const activityService = new ActivityService(env);
  
  // Determine actor information based on provided metadata
  let actorType: 'user' | 'lawyer' | 'system';
  let actorId: string | undefined;
  
  if (body.metadata?.actorId) {
    // Real actor provided - use it and set appropriate type
    actorId = body.metadata.actorId as string;
    actorType = (body.metadata?.actorType as 'user' | 'lawyer' | 'system') || 'user';
  } else {
    // No real actor provided - treat as system event
    actorType = 'system';
    actorId = undefined;
  }
  
  const eventId = await activityService.createEvent({
    type: body.type,
    eventType: body.eventType,
    title: body.title,
    description: body.description || '',
    eventDate: body.eventDate,
    actorType,
    actorId,
    metadata: {
      ...body.metadata,
      practiceId: resolvedPracticeId,
      ...(body.matterId ? { matterId: body.matterId } : {}),
      ...(body.conversationId ? { conversationId: body.conversationId } : {})
    }
  }, resolvedPracticeId);

  // Store idempotency key if provided
  if (idempotencyKey) {
    await storeIdempotencyKey(env, idempotencyKey, resolvedPracticeId, eventId);
  }

  // Fetch the created event to return
  const createdEvent = await getEventById(env, eventId, body.type);

  return new Response(JSON.stringify({
    success: true,
    data: createdEvent
  }), {
    status: 201,
    headers: {  'Content-Type': 'application/json' }
  });
}

// Helper functions
function generateETag(data: unknown): string {
  const content = JSON.stringify(data);
  const encoder = new TextEncoder();
  const bytes = encoder.encode(content);
  const binaryString = String.fromCharCode(...bytes);
  const base64 = btoa(binaryString);
  return `"${base64.slice(0, 16)}"`;
}

async function checkIdempotency(env: Env, key: string, practiceId: string): Promise<ActivityEvent | null> {
  if (!env.CHAT_SESSIONS) return null;
  
  const idempotencyKey = `idempotency:${practiceId}:${key}`;
  const existing = await env.CHAT_SESSIONS.get(idempotencyKey);
  
  if (existing) {
    const eventId = existing;
    // Try to fetch the event (simplified - in real implementation you'd need to know the type)
    return await getEventById(env, eventId, 'matter_event') || 
           await getEventById(env, eventId, 'conversation_event');
  }
  
  return null;
}

async function storeIdempotencyKey(env: Env, key: string, practiceId: string, eventId: string): Promise<void> {
  if (!env.CHAT_SESSIONS) return;
  
  const idempotencyKey = `idempotency:${practiceId}:${key}`;
  await env.CHAT_SESSIONS.put(idempotencyKey, eventId, { expirationTtl: 86400 }); // 24 hours
}

async function getEventById(env: Env, eventId: string, type: 'matter_event' | 'conversation_event'): Promise<ActivityEvent | null> {
  try {
    if (type === 'matter_event') {
      const stmt = env.DB.prepare(`
        SELECT 
          id, event_type, title, description, event_date,
          created_by_lawyer_id, metadata, created_at
        FROM matter_events WHERE id = ?
      `);
      const row = await stmt.bind(eventId).first() as {
        id: string;
        event_type: string;
        title: string;
        description: string | null;
        event_date: string;
        created_by_lawyer_id: string | null;
        metadata: string | null;
        created_at: string;
      } | undefined;
      
      if (row) {
        return {
          id: row.id,
          uid: `matter_evt_${row.id}_${row.event_date.replace(/[-:TZ]/g, '')}`,
          type: 'matter_event',
          eventType: row.event_type,
          title: row.title,
          description: row.description || '',
          eventDate: row.event_date,
          actorType: row.created_by_lawyer_id ? 'lawyer' : 'system',
          actorId: row.created_by_lawyer_id,
          metadata: row.metadata ? JSON.parse(row.metadata) : {},
          createdAt: row.created_at
        };
      }
    } else {
      const stmt = env.DB.prepare(`
        SELECT 
          id, event_type, actor_type, actor_id, payload, created_at
        FROM session_audit_events WHERE id = ?
      `);
      const row = await stmt.bind(eventId).first() as {
        id: string;
        event_type: string;
        actor_type: string;
        actor_id: string | null;
        payload: string | null;
        created_at: string;
      } | undefined;
      
      if (row) {
        return {
          id: row.id,
          uid: `conversation_evt_${row.id}_${row.created_at.replace(/[-:TZ]/g, '')}`,
          type: 'conversation_event',
          eventType: row.event_type,
          title: row.event_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          description: row.payload || '',
          eventDate: row.created_at,
          actorType: row.actor_type as 'user' | 'lawyer' | 'system',
          actorId: row.actor_id,
          metadata: { payload: row.payload },
          createdAt: row.created_at
        };
      }
    }
  } catch (error) {
    console.warn('Failed to fetch event by ID:', error);
  }
  
  return null;
}
