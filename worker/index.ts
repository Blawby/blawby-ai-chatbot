// Removed shim - trying to identify the actual caller

import {
  handleHealth,
  handleRoot,
  handleAgentStream,
  handleForms,
  handleSessions,
  handleActivity,
  handleFiles,
  handleAnalyze,
  handleReview,
  handlePDF,
  handleDebug,
  handleConfig,
  handleUsage,
} from './routes';
import { handleStatus } from './routes/status.js';
import { Env } from './types';
import { handleError, HttpErrors } from './errorHandler';
import { withCORS, getCorsConfig } from './middleware/cors';
import docProcessor from './consumers/doc-processor';
import type { ScheduledEvent } from '@cloudflare/workers-types';

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

    if (path === '/api/agent/stream') {
      console.log('✅ Matched agent route');
      response = await handleAgentStream(request, env);
    } else if (path.startsWith('/api/organizations')) {
      // Organization management is handled by remote API
      // Only workspace endpoints (for chatbot data) remain local
      response = new Response(JSON.stringify({ error: 'Organization management endpoints are handled by remote API. Use /api/organizations/:id/workspace/* for chatbot data.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    } else if (path.startsWith('/api/practice')) {
      response = await proxyPracticeRequest(request, env, path, url.search);
    } else if (path.startsWith('/api/forms')) {
      response = await handleForms(request, env);
    } else if (path.startsWith('/api/auth')) {
      // Auth requests are handled by remote auth server
      response = new Response(JSON.stringify({ error: 'Auth endpoints are handled by remote auth server' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    } else if (path.startsWith('/api/sessions')) {
      response = await handleSessions(request, env);
    } else if (path.startsWith('/api/activity')) {
      response = await handleActivity(request, env);
    } else if (path.startsWith('/api/files')) {
      response = await handleFiles(request, env);
    } else if (path === '/api/analyze') {
      response = await handleAnalyze(request, env);
    } else if (path.startsWith('/api/review')) {
      response = await handleReview(request, env);
    } else if (path === '/api/stripe/webhook') {
      // Stripe webhooks are handled by remote API
      response = new Response(JSON.stringify({ error: 'Stripe webhook endpoints are handled by remote API' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    } else if (path.startsWith('/api/subscription')) {
      // Subscription management is handled by remote API
      response = new Response(JSON.stringify({ error: 'Subscription management endpoints are handled by remote API' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    } else if (path.startsWith('/api/onboarding')) {
      // Onboarding is handled by remote API
      response = new Response(JSON.stringify({ error: 'Onboarding endpoints are handled by remote API' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    } else if (path.startsWith('/api/payment')) {
      // Payment management is handled by remote API
      response = new Response(JSON.stringify({ error: 'Payment endpoints are handled by remote API' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    } else if (path.startsWith('/api/users')) {
      // User management is handled by remote API
      response = new Response(JSON.stringify({ error: 'User management endpoints are handled by remote API' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    } else if (path.startsWith('/api/pdf')) {
      response = await handlePDF(request, env);
    } else if (path.startsWith('/api/debug') || path.startsWith('/api/test')) {
      response = await handleDebug(request, env);
    } else if (path.startsWith('/api/status')) {
      response = await handleStatus(request, env);
    } else if (path.startsWith('/api/config')) {
      response = await handleConfig(request, env);
    } else if (path.startsWith('/api/usage')) {
      response = await handleUsage(request, env);
    } else if (path === '/api/health') {
      response = await handleHealth(request, env);
    } else if (path === '/') {
      response = await handleRoot(request, env);
    } else {
      console.log('❌ No route matched');
      throw HttpErrors.notFound('Endpoint not found');
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
  queue: docProcessor.queue
};

async function proxyPracticeRequest(request: Request, env: Env, path: string, search: string): Promise<Response> {
  const baseUrl = env.REMOTE_API_URL || 'https://staging-api.blawby.com';
  const targetUrl = `${baseUrl}${path}${search}`;
  const method = request.method.toUpperCase();
  const headers = new Headers(request.headers);
  headers.delete('host');

  const init: RequestInit = {
    method,
    headers,
    redirect: 'manual',
  };

  if (method !== 'GET' && method !== 'HEAD') {
    init.body = request.body;
  }

  const proxiedRequest = new Request(targetUrl, init);
  const response = await fetch(proxiedRequest);

  if (!response.ok) {
    const body = await response.text();
    console.error('[PracticeProxy] Remote API error', {
      path,
      status: response.status,
      statusText: response.statusText,
      body,
    });
    return new Response(body || 'Remote API error', {
      status: response.status,
      headers: response.headers,
    });
  }

  return response;
}

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

// Export Durable Object classes (none currently)
