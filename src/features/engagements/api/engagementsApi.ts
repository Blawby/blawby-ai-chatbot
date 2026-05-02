/**
 * Engagements API
 *
 * Endpoints proxy to the remote backend (/api/engagement-contracts/:practiceId).
 * Backend is the authority for all lifecycle transitions, conflict checks, and side effects.
 * Frontend must not invent fallback workflow logic — fail fast and surface backend errors.
 */
import type {
  EngagementDetail,
  EngagementListResponse,
  ProposalData,
  ConflictOverridePayload,
  EngagementStatus,
} from '../types/engagement';
import { encodeSegment } from '@/config/urls';
import { apiClient, isHttpError } from '@/shared/lib/apiClient';

// ── Engagement statuses that belong in the engagement feature ──────────────────
export const ENGAGEMENT_STATUSES: EngagementStatus[] = [
  'draft',
  'sent',
  'accepted',
  'declined',
];

type EngagementContractListPayload = {
  data: unknown[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
};

type CreateEngagementContractPayload = {
  matter_id: string;
  contract_body?: string;
  engagement_notes?: string;
  proposal_data?: ProposalData;
};

const mutationError = (error: unknown, defaultMessage: string): Error => {
  if (isHttpError(error)) {
    const data = error.response.data as { message?: string; error?: string } | undefined;
    const message = data?.message ?? data?.error;
    return new Error(message ? String(message) : `${defaultMessage} (HTTP ${error.response.status})`);
  }
  return error instanceof Error ? error : new Error(defaultMessage);
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? value as Record<string, unknown> : {};

const requireString = (data: Record<string, unknown>, field: string): string => {
  const value = data[field];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Engagement is missing ${field}`);
  }
  return value;
};

const optionalString = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

const parseContractListPayload = (raw: unknown): EngagementContractListPayload => {
  const data = asRecord(raw);
  if (!Array.isArray(data.data)) {
    throw new Error('Engagement contract list is missing data');
  }
  const pagination = asRecord(data.pagination);
  if (
    typeof pagination.page !== 'number'
    || typeof pagination.limit !== 'number'
    || typeof pagination.total !== 'number'
  ) {
    throw new Error('Engagement contract list is missing pagination');
  }
  return {
    data: data.data,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total: pagination.total,
    },
  };
};

const normalizeEngagementContract = (raw: unknown): EngagementDetail => {
  const data = asRecord(raw);
  if (!data.id) throw new Error('Engagement not found');
  if (typeof data.status !== 'string' || !ENGAGEMENT_STATUSES.includes(data.status as EngagementStatus)) {
    throw new Error('Engagement has an invalid status');
  }

  const proposalData = data.proposal_data && typeof data.proposal_data === 'object'
    ? data.proposal_data as ProposalData
    : null;
  const clientSummary = proposalData?.client_summary;
  const sourceSnapshot = proposalData?.source_snapshot;

  return {
    ...(data as unknown as EngagementDetail),
    id: requireString(data, 'id'),
    matter_id: requireString(data, 'matter_id'),
    organization_id: requireString(data, 'organization_id'),
    status: data.status as EngagementStatus,
    proposal_data: proposalData,
    client_name: clientSummary?.client_name ?? null,
    client_email: optionalString(data.client_email),
    title: clientSummary?.matter_summary ?? null,
    description: clientSummary?.matter_summary ?? null,
    conversation_id: sourceSnapshot?.conversation_id ?? null,
    practice_area: sourceSnapshot?.practice_area ?? null,
    urgency: sourceSnapshot?.urgency ?? null,
    opposing_party: sourceSnapshot?.opposing_party ?? null,
    desired_outcome: sourceSnapshot?.desired_outcome ?? null,
    created_at: requireString(data, 'created_at'),
    updated_at: optionalString(data.updated_at),
  };
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
  const rawStatuses = params.status ?? [];
  const hasStatusFilter = rawStatuses.length > 0;
  const requestedStatuses = hasStatusFilter
    ? rawStatuses.filter((s): s is EngagementStatus => engagementStatuses.has(s))
    : ENGAGEMENT_STATUSES;

  const invalidStatuses = hasStatusFilter
    ? rawStatuses.filter((s) => !engagementStatuses.has(s))
    : [];

  if (invalidStatuses.length > 0) {
    throw new Error(`Invalid engagement status filter: ${invalidStatuses.join(', ')}`);
  }
  if (hasStatusFilter && requestedStatuses.length !== 1) {
    throw new Error('Engagement list supports exactly one status filter');
  }

  const allowedStatuses = new Set<string>(requestedStatuses);

  const query = new URLSearchParams();
  query.set('page', String(requestedPage));
  query.set('limit', String(requestedLimit));
  if (requestedStatuses.length === 1) {
    query.set('status', requestedStatuses[0]);
  }

  let raw: unknown;
  try {
    const result = await apiClient.get<unknown>(
      `/api/engagement-contracts/${encodeSegment(practiceId)}?${query.toString()}`,
      { signal: options.signal },
    );
    raw = result.data;
  } catch (error) {
    throw mutationError(error, 'Failed to fetch engagements');
  }

  const data = parseContractListPayload(raw);
  const allItems = data.data.map(normalizeEngagementContract);
  const items = allItems.filter((item) => allowedStatuses.has(item.status));
  const total = data.pagination.total;
  const total_pages = Math.max(1, Math.ceil(total / requestedLimit));

  return {
    items,
    total,
    page: requestedPage,
    total_pages,
  };
}

// ── Get engagement detail ─────────────────────────────────────────────────────

export async function createEngagementContract(
  practiceId: string,
  payload: CreateEngagementContractPayload,
  options: { signal?: AbortSignal } = {}
): Promise<EngagementDetail> {
  if (!practiceId) throw new Error('practiceId is required');
  if (!payload.matter_id) throw new Error('matter_id is required');

  let raw: unknown;
  try {
    const result = await apiClient.post<unknown>(
      `/api/engagement-contracts/${encodeSegment(practiceId)}`,
      payload,
      { signal: options.signal },
    );
    raw = result.data;
  } catch (error) {
    throw mutationError(error, 'Failed to create engagement');
  }

  return normalizeEngagementContract(raw);
}

export async function getEngagement(
  practiceId: string,
  contractId: string,
  options: { signal?: AbortSignal } = {}
): Promise<EngagementDetail> {
  if (!practiceId) throw new Error('practiceId is required');
  if (!contractId) throw new Error('contractId is required');

  let raw: unknown;
  try {
    const result = await apiClient.get<unknown>(
      `/api/engagement-contracts/${encodeSegment(practiceId)}/${encodeSegment(contractId)}`,
      { signal: options.signal },
    );
    raw = result.data;
  } catch (error) {
    throw mutationError(error, 'Failed to fetch engagement');
  }

  return normalizeEngagementContract(raw);
}

// ── Patch proposal_data ────────────────────────────────────────────────────────
// Always sends the full proposal_data object — never partial updates.

export async function patchEngagementProposal(
  practiceId: string,
  contractId: string,
  proposalData: ProposalData,
  options: { signal?: AbortSignal } = {}
): Promise<EngagementDetail> {
  if (!practiceId) throw new Error('practiceId is required');
  if (!contractId) throw new Error('contractId is required');

  let raw: unknown;
  try {
    const result = await apiClient.patch<unknown>(
      `/api/engagement-contracts/${encodeSegment(practiceId)}/${encodeSegment(contractId)}`,
      { proposal_data: proposalData },
      { signal: options.signal },
    );
    raw = result.data;
  } catch (error) {
    throw mutationError(error, 'Failed to update proposal');
  }

  return normalizeEngagementContract(raw);
}

// ── Send to client ─────────────────────────────────────────────────────────────

export async function sendEngagementToClient(
  practiceId: string,
  contractId: string,
  note?: string,
  options: { signal?: AbortSignal } = {}
): Promise<EngagementDetail> {
  if (!practiceId) throw new Error('practiceId is required');
  if (!contractId) throw new Error('contractId is required');

  let raw: unknown;
  try {
    const patchPayload: Record<string, any> = { status: 'sent' };
    if (note?.trim()) patchPayload.engagement_notes = note.trim();
    const result = await apiClient.patch<unknown>(
      `/api/engagement-contracts/${encodeSegment(practiceId)}/${encodeSegment(contractId)}`,
      patchPayload,
      { signal: options.signal },
    );
    raw = result.data;
  } catch (error) {
    throw mutationError(error, 'Failed to send engagement');
  }

  return normalizeEngagementContract(raw);
}

// ── Mark proposal declined ─────────────────────────────────────────────────────

export async function declineEngagement(
  practiceId: string,
  contractId: string,
  options: { signal?: AbortSignal } = {}
): Promise<EngagementDetail> {
  if (!practiceId) throw new Error('practiceId is required');
  if (!contractId) throw new Error('contractId is required');

  let raw: unknown;
  try {
    const result = await apiClient.patch<unknown>(
      `/api/engagement-contracts/${encodeSegment(practiceId)}/${encodeSegment(contractId)}/status`,
      { status: 'declined' },
      { signal: options.signal },
    );
    raw = result.data;
  } catch (error) {
    throw mutationError(error, 'Failed to decline engagement');
  }

  return normalizeEngagementContract(raw);
}

// ── Client: accept engagement ──────────────────────────────────────────────────

export async function acceptEngagement(
  practiceId: string,
  contractId: string,
  options: { signal?: AbortSignal } = {}
): Promise<EngagementDetail> {
  if (!practiceId) throw new Error('practiceId is required');
  if (!contractId) throw new Error('contractId is required');

  let raw: unknown;
  try {
    const result = await apiClient.patch<unknown>(
      `/api/engagement-contracts/${encodeSegment(practiceId)}/${encodeSegment(contractId)}/status`,
      { status: 'accepted' },
      { signal: options.signal },
    );
    raw = result.data;
  } catch (error) {
    throw mutationError(error, 'Failed to accept engagement');
  }

  return normalizeEngagementContract(raw);
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
