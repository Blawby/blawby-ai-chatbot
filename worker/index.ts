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
  handlePracticeTeam,
  handleWidgetPracticeDetails,
  handlePractices,
  handleAuthProxy,
  handleBackendProxy,
  handleParalegal,
  handleWidgetBootstrap,
  handleBillingSummary,
  handleMetricsVitals,
} from './routes';
import { handleConversations } from './routes/conversations.js';
import { handleAiChat } from './routes/aiChat.js';
import { handleAiIntent } from './routes/aiIntent.js';
import { withAuth, withCache, withRateLimit } from './middleware/compose.js';
import { handleWebsiteExtract } from './routes/handleWebsiteExtract.js';
import { handleSearch } from './routes/handleSearch.js';
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

type RouteHandler = (request: Request, env: Env, ctx: ExecutionContext) => Promise<Response>;
type RouteMatcher = (path: string, env: Env) => boolean;
type RouteMode = 'proxy' | 'owned';
type RouteEntry = {
  match: RouteMatcher;
  handler: RouteHandler;
  /**
   * `'proxy'` — forwards to BACKEND_API_URL (cookies/headers normalized
   *             via worker/utils/proxy.ts; not the worker's data).
   * `'owned'` — worker-owned logic (chat, file storage, intake DB
   *             writes, edge-cached aggregations). Annotation only at
   *             the moment; future middleware (rate-limiting, audit)
   *             can branch on this.
   */
  mode: RouteMode;
};

const exact = (target: string): RouteMatcher => (path) => path === target;
const prefix = (target: string): RouteMatcher => (path) => path.startsWith(target);
const regex = (re: RegExp): RouteMatcher => (path) => re.test(path);

// Backend proxy paths — these all forward to BACKEND_API_URL via handleBackendProxy.
// The (!practice/details, !practices) carve-out preserves the original if/else
// precedence: those paths have dedicated handlers further down.
const matchesBackendProxy: RouteMatcher = (path) =>
  path.startsWith('/api/onboarding') ||
  path.startsWith('/api/matters') ||
  path.startsWith('/api/invoices') ||
  path.startsWith('/api/practice-client-intakes') ||
  path.startsWith('/api/clients') ||
  ((path === '/api/practice' || path.startsWith('/api/practice/')) &&
    !path.startsWith('/api/practice/details/') &&
    !path.startsWith('/api/practices')) ||
  path.startsWith('/api/preferences') ||
  path.startsWith('/api/subscriptions') ||
  path.startsWith('/api/subscription') ||
  path.startsWith('/api/uploads');

