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
import { matchReports } from '../utils/reportsCatalog.js';
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
  reports: ['report'],
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

    if (action === 'suggest' && method === 'GET') {
      return await handleSuggest(request, env, practiceId, url);
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

  // Optional LLM rewrite: expand the user query into structured scope/filters.
  // Gated behind env.SEARCH_LLM_REWRITE_ENABLED so we don't add latency/cost
  // to every query — opt-in when telemetry shows users typing NL queries.
  const llmRewritten = await maybeLlmRewrite(env, q);
  const expandedQuery = llmRewritten?.terms ?? q;
  const parsedQ = parseQuery(expandedQuery);
  if (llmRewritten?.scopes) {
    for (const s of llmRewritten.scopes) {
      if (!parsedQ.scopes.includes(s)) parsedQ.scopes.push(s);
    }
  }
  if (llmRewritten?.filters) {
    Object.assign(parsedQ.filters, llmRewritten.filters);
  }
  // Synonym expansion now happens INSIDE buildFtsQuery (per-term OR
  // alternation). The old applyLegalSynonyms() concatenated synonyms onto
  // parsed.terms, which FTS5 then treated as AND — breaking the base query.

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

  const ctrPromise = loadCtrBoosts(env, practiceId, terms);

  const [ftsItems, vectorMatches, ctrByKey] = await Promise.all([
    ftsItemsPromise,
    vectorMatchesPromise,
    ctrPromise,
  ]);
  const ftsTookMs = Date.now() - ftsStart;
  const vectorTookMs = Date.now() - vectorStart;

  let merged = rrfMerge(ftsItems, vectorMatches, {
    recencyHalfLifeDays: 30,
    ctrByKey,
  });

  // Optional cross-encoder rerank on top-K to bump precision. Gated behind
  // env.SEARCH_RERANK_ENABLED because it costs one extra Workers AI call.
  if (env.SEARCH_RERANK_ENABLED === 'true' && merged.length > 1) {
    merged = await maybeRerank(env, terms, merged, 20);
  }

  // Personalization: boost entities the current user has touched recently.
  merged = await applyPersonalization(env, auth.user.id, practiceId, merged);

  const filteredByStatusFilter = applyStatusFilter(merged, parsedQ.filters);

  // Reports are navigational entries (no D1 backing) — match against a
  // static catalog and merge into the result stream as entityType='report'
  // items. Honor the in:reports scope: if the user explicitly scoped away
  // from reports, skip the merge; if they scoped TO reports, only show
  // reports.
  const allowReports =
    requestedScopes.length === 0 || requestedScopes.includes('reports');
  const onlyReports =
    requestedScopes.length > 0 && requestedScopes.every((s) => s === 'reports');
  let withReports = filteredByStatusFilter;
  if (allowReports) {
    const reportMatches = matchReports(terms, groupLimit);
    if (reportMatches.length > 0) {
      const reportItems: SearchResultItem[] = reportMatches.map((r) => ({
        entityType: 'report' as SearchEntityType,
        entityId: r.id,
        title: r.title,
        subtitle: r.subtitle,
        // Use a relative score so reports interleave with other groups
        // when ungrouped; groupByEntity buckets them anyway so this only
        // affects within-Reports ordering.
        score: r.score,
        metadata: {},
      }));
      withReports = onlyReports
        ? reportItems
        : [...filteredByStatusFilter, ...reportItems];
    } else if (onlyReports) {
      withReports = [];
    }
  } else {
    // Scope explicitly excludes reports: nothing to add.
    withReports = filteredByStatusFilter;
  }

  const grouped = groupByEntity(withReports, groupLimit);

  const envelope: SearchEnvelope = {
    groups: grouped,
    debug: { semanticEnabled, ftsTookMs, vectorTookMs },
  };

  // Did-you-mean: on zero results, fire a single Vectorize nearest-neighbor
  // and surface the top title as a suggestion. Mostly useful for typos that
  // FTS5 misses but semantic embedding catches.
  if (grouped.length === 0 && semanticEnabled && vectorService.isEnabled()) {
    const fallback = await vectorService
      .query(q, practiceId, { topK: 1 })
      .catch(() => []);
    if (fallback.length > 0) {
      const m = fallback[0];
      envelope.didYouMean = {
        title: (m.metadata.title as string) ?? null,
        entityType: m.metadata.entity_type as SearchEntityType,
        entityId: m.metadata.entity_id as string,
        score: m.score,
      };
    }
  }

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

// === Tier 1: /suggest ============================================

async function handleSuggest(
  request: Request,
  env: Env,
  practiceId: string,
  url: URL,
): Promise<Response> {
  const auth = await requirePracticeMember(request, env, practiceId, 'paralegal');
  const prefix = url.searchParams.get('q')?.trim().toLowerCase() ?? '';
  if (prefix.length === 0) {
    return SUCCESS({ suggestions: [] });
  }

  // Total suggestions capped at 1 — per user feedback, more than one entry
  // here clutters the dropdown. Prefer user history when present; fall
  // back to the single most-popular practice-wide query otherwise.
  const SUGGESTION_LIMIT = 1;
  const userRows = await env.DB.prepare(
    `SELECT DISTINCT query
       FROM search_query_log
      WHERE practice_id = ?
        AND user_id = ?
        AND result_count > 0
        AND lower(query) LIKE ?
      ORDER BY created_at DESC
      LIMIT ?`,
  )
    .bind(practiceId, auth.user.id, `${prefix}%`, SUGGESTION_LIMIT)
    .all<{ query: string }>();

  const suggestions: Array<{ query: string; source: 'user' | 'practice' }> = [];
  const seen = new Set<string>();
  for (const r of userRows.results ?? []) {
    const norm = r.query.trim();
    if (!norm || seen.has(norm.toLowerCase())) continue;
    seen.add(norm.toLowerCase());
    suggestions.push({ query: norm, source: 'user' });
    if (suggestions.length >= SUGGESTION_LIMIT) break;
  }

  // Only query the practice pool if user history didn't fill the cap.
  if (suggestions.length < SUGGESTION_LIMIT) {
    const practiceRows = await env.DB.prepare(
      `SELECT query, COUNT(*) as c
         FROM search_query_log
        WHERE practice_id = ?
          AND result_count > 0
          AND lower(query) LIKE ?
        GROUP BY query
        ORDER BY c DESC
        LIMIT ?`,
    )
      .bind(practiceId, `${prefix}%`, SUGGESTION_LIMIT)
      .all<{ query: string; c: number }>();

    for (const r of practiceRows.results ?? []) {
      const norm = r.query.trim();
      if (!norm || seen.has(norm.toLowerCase())) continue;
      seen.add(norm.toLowerCase());
      suggestions.push({ query: norm, source: 'practice' });
      if (suggestions.length >= SUGGESTION_LIMIT) break;
    }
  }

  return SUCCESS(
    { suggestions },
    { headers: { 'Cache-Control': 'private, max-age=60' } },
  );
}

// === Tier 2: cross-encoder rerank ================================

async function maybeRerank(
  env: Env,
  query: string,
  items: SearchResultItem[],
  topK: number,
): Promise<SearchResultItem[]> {
  if (!env.AI || items.length <= 1) return items;
  const head = items.slice(0, topK);
  const tail = items.slice(topK);

  try {
    const result = (await (env.AI as unknown as {
      run(model: string, input: unknown): Promise<{ response?: Array<{ score: number; corpus_id: number }> }>;
    }).run('@cf/baai/bge-reranker-base', {
      query,
      contexts: head.map((it) => ({
        text: `${it.title}\n${it.subtitle ?? ''}\n${(it.snippet ?? '').replace(/<\/?mark>/g, '')}`,
      })),
    })) as { response?: Array<{ score: number; corpus_id: number }> };

    const scored = result.response;
    if (!scored || scored.length === 0) return items;
    const reordered = scored
      .slice()
      .sort((a, b) => b.score - a.score)
      .map((s) => head[s.corpus_id])
      .filter((x): x is SearchResultItem => Boolean(x));
    return [...reordered, ...tail];
  } catch (error) {
    Logger.warn('rerank failed', { error: String(error) });
    return items;
  }
}

// === Tier 3a: LLM query rewriting ================================

type LlmRewriteOutput = {
  terms: string;
  scopes?: Array<'clients' | 'matters' | 'invoices' | 'conversations' | 'files' | 'intakes' | 'notes'>;
  filters?: Record<string, string>;
};

async function maybeLlmRewrite(env: Env, rawQuery: string): Promise<LlmRewriteOutput | null> {
  if (env.SEARCH_LLM_REWRITE_ENABLED !== 'true' || !env.AI) return null;
  if (rawQuery.length < 10 || rawQuery.length > 500) return null; // skip short keyword queries and bizarre length

  const systemPrompt =
    `You convert legal-practice search queries into structured JSON. ` +
    `Output ONLY a JSON object with keys: ` +
    `"terms" (string, free-text remainder), ` +
    `"scopes" (optional array of: clients, matters, invoices, conversations, files, intakes, notes), ` +
    `"filters" (optional object with keys status/archived/assignee). ` +
    `Do not include any commentary.`;

  try {
    const result = (await (env.AI as unknown as {
      run(model: string, input: unknown): Promise<{ response?: string }>;
    }).run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: rawQuery },
      ],
      max_tokens: 200,
    })) as { response?: string };

    const text = (result.response ?? '').trim();
    if (!text) return null;
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');
    if (jsonStart < 0 || jsonEnd <= jsonStart) return null;
    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as LlmRewriteOutput;
    if (typeof parsed.terms !== 'string') return null;
    return parsed;
  } catch (error) {
    Logger.debug('LLM rewrite failed/skipped', { error: String(error) });
    return null;
  }
}

