import type { Env } from '../types.js';
import { HttpErrors, createSuccessResponse } from '../errorHandler.js';
import { requireAuth } from '../middleware/auth.js';

const CACHE_TTL_MS = 30 * 1000;
const MAX_MATTER_IDS = 100;
const MATTER_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

type SummaryEntry = { matterId: string; totalUnbilled: number | null };
type CacheEntry = { summaries: SummaryEntry[]; expiresAt: number };

const summaryCache = new Map<string, CacheEntry>();
const summaryInflight = new Map<string, Promise<void>>();

const cleanupExpired = () => {
  const now = Date.now();
  for (const [key, entry] of summaryCache.entries()) {
    if (entry.expiresAt <= now) summaryCache.delete(key);
  }
};

const unwrapRecord = (raw: unknown): Record<string, unknown> => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const record = raw as Record<string, unknown>;
  if (record.data && typeof record.data === 'object' && !Array.isArray(record.data)) {
    return unwrapRecord(record.data);
  }
  return record;
};

// Mirrors toUnbilledSummary in invoicesApi.ts — amounts in backend responses are minor units.
const extractTotalUnbilled = (record: Record<string, unknown>): number => {
  const explicitTime = record.unbilledTime && typeof record.unbilledTime === 'object'
    ? record.unbilledTime as Record<string, unknown> : {};
  const explicitExpenses = record.unbilledExpenses && typeof record.unbilledExpenses === 'object'
    ? record.unbilledExpenses as Record<string, unknown> : {};

  let timeAmount: number;
  if (typeof explicitTime.amount === 'number') {
    timeAmount = explicitTime.amount / 100;
  } else {
    const entries = (
      Array.isArray(record.time_entries) ? record.time_entries :
      Array.isArray(record.timeEntries) ? record.timeEntries : []
    ) as Record<string, unknown>[];
    timeAmount = entries.reduce(
      (sum, e) => sum + (typeof e.total === 'number' ? e.total : typeof e.amount === 'number' ? e.amount : 0) / 100,
      0
    );
  }

  let expenseAmount: number;
  if (typeof explicitExpenses.amount === 'number') {
    expenseAmount = explicitExpenses.amount / 100;
  } else {
    const expenses = (Array.isArray(record.expenses) ? record.expenses : []) as Record<string, unknown>[];
    expenseAmount = expenses.reduce(
      (sum, e) => sum + (typeof e.amount === 'number' ? e.amount : 0) / 100,
      0
    );
  }

  return timeAmount + expenseAmount;
};

const fetchOneMatter = async (
  backendUrl: string,
  practiceId: string,
  matterId: string,
  headers: Record<string, string>
): Promise<SummaryEntry> => {
  try {
    const url = `${backendUrl}/api/practice/${encodeURIComponent(practiceId)}/matters/${encodeURIComponent(matterId)}/unbilled`;
    const resp = await fetch(url, { headers });
    if (!resp.ok) return { matterId, totalUnbilled: null };
    const record = unwrapRecord(await resp.json() as unknown);
    return { matterId, totalUnbilled: extractTotalUnbilled(record) };
  } catch {
    return { matterId, totalUnbilled: null };
  }
};

export async function handleBillingSummary(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') throw HttpErrors.methodNotAllowed('Method not allowed');

  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/practice\/([^/]+)\/billing\/summary$/);
  if (!match) throw HttpErrors.notFound('Route not found');

  const practiceId = decodeURIComponent(match[1] ?? '');
  if (!practiceId) throw HttpErrors.badRequest('Practice ID required');

  const authContext = await requireAuth(request, env);
  if (authContext.isAnonymous) throw HttpErrors.forbidden('Access denied');

  const matterIdsParam = url.searchParams.get('matterIds') ?? '';
  const matterIds = matterIdsParam.split(',').map((s) => s.trim()).filter(Boolean);

  if (matterIds.length === 0) return createSuccessResponse({ summaries: [] });
  if (matterIds.length > MAX_MATTER_IDS) throw HttpErrors.badRequest(`Max ${MAX_MATTER_IDS} matter IDs`);
  for (const id of matterIds) {
    if (!MATTER_ID_RE.test(id)) throw HttpErrors.badRequest(`Invalid matter ID: ${id}`);
  }

  if (!env.BACKEND_API_URL) throw HttpErrors.internalServerError('BACKEND_API_URL not configured');

  const cacheKey = `${practiceId}:${authContext.user.id}:${[...matterIds].sort().join(',')}`;

  const cached = summaryCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return createSuccessResponse({ summaries: cached.summaries });
  }
  if (cached) summaryCache.delete(cacheKey);

  const existingInflight = summaryInflight.get(cacheKey);
  if (existingInflight) {
    await existingInflight.catch(() => undefined);
    const refreshed = summaryCache.get(cacheKey);
    if (refreshed && refreshed.expiresAt > Date.now()) {
      return createSuccessResponse({ summaries: refreshed.summaries });
    }
    if (refreshed) summaryCache.delete(cacheKey);
  }

  const forwardHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
  const cookie = request.headers.get('Cookie');
  if (cookie) forwardHeaders['Cookie'] = cookie;
  const authorization = request.headers.get('Authorization');
  if (authorization) forwardHeaders['Authorization'] = authorization;

  let resolveInflight: (() => void) | null = null;
  let rejectInflight: ((reason?: unknown) => void) | null = null;
  const inflightPromise = new Promise<void>((resolve, reject) => {
    resolveInflight = resolve;
    rejectInflight = reject;
  });
  summaryInflight.set(cacheKey, inflightPromise);

  try {
    const summaries = await Promise.all(
      matterIds.map((id) => fetchOneMatter(env.BACKEND_API_URL, practiceId, id, forwardHeaders))
    );

    cleanupExpired();
    summaryCache.set(cacheKey, { summaries, expiresAt: Date.now() + CACHE_TTL_MS });
    (resolveInflight as (() => void))();

    return createSuccessResponse({ summaries });
  } catch (error) {
    (rejectInflight as (reason?: unknown) => void)(error);
    throw error;
  } finally {
    summaryInflight.delete(cacheKey);
  }
}
