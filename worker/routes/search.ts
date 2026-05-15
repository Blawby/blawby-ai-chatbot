import type { Env } from '../types.js';
import { requirePracticeMember, requirePracticeOwner } from '../middleware/auth.js';
import { handleError, HttpErrors } from '../errorHandler.js';
import { Logger } from '../utils/logger.js';
import {
  SearchIndexService,
  type SearchIndexQueryOptions,
} from '../services/SearchIndexService.js';
import { SearchVectorService } from '../services/SearchVectorService.js';
import { SearchIndexEventPublisher } from '../services/SearchIndexEventPublisher.js';
import {
  SearchBackfillService,
  makeBackfillCookieKey,
} from '../services/SearchBackfillService.js';
import {
  parseQuery,
  type SearchScope,
} from '../../src/features/search/utils/parseQuery.js';
import {
  type SearchEntityType,
  type SearchResultItem,
  type SearchGroup,
  type SearchEnvelope,
  SEARCH_ENTITY_LABELS,
} from '../types/search.js';

const RRF_K = 60;
const DEFAULT_GROUP_LIMIT = 8;

const SCOPE_TO_ENTITY: Record<SearchScope, SearchEntityType[]> = {
  clients: ['client'],
  matters: ['matter'],
  invoices: ['invoice'],
  conversations: ['conversation'],
  files: ['file', 'file_chunk'],
  intakes: ['intake'],
  notes: ['note'],
};

const SUCCESS = (
  data: unknown,
  init?: { status?: number; headers?: Record<string, string> },
): Response =>
  new Response(JSON.stringify({ success: true, data }), {
    status: init?.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });

const EMPTY_ENVELOPE = (semanticEnabled: boolean): SearchEnvelope => ({
  groups: [],
  debug: { semanticEnabled, ftsTookMs: 0, vectorTookMs: 0 },
});

function pinKey(practiceId: string, userId: string, pinId?: string): string {
  return pinId
    ? `search-pin:${practiceId}:${userId}:${pinId}`
    : `search-pin:${practiceId}:${userId}:`;
}

function parsePath(pathname: string): {
  practiceId: string;
  action: string | null;
  rest: string[];
} | null {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length < 3 || segments[0] !== 'api' || segments[1] !== 'search') {
    return null;
  }
  const practiceId = segments[2];
  if (!practiceId) return null;
  return {
    practiceId,
    action: segments[3] ?? null,
    rest: segments.slice(4),
  };
}

export async function handleGlobalSearch(
  request: Request,
  env: Env,
  ctx?: ExecutionContext,
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const parsed = parsePath(url.pathname);
    if (!parsed) {
      throw HttpErrors.notFound('Search route not found');
    }
    const { practiceId, action } = parsed;
    const method = request.method.toUpperCase();

    if (!action) {
      if (method !== 'GET') throw HttpErrors.methodNotAllowed();
      return await handleSearchQuery(request, env, practiceId, url, ctx);
    }

    if (action === 'pins') {
      return await handlePins(request, env, practiceId, parsed.rest, method);
    }

    if (action === 'click' && method === 'POST') {
      return await handleClick(request, env, practiceId);
    }

    if (action === 'reindex' && method === 'POST') {
      return await handleReindex(request, env, practiceId);
    }

    if (action === 'index-stats' && method === 'GET') {
      return await handleIndexStats(request, env, practiceId);
    }

    if (action === 'analytics' && method === 'GET') {
      return await handleAnalytics(request, env, practiceId);
    }

    throw HttpErrors.notFound('Search subroute not found');
  } catch (error) {
    return handleError(error);
  }
}