// Order is significant: more specific patterns must come before more general
// ones (e.g. `/api/widget/practice-details/*` before `/api/widget/bootstrap`,
// `/api/ai/intent` before `/api/ai/chat`).
const routes: RouteEntry[] = [
  { mode: 'proxy', match: prefix('/api/auth'), handler: (req, env) => handleAuthProxy(req, env) },
  { mode: 'proxy', match: regex(/^\/api\/practice\/[^/]+\/team$/), handler: (req, env) => handlePracticeTeam(req, env) },
  {
    mode: 'owned',
    match: regex(/^\/api\/practice\/[^/]+\/billing\/summary$/),
    // Auth declared at the route table — handler reads via getAttachedAuthContext.
    handler: withAuth((req, env) => handleBillingSummary(req, env), { required: true }),
  },
  { mode: 'proxy', match: matchesBackendProxy, handler: (req, env) => handleBackendProxy(req, env) },
  { mode: 'proxy', match: prefix('/api/practices'), handler: (req, env) => handlePractices(req, env) },
  { mode: 'owned', match: prefix('/api/paralegal'), handler: (req, env) => handleParalegal(req, env) },
  { mode: 'owned', match: prefix('/api/activity'), handler: (req, env) => handleActivity(req, env) },
  { mode: 'owned', match: prefix('/api/files'), handler: (req, env) => handleFiles(req, env) },
  { mode: 'owned', match: exact('/api/analyze'), handler: (req, env) => handleAnalyze(req, env) },
  { mode: 'owned', match: prefix('/api/pdf'), handler: (req, env) => handlePDF(req, env) },
  {
    mode: 'owned',
    match: (path, env) => (path.startsWith('/api/debug') || path.startsWith('/api/test')) && env.ALLOW_DEBUG === 'true',
    handler: (req, env) => handleDebug(req, env),
  },
  { mode: 'owned', match: prefix('/api/status'), handler: (req, env) => handleStatus(req, env) },
  {
    mode: 'owned',
    match: prefix('/api/notifications'),
    handler: withAuth((req, env) => handleNotifications(req, env), { required: true }),
  },
  { mode: 'owned', match: prefix('/api/widget/practice-details/'), handler: (req, env) => handleWidgetPracticeDetails(req, env) },
  { mode: 'owned', match: prefix('/api/practice/details/'), handler: (req, env) => handlePracticeDetails(req, env) },
  {
    mode: 'owned',
    match: prefix('/api/config'),
    // Static-ish public config — edge-cache so cold requests don't hit
    // the handler. Browser cache via Cache-Control still applies.
    handler: withCache((req, env) => handleConfig(req, env), {
      keyFn: () => 'practice:config:static',
    }),
  },
  { mode: 'owned', match: prefix('/api/widget/bootstrap'), handler: (req, env) => handleWidgetBootstrap(req, env) },
  { mode: 'owned', match: prefix('/api/geo/autocomplete'), handler: handleAutocompleteWithCORS },
  { mode: 'owned', match: prefix('/api/conversations'), handler: (req, env) => handleConversations(req, env) },
  {
    mode: 'owned',
    match: prefix('/api/ai/intent'),
    // Stacked middleware (last-applied runs first):
    //   - withRateLimit: 30 req / 60s per IP guards LLM quota first.
    //   - withAuth: required — rejects unauthenticated calls before the
    //     handler runs.
    handler: withRateLimit(
      withAuth((req, env) => handleAiIntent(req, env), { required: true }),
      {
        keyFn: (req) => req.headers.get('CF-Connecting-IP'),
        max: 30,
        windowMs: 60_000,
      },
    ),
  },
  {
    mode: 'owned',
    match: prefix('/api/ai/extract-website'),
    // External fetch + LLM analysis — rate-limit per IP to prevent
    // scraping abuse from a single client. 10 req / 60s.
    handler: withRateLimit((req, env) => handleWebsiteExtract(req, env), {
      keyFn: (req) => req.headers.get('CF-Connecting-IP'),
      max: 10,
      windowMs: 60_000,
    }),
  },
  {
    mode: 'owned',
    match: prefix('/api/tools/search'),
    handler: withAuth((req, env) => handleSearch(req, env), { required: false }),
  },
  {
    mode: 'owned',
    match: prefix('/api/ai/chat'),
    handler: withAuth(handleAiChat, { required: true }),
  },
  {
    mode: 'owned',
    match: exact('/api/metrics/vitals'),
    // Anonymous beacon endpoint — rate-limit per IP to discourage spam.
    handler: withRateLimit((req, env) => handleMetricsVitals(req, env), {
      keyFn: (req) => req.headers.get('CF-Connecting-IP'),
      max: 60,
      windowMs: 60_000,
    }),
  },
  { mode: 'owned', match: exact('/api/health'), handler: (req, env) => handleHealth(req, env) },
  { mode: 'owned', match: exact('/'), handler: (req, env) => handleRoot(req, env) },
];

const apiNotFoundResponse = () =>
  new Response(JSON.stringify({ error: 'API endpoint not found', errorCode: 'NOT_FOUND' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  });

async function handleRequestInternal(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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
    const route = routes.find((r) => r.match(path, env));
    if (route) return await route.handler(request, env, ctx);
    if (path.startsWith('/api/')) return apiNotFoundResponse();
    return await handleRoot(request, env);
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
