/**
 * GET /api/practice/:practiceId/matter-summary/:matterId
 *
 * Single aggregation endpoint that fans out to 5 sources in parallel and
 * returns everything the focus drawer needs in one request. Replaces 4–5
 * sequential client-side fetches with one edge-cached response.
 *
 * Query params:
 *   clientId  – optional, the matter's client UUID (avoids an extra matter fetch)
 */
import type { Env } from '../types.js';
import { HttpErrors } from '../errorHandler.js';
import { getAttachedAuthContext } from '../middleware/compose.js';
import { edgeCache } from '../utils/edgeCache.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function buildForwardHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const cookie = request.headers.get('Cookie');
  const authorization = request.headers.get('Authorization');
  if (cookie) headers['Cookie'] = cookie;
  if (authorization) headers['Authorization'] = authorization;
  return headers;
}

async function backendGet(
  backendUrl: string,
  path: string,
  headers: Record<string, string>,
): Promise<unknown> {
  const res = await fetch(`${backendUrl.replace(/\/+$/, '')}${path}`, { headers });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

// ── Parsers ───────────────────────────────────────────────────────────────────

function parseUnbilled(data: unknown): { hours: number; amount: number } {
  if (!data || typeof data !== 'object') return { hours: 0, amount: 0 };
  const r = data as Record<string, unknown>;

  // Structured form: { unbilledTime: { hours, amount }, unbilledExpenses: { amount } }
  const timeObj = r.unbilledTime as Record<string, unknown> | undefined;
  if (timeObj && typeof timeObj.hours === 'number') {
    const expObj = r.unbilledExpenses as Record<string, unknown> | undefined;
    const expAmount = typeof expObj?.amount === 'number' ? expObj.amount / 100 : 0;
    const timeAmount = typeof timeObj.amount === 'number' ? timeObj.amount / 100 : 0;
    return { hours: timeObj.hours, amount: timeAmount + expAmount };
  }

  // Raw form: { time_entries: [...], expenses: [...] }
  const entries = Array.isArray(r.time_entries) ? r.time_entries as Record<string, unknown>[] : [];
  const expenses = Array.isArray(r.expenses) ? r.expenses as Record<string, unknown>[] : [];

  const hours = entries.reduce((sum, e) => {
    const mins = typeof e.duration_minutes === 'number' ? e.duration_minutes : 0;
    return sum + mins / 60;
  }, 0);

  const entryAmount = entries.reduce((sum, e) => {
    const total = typeof e.total === 'number' ? e.total : 0;
    return sum + total / 100;
  }, 0);

  const expAmount = expenses.reduce((sum, e) => {
    const amount = typeof e.amount === 'number' ? e.amount : 0;
    return sum + amount / 100;
  }, 0);

  return { hours: Math.round(hours * 10) / 10, amount: entryAmount + expAmount };
}

function parseSolDate(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const r = data as Record<string, unknown>;
  const list = Array.isArray(r.deadlines) ? r.deadlines as Record<string, unknown>[] : [];
  const sol = list.find((d) => d.type === 'statutory');
  if (!sol?.date || typeof sol.date !== 'string') return null;
  const d = new Date(sol.date);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function parseActivityFeed(data: unknown): Array<{ id: string; description: string; createdAt: string }> {
  if (!data || typeof data !== 'object') return [];
  const r = data as Record<string, unknown>;
  const all = Array.isArray(r.activities) ? r.activities as Record<string, unknown>[] : [];
  return all.slice(0, 5).map((a) => ({
    id: String(a.id ?? ''),
    description: String(a.description ?? a.activity_type ?? ''),
    createdAt: String(a.created_at ?? ''),
  }));
}

function parseActivityCount(data: unknown): number {
  if (!data || typeof data !== 'object') return 0;
  const r = data as Record<string, unknown>;
  return typeof r.count === 'number' ? r.count : 0;
}

function parseClient(data: unknown): { name: string | null; phone: string | null } {
  if (!data || typeof data !== 'object') return { name: null, phone: null };
  const r = data as Record<string, unknown>;
  // listUserDetails wraps in { data: [...] }; getUserDetail may return record directly
  const record = Array.isArray((r as Record<string, unknown>).data)
    ? ((r as Record<string, unknown>).data as Record<string, unknown>[])[0]
    : r;
  if (!record || typeof record !== 'object') return { name: null, phone: null };
  const user = (record as Record<string, unknown>).user as Record<string, unknown> | undefined;
  return {
    name: typeof user?.name === 'string' ? user.name : null,
    phone: typeof user?.phone === 'string' ? user.phone : null,
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export interface MatterSummaryPayload {
  unbilledHours: number;
  unbilledAmount: number;
  solDate: string | null;
  activities: Array<{ id: string; description: string; createdAt: string }>;
  eventCount30d: number;
  clientName: string | null;
  clientPhone: string | null;
  stagedActions: Array<{ id: string; title: string; description: string }>;
}

export async function handleMatterSummary(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') throw HttpErrors.methodNotAllowed('Method not allowed');

  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/practice\/([^/]+)\/matter-summary\/([^/]+)$/);
  if (!match) throw HttpErrors.notFound('Route not found');

  const practiceId = decodeURIComponent(match[1] ?? '');
  const matterId = decodeURIComponent(match[2] ?? '');
  if (!practiceId || !matterId) throw HttpErrors.badRequest('practiceId and matterId required');
  if (!UUID_RE.test(matterId)) throw HttpErrors.badRequest('Invalid matterId format');

  const authContext = getAttachedAuthContext(request);
  if (!authContext) throw HttpErrors.unauthorized('Authentication required');
  if (authContext.isAnonymous) throw HttpErrors.forbidden('Access denied');

  if (!env.BACKEND_API_URL) throw HttpErrors.internalServerError('BACKEND_API_URL not configured');

  const clientId = url.searchParams.get('clientId') ?? null;
  const cacheKey = `matter-summary:${practiceId}:${matterId}:${clientId ?? 'none'}:${authContext.user.id}`;
  const headers = buildForwardHeaders(request);
  const base = env.BACKEND_API_URL.replace(/\/+$/, '');

  const payload = await edgeCache.get_or_fetch<MatterSummaryPayload>(
    cacheKey,
    async () => {
      const matterBase = `/api/matters/${encodeURIComponent(practiceId)}/${encodeURIComponent(matterId)}`;

      const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const [unbilledRes, deadlinesRes, activityFeedRes, activityCountRes, clientRes, stagedRows] = await Promise.allSettled([
        backendGet(base, `${matterBase}/unbilled`, headers),
        backendGet(base, `${matterBase}/deadlines`, headers),
        backendGet(base, `${matterBase}/activity?limit=5`, headers),
        backendGet(base, `${matterBase}/activity/count?since=${encodeURIComponent(since30d)}`, headers),
        clientId && UUID_RE.test(clientId)
          ? backendGet(base, `/api/clients/${encodeURIComponent(practiceId)}/${encodeURIComponent(clientId)}`, headers)
          : Promise.resolve(null),
        env.DB.prepare(`
          SELECT id, tool_name, approval_summary_json, created_at
          FROM practice_assistant_actions
          WHERE practice_id = ? AND status = 'pending'
          ORDER BY created_at DESC LIMIT 5
        `).bind(practiceId).all<{ id: string; tool_name: string; approval_summary_json: string; created_at: string }>(),
      ]);

      const { hours: unbilledHours, amount: unbilledAmount } = parseUnbilled(
        unbilledRes.status === 'fulfilled' ? unbilledRes.value : null,
      );
      const solDate = parseSolDate(deadlinesRes.status === 'fulfilled' ? deadlinesRes.value : null);
      const activities = parseActivityFeed(activityFeedRes.status === 'fulfilled' ? activityFeedRes.value : null);
      const eventCount30d = parseActivityCount(activityCountRes.status === 'fulfilled' ? activityCountRes.value : null);
      const { name: clientName, phone: clientPhone } = parseClient(
        clientRes.status === 'fulfilled' ? clientRes.value : null,
      );

      const stagedActions = (stagedRows.status === 'fulfilled' ? stagedRows.value.results ?? [] : []).map((row) => {
        let title = row.tool_name;
        let description = '';
        try {
          const s = JSON.parse(row.approval_summary_json) as { title?: string; description?: string };
          title = s.title ?? title;
          description = s.description ?? '';
        } catch { /* defaults */ }
        return { id: row.id, title, description };
      });

      return { unbilledHours, unbilledAmount, solDate, activities, eventCount30d, clientName, clientPhone, stagedActions };
    },
    { ttlMs: 60_000 },
  );

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
