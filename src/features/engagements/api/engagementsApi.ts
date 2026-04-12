/**
 * Engagements API
 *
 * Endpoints proxy to the remote backend (/api/matters/:practiceId and /api/matters/:id/engagement).
 * Backend is the authority for all lifecycle transitions, conflict checks, and side effects.
 * Frontend must not invent fallback workflow logic — fail fast and surface backend errors.
 */
import type {
  EngagementDetail,
  EngagementListItem,
  EngagementListResponse,
  ProposalData,
  ConflictOverridePayload,
  EngagementStatus,
} from '../types/engagement';
import { matterItemPath, encodeSegment } from '@/config/urls';

// ── Engagement statuses that belong in the engagement feature ──────────────────
export const ENGAGEMENT_STATUSES: EngagementStatus[] = [
  'intake_accepted',
  'engagement_draft',
  'engagement_sent',
  'engagement_accepted',
  'active',
];

// ── List engagements for a practice ──────────────────────────────────────────

export async function listEngagements(
  practiceId: string,
  params: { page?: number; limit?: number; status?: string[] },
  options: { signal?: AbortSignal } = {}
): Promise<EngagementListResponse> {
  if (!practiceId) throw new Error('practiceId is required');

  const query = new URLSearchParams();
  query.set('page', String(params.page ?? 1));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.status && params.status.length > 0) {
    // Filter to engagement-specific statuses on the client side until backend supports it.
    params.status.forEach((s) => query.append('status', s));
  }

  const url = `/api/matters/${encodeSegment(practiceId)}?${query.toString()}`;
  const res = await fetch(url, { credentials: 'include', signal: options.signal });

  if (!res.ok) {
    throw new Error(`Failed to fetch engagements (HTTP ${res.status})`);
  }

  const raw = await res.json() as Record<string, unknown>;
  const data = (raw.success !== undefined && raw.data) ? raw.data as Record<string, unknown> : raw;

  // Backend returns all matters; we filter to engagement-relevant statuses client-side
  // until the backend exposes a dedicated endpoint.
  const allItems = (Array.isArray(data.items) ? data.items : []) as EngagementListItem[];
  const engagementItems = allItems.filter(
    (item) => ENGAGEMENT_STATUSES.includes(item.status as EngagementStatus)
  );

  const requestedPage = Math.max(1, params.page ?? 1);
  const requestedLimit = params.limit;

  const baseQuery = new URLSearchParams();
  if (requestedLimit) baseQuery.set('limit', String(requestedLimit));
  if (params.status && params.status.length > 0) {
    params.status.forEach((s) => baseQuery.append('status', s));
  }

  const filteredItems: EngagementListItem[] = [];
  let backendPage = 1;
  let backendTotalPages: number | null = null;

  // We loop until we have enough items for the requested page or hit the end.
  // This is a bridge until the backend provides a dedicated /engagements endpoint.
  while (true) {
    const pageQuery = new URLSearchParams(baseQuery);
    pageQuery.set('page', String(backendPage));

    const url = `/api/matters/${encodeSegment(practiceId)}?${pageQuery.toString()}`;
    const res = await fetch(url, { credentials: 'include', signal: options.signal });
    if (!res.ok) throw new Error(`Failed to fetch engagements (HTTP ${res.status})`);

    const raw = await res.json() as Record<string, unknown>;
    const data = (raw.success !== undefined && raw.data) ? raw.data as Record<string, unknown> : raw;
    const allItems = (Array.isArray(data.items) ? data.items : []) as EngagementListItem[];

    filteredItems.push(
      ...allItems.filter((item) => ENGAGEMENT_STATUSES.includes(item.status as EngagementStatus))
    );

    if (typeof data.total_pages === 'number' && Number.isFinite(data.total_pages)) {
      backendTotalPages = data.total_pages;
    }

    const reachedKnownEnd = backendTotalPages !== null && backendPage >= backendTotalPages;
    const reachedEmptyPage = allItems.length === 0;

    // We fetch everything for now to compute accurate total, as the backend
    // matters endpoint returns a mix of all statuses.
    if (reachedKnownEnd || reachedEmptyPage) break;
    backendPage += 1;
  }

  const total = filteredItems.length;
  const page_size = requestedLimit ?? (total || 1);
  const total_pages = Math.max(1, Math.ceil(total / page_size));
  const startIndex = requestedLimit ? (requestedPage - 1) * requestedLimit : 0;
  const items = requestedLimit
    ? filteredItems.slice(startIndex, startIndex + requestedLimit)
    : filteredItems;

  return {
    items,
    total,
    page: requestedPage,
    total_pages,
  };
}

// ── Get engagement detail ─────────────────────────────────────────────────────

