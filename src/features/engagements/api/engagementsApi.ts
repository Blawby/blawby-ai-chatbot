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
import { queryCache } from '@/shared/lib/queryCache';

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
  intake_id: string;
  contract_body?: string;
  engagement_notes?: string;
  proposal_data?: ProposalData;
};

type PatchEngagementContractPayload = {
  contract_body?: string;
  engagement_notes?: string;
  proposal_data?: ProposalData;
};

const mutationError = (error: unknown, defaultMessage: string): Error => {
  if (isHttpError(error)) {
    const data = error.response.data as { message?: string; error?: string } | undefined;
    console.error('[engagementsApi] Engagement request failed', {
      status: error.response.status,
      data: error.response.data,
    });
    try {
      console.error(`[engagementsApi] Engagement request failed details ${JSON.stringify({
        status: error.response.status,
        data: error.response.data,
      })}`);
    } catch {
      // The structured log above still carries the response body if stringifying fails.
    }
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

const optionalNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const requireRecord = (
  data: Record<string, unknown>,
  field: string,
  engagementId: string
): Record<string, unknown> => {
  const value = data[field];
  if (!value || typeof value !== 'object') {
    throw new Error(`Engagement ${engagementId} is missing ${field}`);
  }
  return value as Record<string, unknown>;
};

const logInvalidEngagementContract = (raw: unknown, error: Error) => {
  if (typeof console === 'undefined') return;
  const data = asRecord(raw);
  const proposalData = asRecord(data.proposal_data);
  const clientSummary = asRecord(proposalData.client_summary);
  const fees = asRecord(proposalData.fees);
  const details = {
    error: error.message,
    id: data.id,
    keys: Object.keys(data),
    proposalDataKeys: Object.keys(proposalData),
    clientSummaryKeys: Object.keys(clientSummary),
    feesKeys: Object.keys(fees),
  };
  console.error('[engagementsApi] Invalid engagement contract payload', details);
  console.error(`[engagementsApi] Invalid engagement contract payload details ${JSON.stringify(details)}`);
};

const parseContractListPayload = (raw: unknown): EngagementContractListPayload => {
  const data = asRecord(raw);
  const list = data.data;
  if (!Array.isArray(list)) {
    throw new Error('Engagement contract list is missing data');
  }

  const pagination = asRecord(data.pagination);
  const page = optionalNumber(pagination.page);
  const limit = optionalNumber(pagination.limit);
  const total = optionalNumber(pagination.total);

  if (page === null || limit === null || total === null) {
    throw new Error('Engagement contract list is missing pagination');
  }

  return {
    data: list,
    pagination: {
      page,
      limit,
      total,
    },
  };
};

const normalizeEngagementContract = (raw: unknown): EngagementDetail => {
  try {
    const data = asRecord(raw);
    const id = requireString(data, 'id');
    if (typeof data.status !== 'string' || !ENGAGEMENT_STATUSES.includes(data.status as EngagementStatus)) {
      throw new Error(`Engagement ${id} has an invalid status`);
    }

    const proposalData = requireRecord(data, 'proposal_data', id) as unknown as ProposalData;
    const proposalRecord = proposalData as unknown as Record<string, unknown>;
    const clientSummary = requireRecord(proposalRecord, 'client_summary', id);
    requireRecord(proposalRecord, 'fees', id);
    const sourceSnapshot = proposalData.source_snapshot;
    const clientName = requireString(clientSummary, 'client_name');
    const matterSummary = requireString(clientSummary, 'matter_summary');

    return {
      ...(data as unknown as EngagementDetail),
      id,
      matter_id: optionalString(data.matter_id),
      intake_id: requireString(data, 'intake_id'),
      organization_id: requireString(data, 'organization_id'),
      status: data.status as EngagementStatus,
      proposal_data: proposalData,
      client_name: clientName,
      client_email: optionalString(data.client_email),
      title: matterSummary,
      description: matterSummary,
      conversation_id: sourceSnapshot?.conversation_id ?? optionalString(data.conversation_id),
      practice_area: sourceSnapshot?.practice_area ?? optionalString(data.practice_area),
      urgency: sourceSnapshot?.urgency ?? optionalString(data.urgency),
      opposing_party: sourceSnapshot?.opposing_party ?? optionalString(data.opposing_party),
      desired_outcome: sourceSnapshot?.desired_outcome ?? optionalString(data.desired_outcome),
      created_at: requireString(data, 'created_at'),
      updated_at: optionalString(data.updated_at),
    };
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error('Engagement contract payload is invalid');
    logInvalidEngagementContract(raw, normalizedError);
    throw normalizedError;
  }
};

const normalizeEngagementContractList = (
  data: EngagementContractListPayload,
  allowedStatuses: Set<string>,
): { items: EngagementDetail[]; rejectedCount: number } => {
  const items: EngagementDetail[] = [];
  let rejectedCount = 0;

  for (const rawItem of data.data) {
    try {
      const item = normalizeEngagementContract(rawItem);
      if (allowedStatuses.has(item.status)) {
        items.push(item);
      }
    } catch {
      rejectedCount += 1;
    }
  }

  return { items, rejectedCount };
};

const invalidateEngagementLifecycleCaches = (practiceId: string, engagement?: EngagementDetail | null) => {
  queryCache.invalidate(`engagement:${practiceId}:`, true);
  queryCache.invalidate(`matters:${practiceId}:`, true);
  queryCache.invalidate(`sidebar:counts:${practiceId}`, true);
  queryCache.invalidate('sidebar:counts:', true);
  queryCache.invalidate(`files:${practiceId}:`, true);
  if (engagement?.matter_id) {
    queryCache.invalidate(`matter:files:${practiceId}:${engagement.matter_id}`);
  }
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
  if (hasStatusFilter && requestedStatuses.length === 1) {
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
  const { items, rejectedCount } = normalizeEngagementContractList(data, allowedStatuses);
  const total = Math.max(0, data.pagination.total - rejectedCount);
  const total_pages = Math.max(1, Math.ceil(total / requestedLimit));

  return {
    items,
    total,
    page: requestedPage,
    total_pages,
  };
}

// ── Create engagement contract ─────────────────────────────────────────────────────

export async function createEngagementContract(
  practiceId: string,
  payload: CreateEngagementContractPayload,
  options: { signal?: AbortSignal } = {}
): Promise<EngagementDetail> {
  if (!practiceId) throw new Error('practiceId is required');
  if (!payload.intake_id) throw new Error('intake_id is required');

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

  const engagement = normalizeEngagementContract(raw);
  invalidateEngagementLifecycleCaches(practiceId, engagement);
  return engagement;
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

// ── Find engagement for matter ─────────────────────────────────────────────────
// Domain rule: a matter always has an engagement. The list endpoint doesn't
// filter by matter_id server-side, so we fetch the practice's engagements and
// pick the one that references this matter. Returns null only if the matter
// is in an inconsistent state (no engagement found).

export async function getEngagementForMatter(
  practiceId: string,
  matterId: string,
  options: { signal?: AbortSignal } = {}
): Promise<EngagementDetail | null> {
  if (!practiceId) throw new Error('practiceId is required');
  if (!matterId) throw new Error('matterId is required');

  const limit = 100;
  let page = 1;
  // Guard against unbounded loops if backend pagination is malformed.
  const MAX_PAGES = 100;

  while (page <= MAX_PAGES) {
    let raw: unknown;
    try {
      const result = await apiClient.get<unknown>(
        `/api/engagement-contracts/${encodeSegment(practiceId)}?page=${page}&limit=${limit}`,
        { signal: options.signal },
      );
      raw = result.data;
    } catch (error) {
      throw mutationError(error, 'Failed to fetch engagement for matter');
    }

    const data = parseContractListPayload(raw);
    for (const item of data.data) {
      const record = asRecord(item);
      if (record.matter_id === matterId) {
        return normalizeEngagementContract(item);
      }
    }

    if (data.data.length === 0) break;
    if (page * limit >= data.pagination.total) break;
    page += 1;
  }

  return null;
}

// ── Patch draft contract ────────────────────────────────────────────────────────
// Always sends the full proposal_data object when proposal_data changes.

export async function patchEngagementProposal(
  practiceId: string,
  contractId: string,
  proposalData: ProposalData,
  options: { signal?: AbortSignal } = {}
): Promise<EngagementDetail> {
  return patchEngagementContract(practiceId, contractId, { proposal_data: proposalData }, options);
}

export async function patchEngagementContract(
  practiceId: string,
  contractId: string,
  payload: PatchEngagementContractPayload,
  options: { signal?: AbortSignal } = {}
): Promise<EngagementDetail> {
  if (!practiceId) throw new Error('practiceId is required');
  if (!contractId) throw new Error('contractId is required');

  let raw: unknown;
  try {
    const result = await apiClient.patch<unknown>(
      `/api/engagement-contracts/${encodeSegment(practiceId)}/${encodeSegment(contractId)}`,
      payload,
      { signal: options.signal },
    );
    raw = result.data;
  } catch (error) {
    throw mutationError(error, 'Failed to update engagement');
  }

  const engagement = normalizeEngagementContract(raw);
  invalidateEngagementLifecycleCaches(practiceId, engagement);
  return engagement;
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

  if (note?.trim()) {
    await patchEngagementContract(
      practiceId,
      contractId,
      { engagement_notes: note.trim() },
      { signal: options.signal },
    );
  }

  let raw: unknown;
  try {
    const result = await apiClient.patch<unknown>(
      `/api/engagement-contracts/${encodeSegment(practiceId)}/${encodeSegment(contractId)}/status`,
      { status: 'sent' },
      { signal: options.signal },
    );
    raw = result.data;
  } catch (error) {
    throw mutationError(error, 'Failed to send engagement');
  }

  const engagement = normalizeEngagementContract(raw);
  invalidateEngagementLifecycleCaches(practiceId, engagement);
  return engagement;
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

  const engagement = normalizeEngagementContract(raw);
  invalidateEngagementLifecycleCaches(practiceId, engagement);
  return engagement;
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

  const engagement = normalizeEngagementContract(raw);
  invalidateEngagementLifecycleCaches(practiceId, engagement);
  return engagement;
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
