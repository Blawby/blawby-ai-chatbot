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
  handleSidebarCounts,
  handleMetricsVitals,
  handleReports,
  handlePublicPracticeIntakeSettings,
} from './routes';
import { handleConversations } from './routes/conversations.js';
import { handleGlobalSearch } from './routes/search.js';
import { handlePresence } from './routes/presence.js';
import { handleAiChat } from './routes/aiChat.js';
import { handleAiIntent } from './routes/aiIntent.js';
import { handleGenerateEngagement } from './routes/generateEngagement.js';
import { withAuth, withCache, withRateLimit } from './middleware/compose.js';
import { withEngineerAllowlist } from './middleware/withEngineerAllowlist.js';
import { handleAdminIntakeInspector } from './routes/adminIntakeInspector.js';
import { handleWebsiteExtract } from './routes/handleWebsiteExtract.js';
import { handleSearch } from './routes/handleSearch.js';
import { handleStatus } from './routes/status.js';
import { handleAutocompleteWithCORS } from './routes/api/geo/autocomplete.js';
import { Env } from './types';
import type { NotificationQueueMessage } from './types';
import { handleError } from './errorHandler';
import { withCORS, getCorsConfig } from './middleware/cors';
import { edgeCache } from './utils/edgeCache.js';
import type { ScheduledEvent } from '@cloudflare/workers-types';
import { handleNotificationQueue } from './queues/notificationProcessor.js';
import { handleSearchIndexQueue } from './queues/searchIndexConsumer.js';
import type { SearchIndexEvent } from './types/search.js';

export function validateRequest(request: Request): boolean {
  const contentLength = request.headers.get('content-length');
  if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) {
    return false;
  }

  if (request.method === 'POST') {
    const contentType = request.headers.get('content-type');
    const url = new URL(request.url);
    const isNoBodyEndpoint =
      /^\/api\/practice-client-intakes\/[^/]+\/files\/[^/]+\/confirm$/.test(url.pathname) ||
      /^\/api\/uploads\/[^/]+\/confirm$/.test(url.pathname) ||
      // /api/search/{practiceId}/reindex takes no body — without this, the
      // backfill is unreachable and the search index stays empty for every
      // practice. See worker/routes/search.ts:handleReindex.
      /^\/api\/search\/[^/]+\/reindex$/.test(url.pathname);
    if (!isNoBodyEndpoint && !contentType) {
      return false;
    }
    if (contentType && !contentType.includes('application/json') && !contentType.includes('multipart/form-data')) {
      return false;
    }
  }

  return true;
}

