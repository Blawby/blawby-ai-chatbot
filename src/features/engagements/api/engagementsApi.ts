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
 'engagement_pending',
 'active',
];

// ── List engagements for a practice ──────────────────────────────────────────

export async function listEngagements(
 practiceId: string,
 params: { page?: number; limit?: number; status?: string[] },
 options: { signal?: AbortSignal } = {}
): Promise<EngagementListResponse> {
 if (!practiceId) throw new Error('practiceId is required');

 const requestedPage = Math.max(1, params.page ?? 1);
 const requestedLimit = Math.max(1, params.limit ?? 20);

 const engagementStatuses = new Set<string>(ENGAGEMENT_STATUSES);
 const requestedStatuses = params.status && params.status.length > 0
  ? params.status.filter((s): s is EngagementStatus => engagementStatuses.has(s))
  : ENGAGEMENT_STATUSES;

 const invalidStatuses = params.status && params.status.length > 0
  ? params.status.filter((s) => !engagementStatuses.has(s))
  : [];

 if (invalidStatuses.length > 0) {
  throw new Error(`Invalid engagement status filter: ${invalidStatuses.join(', ')}`);
 }

 const allowedStatuses = new Set<string>(requestedStatuses);

 const baseQuery = new URLSearchParams();
 baseQuery.set('limit', String(requestedLimit));
 if (requestedStatuses.length > 0) {
  requestedStatuses.forEach((s) => baseQuery.append('status', s));
 }

 const filteredItems: EngagementListItem[] = [];
 let backendPage = 1;
 let backendTotalPages: number | null = null;

 // We loop until we have enough items for the requested page plus one item to check hasMore.
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
   ...allItems.filter((item) => allowedStatuses.has(item.status as string))
  );

  if (typeof data.total_pages === 'number' && Number.isFinite(data.total_pages)) {
   backendTotalPages = data.total_pages;
  }

  const reachedKnownEnd = backendTotalPages !== null && backendPage >= backendTotalPages;
  const reachedEmptyPage = allItems.length === 0;
  const hasEnoughForPagination = filteredItems.length >= (requestedPage * requestedLimit) + 1;

  if (reachedKnownEnd || reachedEmptyPage || hasEnoughForPagination) break;
  backendPage += 1;
 }

 const total = filteredItems.length;
 const page_size = requestedLimit;
 const total_pages = Math.max(1, Math.ceil(total / page_size));
 const startIndex = (requestedPage - 1) * requestedLimit;
 const items = filteredItems.slice(startIndex, startIndex + requestedLimit);

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

 if (!res.ok) await handleResponseError(res, 'Failed to update proposal');

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

 if (!res.ok) await handleResponseError(res, 'Failed to send engagement');

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

 if (!res.ok) await handleResponseError(res, 'Failed to withdraw engagement');

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

 if (!res.ok) await handleResponseError(res, 'Failed to accept engagement');

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

 if (!res.ok) await handleResponseError(res, 'Failed to override conflict check');
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function handleResponseError(res: Response, defaultMessage: string): Promise<never> {
 let message = `${defaultMessage} (HTTP ${res.status})`;
 try {
  const json = await res.json() as Record<string, unknown>;
  message = String(json?.message ?? json?.error ?? message);
 } catch {
  const text = await res.text().catch(() => '');
  if (text) message = text;
 }
 throw new Error(message);
}
