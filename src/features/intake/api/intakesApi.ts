import { clientIntake, clientIntakeInvite, clientIntakeStatus, clientIntakes } from '@/config/urls';

export interface IntakeListParams {
  page: number;
  limit?: number;
  status?: 'all' | 'pending' | 'succeeded' | 'expired';
  triage_status?: 'all' | 'pending_review' | 'accepted' | 'declined';
}

export interface IntakeListItem {
  uuid: string;
  organization_id: string;
  amount: number;
  currency: string;
  status: string;
  triage_status: 'pending_review' | 'accepted' | 'declined' | string;
  triage_reason?: string | null;
  triage_decided_at?: string | null;
  conversation_id?: string | null;
  stripe_charge_id?: string | null;
  urgency?: 'routine' | 'time_sensitive' | 'emergency' | null | string;
  court_date?: string | null;
  case_strength?: number | null;
  desired_outcome?: string | null;
  has_documents?: boolean | null;
  income?: number | null;
  household_size?: number | null;
  metadata: {
    email: string;
    name: string;
    title?: string;
    intake_title?: string;
    phone?: string;
    on_behalf_of?: string;
    opposing_party?: string;
    description?: string;
    practice_service_uuid?: string;
    custom_fields?: Record<string, unknown>;
    customFields?: Record<string, unknown>;
    [key: string]: unknown;
  };
  succeeded_at?: string | null;
  created_at: string;
}

export interface IntakeListResponse {
  intakes: IntakeListItem[];
  total: number;
  page: number;
  total_pages: number;
  limit?: number;
}

export interface PracticeIntakeDetail {
  uuid: string;
  organization_id: string;
  amount: number;
  currency: string;
  status: string;
  triage_status: 'pending_review' | 'accepted' | 'declined' | string;
  triage_reason?: string | null;
  triage_decided_at?: string | null;
  address_id?: string;
  case_strength?: number | null;
  conversation_id?: string | null;
  court_date?: string | null;
  desired_outcome?: string | null;
  has_documents?: boolean | null;
  household_size?: number | null;
  income?: number | null;
  metadata?: {
    email: string;
    name: string;
    title?: string;
    intake_title?: string;
    phone?: string;
    on_behalf_of?: string;
    opposing_party?: string;
    description?: string;
    user_id?: string;
    practice_service_uuid?: string;
    custom_fields?: Record<string, unknown>;
    customFields?: Record<string, unknown>;
    address?: {
      line1?: string;
      line2?: string;
      city?: string;
      state?: string;
      postal_code?: string;
      country?: string;
    };
    [key: string]: unknown;
  };
  stripe_charge_id?: string;
  urgency?: 'routine' | 'time_sensitive' | 'emergency' | null | string;
  succeeded_at?: string | null;
  created_at: string;
  // UI-specific fields / computed
  client_name?: string;
  practice_area?: string;
  payment_verified?: boolean;
}

export interface UpdateIntakeTriageStatusResponse {
  conversation_id?: string | null;
  conversationId?: string | null;
  triage_status?: string | null;
  triage_reason?: string | null;
}

export interface TriggerIntakeInviteResponse {
  success?: boolean;
  message?: string;
}

export async function listIntakes(practiceId: string, params: IntakeListParams, options: { signal?: AbortSignal } = {}) {
  if (!practiceId) {
    throw new Error('practiceId is required');
  }

  const query: Record<string, string | undefined> = {
    page: String(params.page),
  };

  if (params.limit != null) {
    query.limit = String(params.limit);
  }

  if (params.triage_status && params.triage_status !== 'all') {
    query.status = params.triage_status;
  } else if (params.status && params.status !== 'all') {
    query.status = params.status;
  }

  const response = await fetch(
    clientIntakes(practiceId, query),
    { credentials: 'include', signal: options.signal }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch intakes');
  }
  const raw = await response.json() as unknown;
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Failed to fetch intakes');
  }
  const json = raw as Record<string, unknown>;
  const data = (json.success !== undefined && json.data) ? json.data as Record<string, unknown> : json;

  if (json.success === false || (!Array.isArray(data.intakes) && typeof data.total !== 'number')) {
    throw new Error('Failed to fetch intakes');
  }

  return {
    intakes: Array.isArray(data.intakes) ? data.intakes : [],
    total: typeof data.total === 'number' ? data.total : 0,
    page: typeof data.page === 'number' ? data.page : params.page,
    total_pages: typeof data.total_pages === 'number' ? data.total_pages : 0,
    limit: typeof data.limit === 'number' ? data.limit : undefined,
  };
}