export type RouteHandler = (request: Request, env: Env, ctx: ExecutionContext) => Promise<Response>;
export type RouteMatcher = (path: string, env: Env) => boolean;
export type RouteMode = 'proxy' | 'owned';
export type RouteEntry = {
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
  path.startsWith('/api/engagement-contracts') ||
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
export const routes: RouteEntry[] = [
  { mode: 'proxy', match: prefix('/api/auth'), handler: (req, env) => handleAuthProxy(req, env) },
  { mode: 'proxy', match: regex(/^\/api\/practice\/[^/]+\/team$/), handler: (req, env) => handlePracticeTeam(req, env) },
  {
    mode: 'owned',
    match: regex(/^\/api\/practice\/[^/]+\/billing\/summary$/),
    // Auth declared at the route table — handler reads via getAttachedAuthContext.
    handler: withAuth((req, env) => handleBillingSummary(req, env), { required: true }),
  },
  {
    mode: 'owned',
    match: regex(/^\/api\/practice\/[^/]+\/sidebar\/counts$/),
    handler: withAuth((req, env) => handleSidebarCounts(req, env), { required: true }),
  },
  {
    mode: 'owned',
    match: regex(/^\/api\/practice-client-intakes\/[^/]+\/intake$/),
    handler: (req, env) => handlePublicPracticeIntakeSettings(req, env),
  },
  { mode: 'proxy', match: matchesBackendProxy, handler: (req, env, ctx) => handleBackendProxy(req, env, ctx) },
  { mode: 'proxy', match: prefix('/api/practices'), handler: (req, env) => handlePractices(req, env) },
  { mode: 'owned', match: prefix('/api/paralegal'), handler: (req, env) => handleParalegal(req, env) },
  { mode: 'owned', match: prefix('/api/activity'), handler: (req, env) => handleActivity(req, env) },
  {
    mode: 'owned',
    match: prefix('/api/reports/'),
    handler: withAuth((req, env) => handleReports(req, env), { required: true }),
  },
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
  {
    mode: 'owned',
    match: prefix('/api/conversations'),
    // Anonymous and authenticated users are both admitted; downstream
    // operations gate via requirePracticeMember per-branch where needed.
    handler: withAuth((req, env) => handleConversations(req, env), { required: false }),
  },
  {
    mode: 'owned',
    match: prefix('/api/presence'),
    handler: withAuth((req, env) => handlePresence(req, env), { required: false }),
  },
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
    match: prefix('/api/search/'),
    handler: (req, env, ctx) => handleGlobalSearch(req, env, ctx),
  },
  {
    mode: 'owned',
    match: exact('/api/ai/generate-engagement'),
    handler: withAuth((req, env) => handleGenerateEngagement(req, env), { required: true }),
  },
  {
    mode: 'owned',
    match: prefix('/api/ai/chat'),
    handler: withAuth(handleAiChat, { required: true }),
  },
  {
    mode: 'owned',
    // Admin intake-inspector. Gated by Better-Auth session + engineer email
    // allowlist (INTAKE_INSPECTOR_ENGINEER_EMAILS env var). Two routes:
    //   GET  /api/admin/intake-events/:conversationId
    //   POST /api/admin/intake-events/:conversationId/clear-failure
    // See U9 of docs/plans/2026-05-18-002-feat-strengthen-intake-ai-observability-plan.md.
    match: prefix('/api/admin/intake-events/'),
    handler: withEngineerAllowlist(
      withAuth((req, env) => handleAdminIntakeInspector(req, env), { required: true }),
    ),
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

/**
 * Look up the route entry that owns a given path, or `null` for unmatched
 * paths (caller decides whether to 404 or fall through to handleRoot).
 *
 * Exported for testability — the route table is the single contract for
 * which handler runs for which path, and a unit test can lock in the
 * matchers without booting the runtime.
 */
export const findRoute = (path: string, env: Env): RouteEntry | null =>
  routes.find((r) => r.match(path, env)) ?? null;

const apiNotFoundResponse = () =>
  new Response(JSON.stringify({ error: 'API endpoint not found', errorCode: 'NOT_FOUND' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  });

/**
 * Path prefixes whose mutations change aggregated sidebar counts. Mirrors
 * the frontend list in `src/shared/lib/apiClient.ts`. After a successful
 * non-GET to any of these paths the worker drops cached `sidebar:counts:`
 * entries so the next `/sidebar/counts` call recomputes against fresh
 * upstream data instead of waiting for the 30s TTL to elapse.
 *
 * Per-isolate prefix invalidation is cheap; we don't have practiceId for
 * every URL shape (e.g. `/api/matters/:id`), so we clear the whole
 * `sidebar:counts:` namespace and let the next read repopulate.
 */
const SIDEBAR_COUNT_MUTATION_PREFIXES = [
  '/api/matters',
  '/api/practice-client-intakes',
  '/api/invoices',
  '/api/conversations',
  '/api/uploads',
];

const isMutatingMethod = (method: string): boolean =>
  method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';

const affectsSidebarCounts = (pathname: string): boolean =>
  SIDEBAR_COUNT_MUTATION_PREFIXES.some((p) => pathname.startsWith(p));

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
    const route = findRoute(path, env);
    let response: Response;
    if (route) {
      response = await route.handler(request, env, ctx);
    } else if (path.startsWith('/api/')) {
      return apiNotFoundResponse();
    } else {
      return await handleRoot(request, env);
    }
    if (
      response.status >= 200 && response.status < 300 &&
      isMutatingMethod(request.method) &&
      affectsSidebarCounts(path)
    ) {
      edgeCache.invalidate('sidebar:counts:', /* prefix */ true);
    }
    return response;
  } catch (error) {
    return handleError(error);
  }
}

export const handleRequest = withCORS(handleRequestInternal, getCorsConfig);

async function handleQueue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
  if (batch.queue.startsWith('search-index-events')) {
    return handleSearchIndexQueue(batch as MessageBatch<SearchIndexEvent>, env);
  }
  return handleNotificationQueue(batch as MessageBatch<NotificationQueueMessage>, env);
}

export default {
  fetch: handleRequest,
  queue: handleQueue
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

  const searchPurgeCutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const searchPurgePromise = env.DB.prepare(
    `DELETE FROM search_query_log WHERE created_at < ?`,
  )
    .bind(searchPurgeCutoff)
    .run()
    .then((res) => {
      console.log(`search_query_log purge: removed ${res.meta?.changes ?? 0} rows older than ${searchPurgeCutoff}`);
    })
    .catch((error) => {
      console.error('search_query_log purge failed:', error);
    });

  ctx.waitUntil(Promise.all([cleanupPromise, searchPurgePromise]));
}

export { ChatRoom } from './durable-objects/ChatRoom';
export { ChatCounterObject } from './durable-objects/ChatCounterObject';
export { MatterProgressRoom } from './durable-objects/MatterProgressRoom';
export { PresenceRoom } from './durable-objects/PresenceRoom';
