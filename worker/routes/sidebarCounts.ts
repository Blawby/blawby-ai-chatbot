import type { Env } from '../types.js';
import { HttpErrors, createSuccessResponse } from '../errorHandler.js';
import { getAttachedAuthContext } from '../middleware/compose.js';
import { edgeCache } from '../utils/edgeCache.js';
import { policyTtlMs } from '../utils/cachePolicy.js';
import { Logger } from '../utils/logger.js';
import type { BackendSidebarCounts } from '../types/wire/sidebarCounts.js';

/**
 * GET /api/practice/:id/sidebar/counts
 *
 * Returns per-section counts that drive the unified Sidebar's badges
 * (Pencil GtRGH). All sections fetched in parallel; each one falls back to
 * an empty/omitted result on failure so a single source going down can't
 * blank out the whole sidebar.
 *
 * Sources:
 *   - intakes / per triage_status: backend `?limit=1` queries that read the
 *     existing `data.total` envelope field. 4 small calls in parallel.
 *   - conversations: worker D1 COUNT(*) (total + unread).
 *   - matters: paginate the backend matters list (cap MAX_LIST_PAGES) and
 *     bucket by status into MATTERS_FILTER_MAP groups.
 *   - invoices: same approach using PRACTICE_INVOICES_FILTER_MAP.
 *   - files: worker D1 COUNT(*) over non-deleted files.
 *
 * Pagination cap: the matter/invoice list endpoints don't return a `total`
 * field, so the worker has to read records to bucket them. We cap at
 * MAX_LIST_PAGES * MAX_LIST_PAGE_SIZE records — large practices will see a
 * `+` indicator from the client when the cap hits.
 */

const PRACTICE_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;
const INTAKE_STATUSES = ['pending_review', 'accepted', 'declined'] as const;
type IntakeStatus = typeof INTAKE_STATUSES[number];
// Backend caps `limit` at 100 (validated server-side); larger values 400 out.
// 10 pages × 100 = 1000 records ceiling, same as the previous 5×200 plan but
// without the validation rejection.
const MAX_LIST_PAGES = 10;
const MAX_LIST_PAGE_SIZE = 100;

// Filter buckets — kept in sync with src/shared/config/navConfig.ts. Duplicated
// here because navConfig.ts is a frontend module and the worker shouldn't
// import from src/. Drift here = wrong sub-counts in the sidebar.
const MATTERS_FILTER_MAP: Record<string, string[]> = {
  new: ['first_contact', 'intake_pending', 'conflict_check', 'eligibility'],
  active: ['consultation_scheduled', 'engagement_pending', 'active', 'pleadings_filed', 'discovery', 'mediation', 'pre_trial', 'trial'],
  closing: ['order_entered', 'appeal_pending'],
  closed: ['closed'],
  declined: ['declined', 'conflicted', 'referred'],
};
const INVOICES_FILTER_MAP: Record<string, string[]> = {
  draft: ['draft'],
  sent: ['sent'],
  open: ['open'],
  overdue: ['overdue'],
  paid: ['paid'],
  void: ['void'],
};