// === Tier 3b: personalization ====================================

async function applyPersonalization(
  env: Env,
  userId: string,
  practiceId: string,
  items: SearchResultItem[],
): Promise<SearchResultItem[]> {
  if (items.length === 0) return items;
  // Boost items the user has previously clicked in search (proxy for relevance).
  // Note: search_query_log doesn't currently carry per-result clicks, only
  // queryLogId. Without a dedicated click table, this is best-effort using
  // the user's recent OWN queries that resolved to results.
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const rows = await env.DB.prepare(
      `SELECT DISTINCT lower(query) as q
         FROM search_query_log
        WHERE user_id = ? AND practice_id = ? AND created_at >= ? AND result_count > 0
        LIMIT 50`,
    )
      .bind(userId, practiceId, cutoff)
      .all<{ q: string }>();

    const userTokens = new Set<string>();
    for (const r of rows.results ?? []) {
      for (const tok of r.q.split(/\s+/).filter(Boolean)) userTokens.add(tok);
    }
    if (userTokens.size === 0) return items;

    return items
      .map((item) => {
        const haystack = `${item.title} ${item.subtitle ?? ''}`.toLowerCase();
        let hits = 0;
        for (const tok of userTokens) {
          if (haystack.includes(tok)) hits += 1;
        }
        const boost = 1 + Math.min(hits * 0.05, 0.25); // up to +25%
        return { ...item, score: item.score * boost };
      })
      .sort((a, b) => b.score - a.score);
  } catch (error) {
    Logger.debug('personalization skipped', { error: String(error) });
    return items;
  }
}

