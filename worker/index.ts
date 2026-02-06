// Removed shim - trying to identify the actual caller

import {
  handleHealth,
  handleRoot,
  handleActivity,
  handleFiles,
  handleAnalyze,
  handlePDF,
  handleDebug,
  handleConfig,
  handleNotifications,
  handlePracticeDetails,
  handlePractices,
  handleAuthProxy,
  handleBackendProxy,
  handleIntakes,
  handleParalegal,
  handleMatters,
} from './routes';
import { handleConversations } from './routes/conversations.js';
import { handleAiChat } from './routes/aiChat.js';
import { handleAiIntent } from './routes/aiIntent.js';
import { handleStatus } from './routes/status.js';
import { handleAutocompleteWithCORS } from './routes/api/geo/autocomplete.js';
import { Env } from './types';
import { handleError } from './errorHandler';
import { withCORS, getCorsConfig } from './middleware/cors';
import type { ScheduledEvent } from '@cloudflare/workers-types';
import { handleNotificationQueue } from './queues/notificationProcessor.js';

// Basic request validation
function validateRequest(request: Request): boolean {
  const url = new URL(request.url);
  const _path = url.pathname;

  // Check for reasonable request size (10MB limit)
  const contentLength = request.headers.get('content-length');
  if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) {
    return false;
  }

  // Check for valid content type on POST requests
  if (request.method === 'POST') {
    const contentType = request.headers.get('content-type');
    if (!contentType) {
      return false;
    }
    // Allow both JSON and multipart/form-data for file uploads
    if (!contentType.includes('application/json') && !contentType.includes('multipart/form-data')) {
      return false;
    }
  }

  return true;
}

async function handleRequestInternal(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  // Basic request validation
  if (!validateRequest(request)) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Invalid request',
      errorCode: 'INVALID_REQUEST'
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // Route handling with enhanced error context
    let response: Response;

    console.log('🔍 Route matching for path:', path);

    if (path.startsWith('/api/intakes')) {
      response = await handleIntakes(request, env);
    } else if (path.startsWith('/api/matters')) {
      response = await handleMatters(request, env, _ctx);
    } else if (path.startsWith('/api/auth')) {
      response = await handleAuthProxy(request, env);
    } else if (path.startsWith('/api/conversations/') && path.endsWith('/link')) {
      response = await handleBackendProxy(request, env);
    } else if (
      path.startsWith('/api/onboarding') ||
      path.startsWith('/api/practice/client-intakes') ||
      path.startsWith('/api/user-details') ||
      ((path === '/api/practice' || path.startsWith('/api/practice/')) &&
        !path.startsWith('/api/practice/details/') &&
        !path.startsWith('/api/practices')) ||
      path.startsWith('/api/preferences') ||
      path.startsWith('/api/subscriptions') ||
      path.startsWith('/api/subscription') ||
      path.startsWith('/api/uploads')
    ) {
      response = await handleBackendProxy(request, env);
    } else if (path.startsWith('/api/practices')) {
      response = await handlePractices(request, env);
    } else if (path.startsWith('/api/paralegal')) {
      response = await handleParalegal(request, env);
    } else if (path.startsWith('/api/activity')) {
      response = await handleActivity(request, env);
    } else if (path.startsWith('/api/files')) {
      response = await handleFiles(request, env);
    } else if (path === '/api/analyze') {
      response = await handleAnalyze(request, env);
    } else if (path.startsWith('/api/pdf')) {
      response = await handlePDF(request, env);
    } else if (path.startsWith('/api/debug') || path.startsWith('/api/test')) {
      response = await handleDebug(request, env);
    } else if (path.startsWith('/api/status')) {
      response = await handleStatus(request, env);
    } else if (path.startsWith('/api/notifications')) {
      response = await handleNotifications(request, env);
    } else if (path.startsWith('/api/practice/details/')) {
      response = await handlePracticeDetails(request, env);
    } else if (path.startsWith('/api/config')) {
      response = await handleConfig(request, env);
    } else if (path.startsWith('/api/geo/autocomplete')) {
      response = await handleAutocompleteWithCORS(request, env, _ctx);
    } else if (path.startsWith('/api/conversations')) {
      response = await handleConversations(request, env);
    } else if (path.startsWith('/api/ai/intent')) {
      response = await handleAiIntent(request, env);
    } else if (path.startsWith('/api/ai/chat')) {
      response = await handleAiChat(request, env);
    } else if (path.startsWith('/api/agent')) {
      // REMOVED: AI agent endpoints - AI functionality removed, will be replaced with user-to-user chat
      response = new Response(JSON.stringify({
        error: 'AI agent endpoints have been removed. User-to-user chat will be available in a future update.',
        errorCode: 'AI_REMOVED'
      }), {
        status: 410, // 410 Gone - indicates the resource is permanently removed
        headers: { 'Content-Type': 'application/json' }
      });
    } else if (path === '/api/health') {
      response = await handleHealth(request, env);
    } else if (path === '/') {
      response = await handleRoot(request, env);
    } else if (path.startsWith('/api/')) {
      // Return 404 for unmatched API routes
      response = new Response(JSON.stringify({
        error: 'API endpoint not found',
        errorCode: 'NOT_FOUND'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      response = await handleRoot(request, env);
    }

    return response;

  } catch (error) {
    return handleError(error);
  }
}

// Main request handler with CORS middleware
export const handleRequest = withCORS(handleRequestInternal, getCorsConfig);

export default {
  fetch: handleRequest,
  queue: handleNotificationQueue
};

// Scheduled event for cleanup (runs daily)
export async function scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
  // Import StatusService
  const { StatusService } = await import('./services/StatusService');

  // Create cleanup promise with error handling
  const cleanupPromise = StatusService.cleanupExpiredStatuses(env)
    .then(count => {
      console.log(`Scheduled cleanup: removed ${count} expired status entries`);
    })
    .catch(error => {
      console.error('Scheduled cleanup failed:', error);
    });

  // Use ctx.waitUntil to ensure cleanup completes after handler returns
  ctx.waitUntil(cleanupPromise);
}

// Export Durable Object classes
export { ChatRoom } from './durable-objects/ChatRoom';
export { ChatCounterObject } from './durable-objects/ChatCounterObject';
export { MatterProgressRoom } from './durable-objects/MatterProgressRoom';
export { MatterDiffStore } from './durable-objects/MatterDiffStore';
