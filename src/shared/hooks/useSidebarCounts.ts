import { useMemo } from 'preact/hooks';
import { apiClient } from '@/shared/lib/apiClient';
import { useQuery } from '@/shared/hooks/useQuery';
import { policyTtl } from '@/shared/lib/cachePolicy';
import { BackendSidebarCountsSchema, type BackendSidebarCounts } from '@/shared/types/wire';

/**
 * Reads aggregated counts from the worker's `/api/practice/:id/sidebar/counts`
 * endpoint and exposes them as a flat `Record<string, number>` keyed by
 * Sidebar item id (matching `PracticeSidebar`'s `counts` prop contract).
 *
 * The endpoint only returns sections it can count cheaply today (intakes,
 * conversations); missing sections produce no map entries, so the Sidebar
 * gracefully omits those badges.
 */

const SIDEBAR_COUNTS_PATH = (practiceId: string) =>
  `/api/practice/${encodeURIComponent(practiceId)}/sidebar/counts`;

const unwrapResponse = (raw: unknown): BackendSidebarCounts | null => {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  // createSuccessResponse wraps the payload in `{ success: true, data: {...} }`.
  const payload = record.data && typeof record.data === 'object' && !Array.isArray(record.data)
    ? record.data
    : record;
  const parsed = BackendSidebarCountsSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
};

const fetchSidebarCounts = async (
  practiceId: string,
  signal?: AbortSignal,
): Promise<BackendSidebarCounts> => {
  const response = await apiClient.get<unknown>(SIDEBAR_COUNTS_PATH(practiceId), { signal });
  const counts = unwrapResponse(response.data);
  if (!counts) throw new Error('Invalid sidebar counts response');
  return counts;
};

/**
 * Flatten the structured response into the `Record<string, number>` shape the
 * Sidebar consumes. Top-level rail items use their nav-item id as the key;
 * sub-item ids are written for the *active section's* expected sub-items.
 *
 * Sub-item id collisions across sections (e.g. both Matters and Intakes have
 * an `all` and a `declined` sub-item) are deliberately not resolved here:
 * `buildSidebarConfig` only attaches sub-items to the rail item matching the
 * current `workspaceSection`, so only one section's sub-items render at a
 * time. The caller (WorkspacePage) overlays per-section sub-counts via the
 * `activeSection` argument so the visible sub-items get truthful numbers.
 */
const flatten = (
  raw: BackendSidebarCounts | undefined,
  activeSection: string | null,
): Record<string, number> => {
  const out: Record<string, number> = {};
  if (!raw) return out;

  // ── Top-level totals (rail item badges) ────────────────────────────────
  if (raw.intakes && raw.intakes.total > 0) out.intakes = raw.intakes.total;
  if (raw.matters && raw.matters.total > 0) out.matters = raw.matters.total;
  if (raw.invoices && raw.invoices.total > 0) out.invoices = raw.invoices.total;
  if (raw.files && raw.files.total > 0) out.files = raw.files.total;
  if (raw.conversations) {
    // Pencil GtRGH inbox badge surfaces unread first; fall back to total when
    // the practice has no read-state rows yet (cold install).
    const inbox = raw.conversations.unread > 0 ? raw.conversations.unread : raw.conversations.total;
    if (inbox > 0) out.conversations = inbox;
  }

  // ── Active-section sub-counts ──────────────────────────────────────────
  if (activeSection === 'intakes' && raw.intakes) {
    out.all = raw.intakes.total;
    if (raw.intakes.pending_review > 0) out.pending_review = raw.intakes.pending_review;
    if (raw.intakes.accepted > 0) out.accepted = raw.intakes.accepted;
    if (raw.intakes.declined > 0) out.declined = raw.intakes.declined;
  }
  if (activeSection === 'matters' && raw.matters) {
    out.all = raw.matters.total;
    for (const [k, v] of Object.entries(raw.matters.byStatus)) if (v > 0) out[k] = v;
  }
  if (activeSection === 'invoices' && raw.invoices) {
    out.all = raw.invoices.total;
    for (const [k, v] of Object.entries(raw.invoices.byStatus)) if (v > 0) out[k] = v;
  }
  if (activeSection === 'conversations' && raw.conversations) {
    for (const [k, v] of Object.entries(raw.conversations.byFilter)) if (v > 0) out[k] = v;
  }

  return out;
};

export const useSidebarCounts = (
  practiceId: string | null,
  activeSection: string | null,
  options: { enabled?: boolean } = {},
) => {
  const { enabled = true } = options;
  const cacheKey = practiceId ? `sidebar:counts:${practiceId}` : 'sidebar:counts:none';

  const { data, error, isLoading, refetch } = useQuery<BackendSidebarCounts>({
    key: cacheKey,
    fetcher: (signal) => fetchSidebarCounts(practiceId ?? '', signal),
    ttl: policyTtl(cacheKey),
    enabled: enabled && Boolean(practiceId),
  });

  const flat = useMemo(() => flatten(data, activeSection), [data, activeSection]);

  return useMemo(
    () => ({ counts: flat, raw: data, isLoading, error, refetch }),
    [flat, data, isLoading, error, refetch],
  );
};