// === Tier 3c: legal-domain synonyms ==============================

const LEGAL_SYNONYMS: Record<string, string[]> = {
  depo: ['deposition'],
  deposition: ['depo'],
  complaint: ['petition', 'filing'],
  petition: ['complaint', 'filing'],
  inv: ['invoice'],
  invoice: ['inv'],
  client: ['contact'],
  contact: ['client'],
  matter: ['case'],
  case: ['matter'],
  pi: ['personal injury'],
};


/**
 * FTS5 query builder.
 *
 * Supports:
 *   - Bare terms: `steve smith`        → `steve* smith*`     (prefix-match)
 *   - Exact phrase: `"smith v jones"`  → `"smith v jones"`   (FTS5 phrase)
 *   - Field operators: `title:steve`   → `{title:steve*}`    (FTS5 column filter)
 *
 * Recognized field names match the indexed columns: title, subtitle, body.
 */
const FTS_FIELDS = new Set(['title', 'subtitle', 'body']);

function buildFtsQuery(terms: string): string {
  if (!terms || terms.trim().length === 0) return '';

  const tokens: string[] = [];
  let i = 0;
  while (i < terms.length) {
    const ch = terms[i];
    if (ch === ' ' || ch === '\t' || ch === '\n') {
      i += 1;
      continue;
    }
    if (ch === '"') {
      // Exact phrase. Scan until closing quote or end of string.
      const close = terms.indexOf('"', i + 1);
      if (close === -1) {
        // Unterminated quote — consume rest as a phrase.
        const phrase = terms.slice(i + 1).trim();
        if (phrase) tokens.push(`"${escapeFtsPhrase(phrase)}"`);
        break;
      }
      const phrase = terms.slice(i + 1, close).trim();
      if (phrase) tokens.push(`"${escapeFtsPhrase(phrase)}"`);
      i = close + 1;
      continue;
    }

    // Read until next whitespace
    let end = i;
    while (end < terms.length && terms[end] !== ' ' && terms[end] !== '\t' && terms[end] !== '\n') {
      end += 1;
    }
    const raw = terms.slice(i, end);
    i = end;

    const colonIdx = raw.indexOf(':');
    if (colonIdx > 0 && colonIdx < raw.length - 1) {
      const field = raw.slice(0, colonIdx).toLowerCase();
      const value = raw.slice(colonIdx + 1);
      if (FTS_FIELDS.has(field)) {
        const safe = escapeFtsTerm(value);
        if (safe) tokens.push(`{${field}:${expandWithSynonyms(safe)}}`);
        continue;
      }
    }
    const safe = escapeFtsTerm(raw);
    if (safe) tokens.push(expandWithSynonyms(safe));
  }

  // Use explicit AND between tokens. FTS5 normally allows implicit AND on
  // whitespace, but it errors on `term* (alt OR alt)` — needs the keyword.
  // Explicit AND is always safe and produces identical results for bare-term
  // sequences too.
  return tokens.join(' AND ');
}

