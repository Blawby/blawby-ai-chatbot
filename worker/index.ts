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
  handleParalegal,
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

function validateRequest(request: Request): boolean {
  const contentLength = request.headers.get('content-length');
  if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) {
    return false;
  }

  if (request.method === 'POST') {
    const contentType = request.headers.get('content-type');
    if (!contentType) {
      return false;
    }
    if (!contentType.includes('application/json') && !contentType.includes('multipart/form-data')) {
      return false;
    }
  }

  return true;
}

async function handleRequestInternal(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

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
    let response: Response;

    if (path.startsWith('/api/auth')) {
      response = await handleAuthProxy(request, env);
    } else if (
      path.startsWith('/api/onboarding') ||
      path.startsWith('/api/matters') ||
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
      response = await handleAiChat(request, env, _ctx);
    } else if (path === '/api/health') {
      response = await handleHealth(request, env);
    } else if (path === '/') {
      response = await handleRoot(request, env);
    } else if (path.startsWith('/api/')) {
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

export const handleRequest = withCORS(handleRequestInternal, getCorsConfig);

export default {
  fetch: handleRequest,
  queue: handleNotificationQueue
};

export async function scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
  const { StatusService } = await import('./services/StatusService');

  const cleanupPromise = StatusService.cleanupExpiredStatuses(env)
    .then(count => {
      console.log(`Scheduled cleanup: removed ${count} expired status entries`);
    })
    .catch(error => {
      console.error('Scheduled cleanup failed:', error);
    });

  ctx.waitUntil(cleanupPromise);
}

export { ChatRoom } from './durable-objects/ChatRoom';
export { ChatCounterObject } from './durable-objects/ChatCounterObject';
export { MatterProgressRoom } from './durable-objects/MatterProgressRoom';
