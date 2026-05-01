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
import { apiClient, isHttpError } from '@/shared/lib/apiClient';

// ── Engagement statuses that belong in the engagement feature ──────────────────
export const ENGAGEMENT_STATUSES: EngagementStatus[] = [
  'intake_accepted',
  'engagement_draft',
  'engagement_sent',
  'engagement_accepted',
  'engagement_pending',
  'active',
];

// Unwrap a `{ success, data }` envelope to the inner payload, or pass through
// the raw object when the endpoint replies with an unwrapped response.
const unwrapEnvelope = (raw: unknown): Record<string, unknown> => {
  if (!raw || typeof raw !== 'object') return {};
  const record = raw as Record<string, unknown>;
  if (record.success !== undefined && record.data && typeof record.data === 'object') {
    return record.data as Record<string, unknown>;
  }
  return record;
};

const mutationError = (error: unknown, fallback: string): Error => {
  if (isHttpError(error)) {
    const data = error.response.data as { message?: string; error?: string } | undefined;
    const message = data?.message ?? data?.error;
    return new Error(message ? String(message) : `${fallback} (HTTP ${error.response.status})`);
  }
  return error instanceof Error ? error : new Error(fallback);
};

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

    let raw: unknown;
    try {
      const result = await apiClient.get<unknown>(
        `/api/matters/${encodeSegment(practiceId)}?${pageQuery.toString()}`,
        { signal: options.signal },
      );
      raw = result.data;
    } catch (error) {
      throw mutationError(error, 'Failed to fetch engagements');
    }

    const data = unwrapEnvelope(raw);
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

  let raw: unknown;
  try {
    const result = await apiClient.get<unknown>(matterItemPath(practiceId, matterId), {
      signal: options.signal,
    });
    raw = result.data;
  } catch (error) {
    throw mutationError(error, 'Failed to fetch engagement');
  }

  const data = unwrapEnvelope(raw);
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

  let raw: unknown;
  try {
    const result = await apiClient.patch<unknown>(
      `/api/matters/${encodeSegment(matterId)}/engagement`,
      { proposal_data: proposalData },
      { signal: options.signal },
    );
    raw = result.data;
  } catch (error) {
    throw mutationError(error, 'Failed to update proposal');
  }

  const data = unwrapEnvelope(raw);
  return data as unknown as EngagementDetail;
}

// ── Send to client ─────────────────────────────────────────────────────────────

export async function sendEngagementToClient(
  matterId: string,
  note?: string,
  options: { signal?: AbortSignal } = {}
): Promise<EngagementDetail> {
  if (!matterId) throw new Error('matterId is required');

  let raw: unknown;
  try {
    const result = await apiClient.post<unknown>(
      `/api/matters/${encodeSegment(matterId)}/engagement/send`,
      { note },
      { signal: options.signal },
    );
    raw = result.data;
  } catch (error) {
    throw mutationError(error, 'Failed to send engagement');
  }

  const data = unwrapEnvelope(raw);
  return data as unknown as EngagementDetail;
}

// ── Withdraw proposal ──────────────────────────────────────────────────────────

export async function withdrawEngagement(
  matterId: string,
  options: { signal?: AbortSignal } = {}
): Promise<EngagementDetail> {
  if (!matterId) throw new Error('matterId is required');

  let raw: unknown;
  try {
    const result = await apiClient.post<unknown>(
      `/api/matters/${encodeSegment(matterId)}/engagement/withdraw`,
      {},
      { signal: options.signal },
    );
    raw = result.data;
  } catch (error) {
    throw mutationError(error, 'Failed to withdraw engagement');
  }

  const data = unwrapEnvelope(raw);
  return data as unknown as EngagementDetail;
}

// ── Client: accept engagement ──────────────────────────────────────────────────

export async function acceptEngagement(
  matterId: string,
  options: { signal?: AbortSignal } = {}
): Promise<EngagementDetail> {
  if (!matterId) throw new Error('matterId is required');

  let raw: unknown;
  try {
    const result = await apiClient.post<unknown>(
      `/api/matters/${encodeSegment(matterId)}/engagement/accept`,
      {},
      { signal: options.signal },
    );
    raw = result.data;
  } catch (error) {
    throw mutationError(error, 'Failed to accept engagement');
  }

  const data = unwrapEnvelope(raw);
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

  try {
    await apiClient.post<unknown>(
      `/api/matters/${encodeSegment(matterId)}/conflict-override`,
      payload,
      { signal: options.signal },
    );
  } catch (error) {
    throw mutationError(error, 'Failed to override conflict check');
  }
}