export async function getEngagement(
  practiceId: string,
  matterId: string,
  options: { signal?: AbortSignal } = {}
): Promise<EngagementDetail> {
  if (!practiceId) throw new Error('practiceId is required');
  if (!matterId) throw new Error('matterId is required');

  const url = matterItemPath(practiceId, matterId);
  const res = await fetch(url, { credentials: 'include', signal: options.signal });

  if (!res.ok) {
    throw new Error(`Failed to fetch engagement (HTTP ${res.status})`);
  }

  const raw = await res.json() as Record<string, unknown>;
  const data = (raw.success !== undefined && raw.data) ? raw.data as Record<string, unknown> : raw;

  if (!data || typeof data !== 'object' || !data.id) {
    throw new Error('Engagement not found');
  }

  return data as unknown as EngagementDetail;
}

// ── Patch proposal_data ────────────────────────────────────────────────────────
// Always sends the full proposal_data object — never partial updates.

export async function patchEngagementProposal(
  matterId: string,
  proposalData: ProposalData,
  options: { signal?: AbortSignal } = {}
): Promise<EngagementDetail> {
  if (!matterId) throw new Error('matterId is required');

  const res = await fetch(`/api/matters/${encodeSegment(matterId)}/engagement`, {
    method: 'PATCH',
    credentials: 'include',
    signal: options.signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ proposal_data: proposalData }),
  });

  if (!res.ok) {
    const json = await res.json().catch(() => null) as Record<string, unknown> | null;
    throw new Error(String(json?.message ?? json?.error ?? `HTTP ${res.status}`));
  }

  const raw = await res.json() as Record<string, unknown>;
  const data = (raw.success !== undefined && raw.data) ? raw.data as Record<string, unknown> : raw;
  return data as unknown as EngagementDetail;
}

// ── Send to client ─────────────────────────────────────────────────────────────

export async function sendEngagementToClient(
  matterId: string,
  note?: string,
  options: { signal?: AbortSignal } = {}
): Promise<EngagementDetail> {
  if (!matterId) throw new Error('matterId is required');

  const res = await fetch(`/api/matters/${encodeSegment(matterId)}/engagement/send`, {
    method: 'POST',
    credentials: 'include',
    signal: options.signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note }),
  });

  if (!res.ok) {
    const json = await res.json().catch(() => null) as Record<string, unknown> | null;
    throw new Error(String(json?.message ?? json?.error ?? `HTTP ${res.status}`));
  }

  const raw = await res.json() as Record<string, unknown>;
  const data = (raw.success !== undefined && raw.data) ? raw.data as Record<string, unknown> : raw;
  return data as unknown as EngagementDetail;
}

// ── Withdraw proposal ──────────────────────────────────────────────────────────

export async function withdrawEngagement(
  matterId: string,
  options: { signal?: AbortSignal } = {}
): Promise<EngagementDetail> {
  if (!matterId) throw new Error('matterId is required');

  const res = await fetch(`/api/matters/${encodeSegment(matterId)}/engagement/withdraw`, {
    method: 'POST',
    credentials: 'include',
    signal: options.signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    const json = await res.json().catch(() => null) as Record<string, unknown> | null;
    throw new Error(String(json?.message ?? json?.error ?? `HTTP ${res.status}`));
  }

  const raw = await res.json() as Record<string, unknown>;
  const data = (raw.success !== undefined && raw.data) ? raw.data as Record<string, unknown> : raw;
  return data as unknown as EngagementDetail;
}

// ── Client: accept engagement ──────────────────────────────────────────────────

export async function acceptEngagement(
  matterId: string,
  options: { signal?: AbortSignal } = {}
): Promise<EngagementDetail> {
  if (!matterId) throw new Error('matterId is required');

  const res = await fetch(`/api/matters/${encodeSegment(matterId)}/engagement/accept`, {
    method: 'POST',
    credentials: 'include',
    signal: options.signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    const json = await res.json().catch(() => null) as Record<string, unknown> | null;
    throw new Error(String(json?.message ?? json?.error ?? `HTTP ${res.status}`));
  }

  const raw = await res.json() as Record<string, unknown>;
  const data = (raw.success !== undefined && raw.data) ? raw.data as Record<string, unknown> : raw;
  return data as unknown as EngagementDetail;
}

// ── Staff: override conflict check ────────────────────────────────────────────

export async function overrideConflictCheck(
  matterId: string,
  payload: ConflictOverridePayload,
  options: { signal?: AbortSignal } = {}
): Promise<void> {
  if (!matterId) throw new Error('matterId is required');
  if (!payload.override_reason?.trim()) throw new Error('override_reason is required');

  const res = await fetch(`/api/matters/${encodeSegment(matterId)}/conflict-override`, {
    method: 'POST',
    credentials: 'include',
    signal: options.signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const json = await res.json().catch(() => null) as Record<string, unknown> | null;
    throw new Error(String(json?.message ?? json?.error ?? `HTTP ${res.status}`));
  }
}