export async function getPracticeIntake(
  practiceId: string,
  intakeId: string,
  options: { signal?: AbortSignal } = {}
) {
  if (!practiceId) {
    throw new Error('practiceId is required');
  }
  if (!intakeId) {
    throw new Error('intakeId is required');
  }

  const response = await fetch(
    clientIntake(practiceId, intakeId),
    { credentials: 'include', signal: options.signal }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch intake');
  }
  const raw = await response.json() as unknown;
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Failed to fetch intake');
  }
  const json = raw as Record<string, unknown>;
  const data = (json.success !== undefined && json.data) ? json.data as Record<string, unknown> : json;
  if (json.success === false || !data || typeof data !== 'object' || !data.uuid) {
    throw new Error('Failed to fetch intake');
  }

  return data as unknown as PracticeIntakeDetail;
}

export async function updateIntakeTriageStatus(
  intakeUuid: string,
  payload: { status: 'accepted' | 'declined'; reason?: string },
  options: { signal?: AbortSignal } = {}
) {
  if (!intakeUuid) {
    throw new Error('intakeUuid is required');
  }

  const response = await fetch(clientIntakeStatus(intakeUuid), {
    method: 'PATCH',
    credentials: 'include',
    signal: options.signal,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      status: payload.status,
      ...(typeof payload.reason === 'string' ? { reason: payload.reason } : {}),
    }),
  });

  const json = await response.json().catch(() => null) as Record<string, unknown> | null;
  const data = (json !== null && 'data' in json) ? json.data as Record<string, unknown> | null : json;

  if (!response.ok || (json && json.success === false)) {
    throw new Error(String(json?.message ?? json?.error ?? `HTTP ${response.status}`));
  }

  return (data || null) as UpdateIntakeTriageStatusResponse | null;
}

export async function triggerIntakeInvite(
  intakeUuid: string,
  options: { signal?: AbortSignal } = {}
) {
  if (!intakeUuid) {
    throw new Error('intakeUuid is required');
  }

  const response = await fetch(clientIntakeInvite(intakeUuid), {
    method: 'POST',
    credentials: 'include',
    signal: options.signal,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  const json = await response.json().catch(() => null) as Record<string, unknown> | null;
  const data = (json !== null && 'data' in json) ? json.data as Record<string, unknown> | null : json;

  if (!response.ok || (json && json.success === false)) {
    throw new Error(String(json?.message ?? json?.error ?? `HTTP ${response.status}`));
  }

  return (data || null) as TriggerIntakeInviteResponse | null;
}

export interface IntakeStatusResponse {
  uuid: string;
  status: string;
  name: string;
  email: string;
  phone: string;
  description: string;
  opposing_party?: string;
  amount?: number;
  currency?: string;
  succeeded_at?: string;
  conversation_id?: string;
  metadata?: Record<string, unknown>;
}

export async function getIntakeStatus(intakeUuid: string) {
  // This endpoint currently exists
  const response = await fetch(clientIntakeStatus(intakeUuid), {
    credentials: 'include'
  });
  if (!response.ok) {
    throw new Error('Failed to fetch intake status');
  }
  const json = await response.json() as { success: boolean; data: IntakeStatusResponse };
  return json.data;
}