async function handleSearchQuery(
  request: Request,
  env: Env,
  practiceId: string,
  url: URL,
  ctx?: ExecutionContext,
): Promise<Response> {
  const auth = await requirePracticeMember(request, env, practiceId, 'paralegal');

  const q = url.searchParams.get('q')?.trim() ?? '';
  const semanticEnabled = env.SEARCH_SEMANTIC_ENABLED !== 'false';
  if (!q) {
    return SUCCESS(EMPTY_ENVELOPE(semanticEnabled));
  }

  const parsedQ = parseQuery(q);
  const requestedScopes = parsedQ.scopes;
  const limitParam = Number(url.searchParams.get('limit') ?? DEFAULT_GROUP_LIMIT);
  const groupLimit = Number.isFinite(limitParam)
    ? Math.min(Math.max(Math.trunc(limitParam), 1), 25)
    : DEFAULT_GROUP_LIMIT;

  const allowedEntities: SearchEntityType[] = requestedScopes.length === 0
    ? []
    : requestedScopes.flatMap((s) => SCOPE_TO_ENTITY[s]);

  const terms = parsedQ.terms.trim();
  if (!terms) {
    return SUCCESS(EMPTY_ENVELOPE(semanticEnabled));
  }

  const ftsQuery = buildFtsQuery(terms);
  const indexService = new SearchIndexService(env);
  const vectorService = new SearchVectorService(env);

  const ftsStart = Date.now();
  const ftsItemsPromise = indexService
    .query({
      practiceId,
      fts: ftsQuery,
      scopes: allowedEntities.length > 0 ? allowedEntities : undefined,
      limit: groupLimit * 8,
    } satisfies SearchIndexQueryOptions)
    .catch((error) => {
      Logger.warn('FTS query failed', { error: String(error) });
      return [];
    });

  const vectorStart = Date.now();
  const vectorMatchesPromise = semanticEnabled && vectorService.isEnabled()
    ? vectorService.query(terms, practiceId, { topK: groupLimit * 4 }).catch((error) => {
        Logger.warn('Vectorize query failed', { error: String(error) });
        return [];
      })
    : Promise.resolve([]);

  const [ftsItems, vectorMatches] = await Promise.all([
    ftsItemsPromise,
    vectorMatchesPromise,
  ]);
  const ftsTookMs = Date.now() - ftsStart;
  const vectorTookMs = Date.now() - vectorStart;

  const merged = rrfMerge(ftsItems, vectorMatches);

  const filteredByStatusFilter = applyStatusFilter(merged, parsedQ.filters);

  const grouped = groupByEntity(filteredByStatusFilter, groupLimit);

  const envelope: SearchEnvelope = {
    groups: grouped,
    debug: { semanticEnabled, ftsTookMs, vectorTookMs },
  };

  const resultCount = grouped.reduce((sum, g) => sum + g.items.length, 0);
  const logId = crypto.randomUUID();
  const logPromise = env.DB.prepare(
    `INSERT INTO search_query_log
       (id, practice_id, user_id, query, scopes_json, filters_json, result_count, duration_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      logId,
      practiceId,
      auth.user.id,
      q,
      JSON.stringify(parsedQ.scopes),
      JSON.stringify(parsedQ.filters),
      resultCount,
      ftsTookMs + vectorTookMs,
    )
    .run()
    .catch((error) => {
      Logger.warn('search_query_log insert failed', { error: String(error) });
    });
  if (ctx) ctx.waitUntil(logPromise);

  envelope.queryLogId = logId;
  return SUCCESS(envelope, {
    headers: { 'Cache-Control': 'private, max-age=30' },
  });
}

function buildFtsQuery(terms: string): string {
  const cleaned = terms
    .replace(/["]/g, '')
    .split(/\s+/)
    .filter((t) => t.length > 0);
  if (cleaned.length === 0) return '';
  return cleaned.map((t) => `${escapeFts(t)}*`).join(' ');
}

function escapeFts(t: string): string {
  return t.replace(/[^A-Za-z0-9_-]/g, ' ').trim();
}

type VectorMatchLite = { id: string; score: number; metadata: Record<string, unknown> };

function rrfMerge(
  ftsItems: SearchResultItem[],
  vectorMatches: VectorMatchLite[],
): SearchResultItem[] {
  const scores = new Map<string, { item: SearchResultItem; score: number }>();
  ftsItems.forEach((item, rank) => {
    const key = `${item.entityType}:${item.entityId}`;
    const score = 1 / (RRF_K + rank + 1);
    scores.set(key, { item, score });
  });

  vectorMatches.forEach((m, rank) => {
    const entityType = m.metadata.entity_type as SearchEntityType | undefined;
    const entityId = m.metadata.entity_id as string | undefined;
    if (!entityType || !entityId) return;
    const key = `${entityType}:${entityId}`;
    const score = 1 / (RRF_K + rank + 1);
    const existing = scores.get(key);
    if (existing) {
      existing.score += score;
    } else {
      scores.set(key, {
        item: {
          entityType,
          entityId,
          title: (m.metadata.title as string) ?? entityId,
          subtitle: m.metadata.subtitle as string | undefined,
          score,
          metadata: m.metadata,
        },
        score,
      });
    }
  });

  return Array.from(scores.values())
    .sort((a, b) => b.score - a.score)
    .map((s) => ({ ...s.item, score: s.score }));
}

function applyStatusFilter(
  items: SearchResultItem[],
  filters: Record<string, string>,
): SearchResultItem[] {
  if (!filters.status && !filters.archived && !filters.assignee) return items;
  return items.filter((item) => {
    if (filters.status && (item.metadata?.status as string) !== filters.status) return false;
    if (filters.archived === 'true' && !item.archived) return false;
    if (filters.archived === 'false' && item.archived) return false;
    if (filters.assignee && (item.metadata?.assigneeId as string) !== filters.assignee) return false;
    return true;
  });
}

function groupByEntity(items: SearchResultItem[], limit: number): SearchGroup[] {
  const order: SearchEntityType[] = [
    'client',
    'matter',
    'invoice',
    'conversation',
    'file_chunk',
    'file',
    'intake',
    'note',
  ];
  const buckets = new Map<SearchEntityType, SearchResultItem[]>();
  for (const item of items) {
    const list = buckets.get(item.entityType) ?? [];
    list.push(item);
    buckets.set(item.entityType, list);
  }
  const groups: SearchGroup[] = [];
  for (const type of order) {
    const list = buckets.get(type);
    if (!list || list.length === 0) continue;
    const dedupedFiles = type === 'file_chunk' ? collapseFileChunks(list) : list;
    groups.push({
      id: type,
      label: SEARCH_ENTITY_LABELS[type],
      items: dedupedFiles.slice(0, limit),
      hasMore: dedupedFiles.length > limit,
    });
  }
  return groups;
}

function collapseFileChunks(items: SearchResultItem[]): SearchResultItem[] {
  const seen = new Map<string, SearchResultItem>();
  for (const item of items) {
    const fileId = (item.metadata?.fileId as string) ?? item.entityId;
    if (!seen.has(fileId)) seen.set(fileId, item);
  }
  return Array.from(seen.values());
}

async function handlePins(
  request: Request,
  env: Env,
  practiceId: string,
  rest: string[],
  method: string,
): Promise<Response> {
  const auth = await requirePracticeMember(request, env, practiceId, 'paralegal');
  const userId = auth.user.id;
  if (!env.CHAT_SESSIONS) {
    throw HttpErrors.internalServerError('Pin storage unavailable');
  }

  if (method === 'GET') {
    const list = await env.CHAT_SESSIONS.list({ prefix: pinKey(practiceId, userId) });
    const pins = await Promise.all(
      list.keys.map(async (k) => {
        const raw = await env.CHAT_SESSIONS.get(k.name);
        if (!raw) return null;
        try {
          return { id: k.name.split(':').pop(), ...JSON.parse(raw) };
        } catch {
          return null;
        }
      }),
    );
    return SUCCESS(pins.filter(Boolean));
  }

  if (method === 'POST') {
    const body = (await request.json().catch(() => null)) as
      | { entityType?: string; entityId?: string }
      | null;
    if (!body || !body.entityType || !body.entityId) {
      throw HttpErrors.badRequest('entityType and entityId are required');
    }
    const pinId = crypto.randomUUID();
    await env.CHAT_SESSIONS.put(
      pinKey(practiceId, userId, pinId),
      JSON.stringify({
        entityType: body.entityType,
        entityId: body.entityId,
        createdAt: new Date().toISOString(),
      }),
    );
    return SUCCESS({ id: pinId }, { status: 201 });
  }

  if (method === 'DELETE') {
    const pinId = rest[0];
    if (!pinId) throw HttpErrors.badRequest('Pin id required');
    await env.CHAT_SESSIONS.delete(pinKey(practiceId, userId, pinId));
    return SUCCESS({ ok: true });
  }

  throw HttpErrors.methodNotAllowed();
}

async function handleClick(
  request: Request,
  env: Env,
  practiceId: string,
): Promise<Response> {
  await requirePracticeMember(request, env, practiceId, 'paralegal');
  const body = (await request.json().catch(() => null)) as
    | { queryLogId?: string }
    | null;
  if (!body?.queryLogId) {
    throw HttpErrors.badRequest('queryLogId required');
  }
  Logger.info('search.click', { practiceId, queryLogId: body.queryLogId });
  return SUCCESS({ ok: true });
}

async function handleReindex(
  request: Request,
  env: Env,
  practiceId: string,
): Promise<Response> {
  await requirePracticeOwner(request, env, practiceId);

  const cookie = request.headers.get('Cookie') ?? '';
  if (!cookie) {
    throw HttpErrors.unauthorized('Missing session cookie for backfill');
  }

  const cookieKey = makeBackfillCookieKey(practiceId);
  const backfill = new SearchBackfillService(env);
  await backfill.storeCookie(cookieKey, cookie);

  const publisher = new SearchIndexEventPublisher(env);
  await publisher.publishBackfill(practiceId, cookieKey);
  return SUCCESS({ ok: true, cookieKey });
}

async function handleIndexStats(
  request: Request,
  env: Env,
  practiceId: string,
): Promise<Response> {
  await requirePracticeOwner(request, env, practiceId);
  const indexService = new SearchIndexService(env);
  const stats = await indexService.indexStats(practiceId);
  return SUCCESS(stats);
}

async function handleAnalytics(
  request: Request,
  env: Env,
  practiceId: string,
): Promise<Response> {
  await requirePracticeOwner(request, env, practiceId);
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const top = await env.DB.prepare(
    `SELECT query, COUNT(*) as count
       FROM search_query_log
      WHERE practice_id = ? AND created_at >= ?
      GROUP BY query
      ORDER BY count DESC
      LIMIT 20`,
  )
    .bind(practiceId, cutoff)
    .all<{ query: string; count: number }>();

  const zeroResults = await env.DB.prepare(
    `SELECT query, COUNT(*) as count
       FROM search_query_log
      WHERE practice_id = ? AND created_at >= ? AND result_count = 0
      GROUP BY query
      ORDER BY count DESC
      LIMIT 20`,
  )
    .bind(practiceId, cutoff)
    .all<{ query: string; count: number }>();

  return SUCCESS({
    topQueries: top.results ?? [],
    zeroResultQueries: zeroResults.results ?? [],
  });
}