const fetchIntakeTotal = async (
  backendUrl: string,
  practiceId: string,
  headers: Record<string, string>,
  status?: IntakeStatus,
): Promise<number> => {
  const params = new URLSearchParams({ page: '1', limit: '1' });
  if (status) params.set('status', status);
  const url = `${backendUrl}/api/practice-client-intakes/${encodeURIComponent(practiceId)}?${params.toString()}`;
  try {
    const resp = await fetch(url, { headers });
    if (!resp.ok) return 0;
    const json = await resp.json() as { data?: { total?: unknown }; total?: unknown };
    const data = json && typeof json === 'object' && json.data && typeof json.data === 'object'
      ? json.data as Record<string, unknown>
      : (json as Record<string, unknown>);
    const total = data?.total;
    return typeof total === 'number' && Number.isFinite(total) && total >= 0 ? Math.floor(total) : 0;
  } catch (error) {
    Logger.warn('sidebar-counts: intake fetch failed', {
      practiceId,
      status: status ?? 'all',
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
};

const fetchIntakeCounts = async (
  backendUrl: string,
  practiceId: string,
  headers: Record<string, string>,
): Promise<BackendSidebarCounts['intakes']> => {
  const [total, ...byStatus] = await Promise.all([
    fetchIntakeTotal(backendUrl, practiceId, headers),
    ...INTAKE_STATUSES.map((s) => fetchIntakeTotal(backendUrl, practiceId, headers, s)),
  ]);
  return {
    total,
    pending_review: byStatus[0],
    accepted: byStatus[1],
    declined: byStatus[2],
  };
};

/**
 * Mirrors `pluckCollection` in src/shared/lib/apiClient.ts: recursively looks
 * for an array under any of `candidateKeys`, descending into `.data` wrappers
 * as needed. The backend wraps responses inconsistently (sometimes
 * `{ success, data: { matters: [...] } }`, sometimes `{ data: [...] }`,
 * sometimes a bare array), so a loose extractor avoids whole-section count
 * regressions when shapes shift.
 */
const extractListArray = (raw: unknown, candidateKeys: readonly string[]): Record<string, unknown>[] => {
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  if (!raw || typeof raw !== 'object') return [];
  const record = raw as Record<string, unknown>;
  for (const key of candidateKeys) {
    const value = record[key];
    if (Array.isArray(value)) return value as Record<string, unknown>[];
  }
  if (record.data) return extractListArray(record.data, candidateKeys);
  return [];
};

const fetchAllList = async (
  backendUrl: string,
  path: string,
  headers: Record<string, string>,
  candidateKeys: readonly string[],
  label: string,
): Promise<Record<string, unknown>[]> => {
  const all: Record<string, unknown>[] = [];
  for (let page = 1; page <= MAX_LIST_PAGES; page += 1) {
    try {
      const url = `${backendUrl}${path}?page=${page}&limit=${MAX_LIST_PAGE_SIZE}`;
      const resp = await fetch(url, { headers });
      if (!resp.ok) {
        // Surface non-OK statuses — without this, an upstream 401/403/500
        // silently produces a zero count and the badge just doesn't render.
        Logger.warn(`sidebar-counts: ${label} page ${page} returned ${resp.status}`, {
          url,
          status: resp.status,
        });
        break;
      }
      const json = await resp.json();
      const items = extractListArray(json, candidateKeys);
      // First page with no extracted items but a non-empty body usually means
      // the response shape doesn't match candidateKeys — log the top-level
      // keys so the schema can be updated.
      if (page === 1 && items.length === 0 && json && typeof json === 'object') {
        Logger.warn(`sidebar-counts: ${label} extractor found 0 items`, {
          topLevelKeys: Object.keys(json as Record<string, unknown>),
          candidateKeys,
        });
      }
      all.push(...items);
      if (items.length < MAX_LIST_PAGE_SIZE) break;
    } catch (error) {
      Logger.warn(`sidebar-counts: ${label} page ${page} fetch failed`, {
        error: error instanceof Error ? error.message : String(error),
      });
      break;
    }
  }
  return all;
};

const bucketByStatus = (
  items: Record<string, unknown>[],
  filterMap: Record<string, string[]>,
): Record<string, number> => {
  const out: Record<string, number> = {};
  // Build status → filter-id reverse index so each item is bucketed in O(1).
  const statusToFilter = new Map<string, string>();
  for (const [filterId, statuses] of Object.entries(filterMap)) {
    for (const s of statuses) statusToFilter.set(s, filterId);
  }
  for (const item of items) {
    const raw = item.status;
    const status = typeof raw === 'string' ? raw.trim() : '';
    if (!status) continue;
    const filterId = statusToFilter.get(status);
    if (filterId) out[filterId] = (out[filterId] ?? 0) + 1;
  }
  return out;
};

const fetchMattersCounts = async (
  backendUrl: string,
  practiceId: string,
  headers: Record<string, string>,
): Promise<BackendSidebarCounts['matters']> => {
  const items = await fetchAllList(
    backendUrl,
    `/api/matters/${encodeURIComponent(practiceId)}`,
    headers,
    ['matters', 'items'],
    'matters',
  );
  return { total: items.length, byStatus: bucketByStatus(items, MATTERS_FILTER_MAP) };
};

const fetchInvoicesCounts = async (
  backendUrl: string,
  practiceId: string,
  headers: Record<string, string>,
): Promise<BackendSidebarCounts['invoices']> => {
  const items = await fetchAllList(
    backendUrl,
    `/api/invoices/${encodeURIComponent(practiceId)}`,
    headers,
    ['invoices', 'items'],
    'invoices',
  );
  return { total: items.length, byStatus: bucketByStatus(items, INVOICES_FILTER_MAP) };
};

const fetchFilesCount = async (
  env: Env,
  practiceId: string,
): Promise<BackendSidebarCounts['files']> => {
  try {
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM files WHERE practice_id = ? AND is_deleted = FALSE`
    )
      .bind(practiceId)
      .first<{ n: number }>();
    return { total: typeof row?.n === 'number' ? row.n : 0 };
  } catch (error) {
    Logger.warn('sidebar-counts: files D1 query failed', {
      practiceId,
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
};

/**
 * Fetch every accepted-triage intake's `conversation_id` from the backend.
 * Mirrors `useWorkspaceConversations` on the frontend: the practice inbox
 * shows a conversation only when (a) it has a matter linked, or (b) there is
 * an accepted intake referencing it. Without this set, the badge over-counts
 * raw conversations the user wouldn't actually see when they click Inbox.
 */
const fetchAcceptedIntakeConversationIds = async (
  backendUrl: string,
  practiceId: string,
  headers: Record<string, string>,
): Promise<Set<string>> => {
  const ids = new Set<string>();
  for (let page = 1; page <= MAX_LIST_PAGES; page += 1) {
    try {
      const url = `${backendUrl}/api/practice-client-intakes/${encodeURIComponent(practiceId)}?page=${page}&limit=${MAX_LIST_PAGE_SIZE}&status=accepted`;
      const resp = await fetch(url, { headers });
      if (!resp.ok) break;
      const json = await resp.json();
      const items = extractListArray(json, ['intakes', 'items']);
      for (const item of items) {
        const cid = typeof item.conversation_id === 'string' ? item.conversation_id.trim() : '';
        if (cid) ids.add(cid);
      }
      if (items.length < MAX_LIST_PAGE_SIZE) break;
    } catch (error) {
      Logger.warn('sidebar-counts: accepted intakes fetch failed', {
        page,
        error: error instanceof Error ? error.message : String(error),
      });
      break;
    }
  }
  return ids;
};

type ConversationRow = {
  id: string;
  matter_id: string | null;
  assigned_to: string | null;
  status: string | null;
  tags: string | null;
  latest_seq: number | null;
  last_read_seq: number | null;
};

const fetchConversationCounts = async (
  env: Env,
  practiceId: string,
  userId: string,
  acceptedIntakeConversationIds: Set<string>,
): Promise<BackendSidebarCounts['conversations']> => {
  // Pull the rows we need once, bucket in JS. Cheaper than 5+ COUNT queries
  // each repeating the same JOINs, and lets us apply the same visibility
  // filter the frontend uses (matter_id != null OR has accepted intake).
  let rows: ConversationRow[];
  try {
    const result = await env.DB.prepare(
      `SELECT
         c.id,
         c.matter_id,
         c.assigned_to,
         c.status,
         c.tags,
         c.latest_seq,
         COALESCE(r.last_read_seq, 0) AS last_read_seq
       FROM conversations c
       LEFT JOIN conversation_read_state r
         ON r.conversation_id = c.id AND r.user_id = ?
       WHERE c.practice_id = ?`
    )
      .bind(userId, practiceId)
      .all<ConversationRow>();
    rows = result.results ?? [];
  } catch (error) {
    Logger.warn('sidebar-counts: conversations D1 query failed', {
      practiceId,
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
  // Same predicate as shouldShowConversationInPracticeInbox with
  // requireAcceptedIntakeRecord: status must be active or have an intake
  // record, AND must have a matter_id or an accepted intake link.
  const visible = rows.filter((row) => {
    const hasIntake = row.id ? acceptedIntakeConversationIds.has(row.id) : false;
    const isActive = row.status === 'active' || hasIntake;
    if (!isActive) return false;
    return Boolean(row.matter_id) || hasIntake;
  });

  const isAssignedToUser = (row: ConversationRow) =>
    typeof row.assigned_to === 'string' && row.assigned_to === userId;
  const isUnassigned = (row: ConversationRow) =>
    !row.assigned_to || row.assigned_to.trim() === '';
  const hasMentionTag = (row: ConversationRow) => {
    if (!row.tags) return false;
    try {
      const parsed = JSON.parse(row.tags);
      return Array.isArray(parsed) && parsed.some(
        (tag) => typeof tag === 'string' && tag.toLowerCase().includes('mention'),
      );
    } catch {
      return false;
    }
  };
  const isUnread = (row: ConversationRow) =>
    (row.latest_seq ?? 0) > (row.last_read_seq ?? 0);

  const total = visible.length;
  return {
    total,
    unread: visible.filter(isUnread).length,
    byFilter: {
      all: total,
      'your-inbox': visible.filter(isAssignedToUser).length,
      'assigned-to-me': visible.filter(isAssignedToUser).length,
      mentions: visible.filter(hasMentionTag).length,
      unassigned: visible.filter(isUnassigned).length,
    },
  };
};

export async function handleSidebarCounts(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') throw HttpErrors.methodNotAllowed('Method not allowed');

  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/practice\/([^/]+)\/sidebar\/counts$/);
  if (!match) throw HttpErrors.notFound('Route not found');

  const practiceId = decodeURIComponent(match[1] ?? '');
  if (!practiceId) throw HttpErrors.badRequest('Practice ID required');
  if (!PRACTICE_ID_RE.test(practiceId)) throw HttpErrors.badRequest('Invalid practice ID');

  const authContext = getAttachedAuthContext(request);
  if (!authContext) throw HttpErrors.unauthorized('Authentication required');
  if (authContext.isAnonymous) throw HttpErrors.forbidden('Access denied');

  const userId = authContext.user.id;
  if (!userId) throw HttpErrors.unauthorized('Authentication required');

  if (!env.BACKEND_API_URL) throw HttpErrors.internalServerError('BACKEND_API_URL not configured');

  const forwardHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
  const cookie = request.headers.get('Cookie');
  if (cookie) forwardHeaders['Cookie'] = cookie;
  const authorization = request.headers.get('Authorization');
  if (authorization) forwardHeaders['Authorization'] = authorization;

  const cacheKey = `sidebar:counts:${practiceId}:${userId}`;

  const counts = await edgeCache.get_or_fetch<BackendSidebarCounts>(
    cacheKey,
    async () => {
      // Conversations need accepted-intake conversation_ids first to apply
      // the same visibility filter the practice inbox uses; everything else
      // runs in parallel.
      const [intakes, acceptedIntakeIds, matters, invoices, files] = await Promise.all([
        fetchIntakeCounts(env.BACKEND_API_URL, practiceId, forwardHeaders),
        fetchAcceptedIntakeConversationIds(env.BACKEND_API_URL, practiceId, forwardHeaders),
        fetchMattersCounts(env.BACKEND_API_URL, practiceId, forwardHeaders),
        fetchInvoicesCounts(env.BACKEND_API_URL, practiceId, forwardHeaders),
        fetchFilesCount(env, practiceId),
      ]);
      const conversations = await fetchConversationCounts(env, practiceId, userId, acceptedIntakeIds);
      return { intakes, conversations, matters, invoices, files };
    },
    { ttlMs: policyTtlMs(cacheKey) },
  );

  return createSuccessResponse(counts);
}
