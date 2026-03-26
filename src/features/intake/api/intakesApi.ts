import { clientIntakeClaim, clientIntakeStatus, clientIntakes } from '@/config/urls';

export interface IntakeListParams {
  page: number;
  status: 'all' | 'pending' | 'succeeded' | 'expired';
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
    phone?: string;
    on_behalf_of?: string;
    opposing_party?: string;
    description?: string;
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
    phone?: string;
    on_behalf_of?: string;
    opposing_party?: string;
    description?: string;
    user_id?: string;
    address?: Record<string, unknown>;
    [key: string]: unknown;
  };
  stripe_charge_id?: string;
  urgency?: 'routine' | 'time_sensitive' | 'emergency' | null | string;
  succeeded_at?: string | null;
  created_at: string;
}

export interface UpdateIntakeTriageStatusResponse {
  conversation_id?: string | null;
  conversationId?: string | null;
  triage_status?: string | null;
  triage_reason?: string | null;
}

export async function listIntakes(practiceId: string, params: IntakeListParams) {
  if (!practiceId) {
    throw new Error('practiceId is required');
  }

  const response = await fetch(
    clientIntakes(practiceId, {
      page: String(params.page),
      status: params.status !== 'all' ? params.status : undefined
    }),
    { credentials: 'include' }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch intakes');
  }

  const json = await response.json() as {
    success?: boolean;
    data?: IntakeListResponse;
  };

  if (json.success === false || !json.data) {
    throw new Error('Failed to fetch intakes');
  }

  return {
    intakes: Array.isArray(json.data.intakes) ? json.data.intakes : [],
    total: typeof json.data.total === 'number' ? json.data.total : 0,
    page: typeof json.data.page === 'number' ? json.data.page : params.page,
    total_pages: typeof json.data.total_pages === 'number' ? json.data.total_pages : 0,
    limit: typeof json.data.limit === 'number' ? json.data.limit : undefined,
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
    clientIntakes(practiceId, {
      intake_id: intakeId,
      page: '1',
      limit: '1'
    }),
    { credentials: 'include', signal: options.signal }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch intake');
  }

  const json = await response.json() as {
    success?: boolean;
    data?: {
      intakes?: PracticeIntakeDetail[];
    };
  };

  const intake = Array.isArray(json.data?.intakes) ? json.data.intakes[0] : null;

  if (json.success === false || !intake) {
    throw new Error('Failed to fetch intake');
  }

  return intake as PracticeIntakeDetail;
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
    body: JSON.stringify(payload)
  });

  const json = await response.json().catch(() => null) as {
    success?: boolean;
    data?: UpdateIntakeTriageStatusResponse;
    error?: string;
    message?: string;
  } | null;

  if (!response.ok || json?.success === false) {
    throw new Error(json?.message ?? json?.error ?? `HTTP ${response.status}`);
  }

  return json?.data ?? null;
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

export interface ClaimIntakePaymentResponse {
  intake_uuid: string;
  organization_id: string;
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

export async function claimIntakePayment(sessionId: string): Promise<ClaimIntakePaymentResponse | null> {
  if (!sessionId) {
    throw new Error('sessionId is required');
  }

  const response = await fetch(clientIntakeClaim(), {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ session_id: sessionId })
  });

  const json = await response.json().catch(() => null) as {
    success?: boolean;
    data?: ClaimIntakePaymentResponse;
    error?: string;
    message?: string;
  } | null;

  const errorText = [json?.error, json?.message].filter((value): value is string => typeof value === 'string' && value.length > 0).join(' ');
  const isConflict = response.status === 409 || /already\s+(?:claimed|attached)|duplicate|conflict/i.test(errorText);

  if (isConflict) {
    return json?.data ?? null;
  }

  if (!response.ok || json?.success === false || !json?.data) {
    throw new Error(json?.error || 'Failed to claim intake');
  }

  return json.data;
}