/**
 * Expand a bare term with legal-domain synonyms as an FTS5 OR alternation.
 *   "matter" -> "(matter* OR case*)"
 *   "depo"   -> "(depo* OR deposition*)"
 *   "foo"    -> "foo*"
 * Synonyms are alternatives — must NOT be AND'd in with the original term
 * (a previous version concatenated them onto parsed.terms which made FTS5
 * require ALL synonyms together, effectively breaking the base query).
 */
function expandWithSynonyms(safeTerm: string): string {
  const lower = safeTerm.toLowerCase();
  const synonyms = LEGAL_SYNONYMS[lower];
  if (!synonyms || synonyms.length === 0) return `${safeTerm}*`;
  const cleaned = synonyms
    .map((s) => escapeFtsTerm(s))
    .filter((s) => s.length > 0)
    .map((s) => `${s}*`);
  if (cleaned.length === 0) return `${safeTerm}*`;
  return `(${[`${safeTerm}*`, ...cleaned].join(' OR ')})`;
}

function escapeFtsTerm(t: string): string {
  return t.replace(/[^A-Za-z0-9_-]/g, ' ').trim();
}

function escapeFtsPhrase(t: string): string {
  // FTS5 phrase tokens accept letters/digits/space; strip everything else.
  return t.replace(/[^A-Za-z0-9_\- ]/g, ' ').replace(/\s+/g, ' ').trim();
}

type VectorMatchLite = { id: string; score: number; metadata: Record<string, unknown> };

type RrfOptions = {
  recencyHalfLifeDays?: number; // 0 disables recency boost
  ctrByKey?: Map<string, number>; // key='entityType:entityId' → multiplier
};

/**
 * Reciprocal Rank Fusion with optional recency + click-through boosts.
 *
 * Base RRF: `score(d) = sum_r 1 / (k + rank_r(d))` over each retrieval source.
 * Recency boost: `score *= 1 + 0.5 * exp(-ageDays / halfLife)` so a new
 * record gets +50% and a 30-day-old record gets ~+18% with the default
 * 30-day half-life. Pure relevance still wins for very old + highly
 * matching records — recency tips ties.
 * CTR boost: per-entity multiplier from search_query_log clicks; `1.0`
 * if no history yet.
 */
function rrfMerge(
  ftsItems: SearchResultItem[],
  vectorMatches: VectorMatchLite[],
  options: RrfOptions = {},
): SearchResultItem[] {
  const halfLife = options.recencyHalfLifeDays ?? 30;
  const ctrByKey = options.ctrByKey ?? new Map<string, number>();
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

  return Array.from(scores.entries())
    .map(([key, s]) => {
      let boosted = s.score;
      if (halfLife > 0) boosted *= recencyMultiplier(s.item.metadata, halfLife);
      const ctr = ctrByKey.get(key);
      if (ctr && ctr > 0) boosted *= 1 + ctr;
      return { item: s.item, score: boosted };
    })
    .sort((a, b) => b.score - a.score)
    .map((s) => ({ ...s.item, score: s.score }));
}

function recencyMultiplier(
  metadata: Record<string, unknown> | undefined,
  halfLifeDays: number,
): number {
  if (!metadata) return 1;
  const raw =
    (metadata.updatedAt as string | undefined) ??
    (metadata.updated_at as string | undefined) ??
    (metadata.createdAt as string | undefined) ??
    (metadata.created_at as string | undefined) ??
    null;
  if (!raw) return 1;
  const ts = Date.parse(raw);
  if (!Number.isFinite(ts)) return 1;
  const ageDays = (Date.now() - ts) / (24 * 60 * 60 * 1000);
  if (ageDays <= 0) return 1.5;
  return 1 + 0.5 * Math.exp(-ageDays / halfLifeDays);
}

async function loadCtrBoosts(
  env: Env,
  practiceId: string,
  rawQuery: string,
): Promise<Map<string, number>> {
  // Look at the last 7 days of /click events for queries whose result_count > 0
  // and whose query string roughly matches. We weight by total clicks per entity.
  // The 'roughly matches' is a fuzzy substring on the normalized query to keep
  // the read cheap; precise per-query lookup would need a click-per-result join.
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const normalized = rawQuery.trim().toLowerCase();
  if (!normalized) return new Map();
  try {
    // We only have aggregate clicks in search_query_log today; future schema
    // change would add a search_click_events table. For now: any query that
    // shares a leading token with the current query contributes a small boost.
    const firstToken = normalized.split(/\s+/)[0];
    if (!firstToken || firstToken.length < 2) return new Map();
    const rows = await env.DB.prepare(
      `SELECT query
         FROM search_query_log
        WHERE practice_id = ? AND created_at >= ?
              AND lower(query) LIKE ?
              AND result_count > 0
        ORDER BY created_at DESC
        LIMIT 200`,
    )
      .bind(practiceId, cutoff, `${firstToken}%`)
      .all<{ query: string }>();
    const map = new Map<string, number>();
    // Without per-result click data, we can't credit specific entities yet —
    // return an empty map. Future: read search_click_events and credit each
    // entity_id with click counts.
    if (!rows.results || rows.results.length === 0) return map;
    return map;
  } catch (error) {
    Logger.warn('CTR load failed', { error: String(error) });
    return new Map();
  }
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
    'report',
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
