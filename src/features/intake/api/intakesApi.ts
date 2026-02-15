export interface IntakeListParams {
  page: number;
  status: 'all' | 'pending' | 'succeeded' | 'expired';
}

export async function listIntakes(practiceId: string, params: IntakeListParams) {
  // Return empty array until endpoint ships
  return { intakes: [], total: 0, page: 1, total_pages: 0 };
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
  metadata?: Record<string, any>;
}

export async function getIntakeStatus(intakeUuid: string) {
  // This endpoint currently exists
  const response = await fetch(`/api/practice/client-intakes/${encodeURIComponent(intakeUuid)}/status`);
  if (!response.ok) {
    throw new Error('Failed to fetch intake status');
  }
  const json = await response.json() as { success: boolean; data: IntakeStatusResponse };
  return json.data;
}

export async function triggerIntakeInvite(intakeUuid: string) {
  const response = await fetch(`/api/practice/client-intakes/${encodeURIComponent(intakeUuid)}/invite`, {
    method: 'POST'
  });
  if (!response.ok) {
    throw new Error('Failed to trigger invite');
  }
  return await response.json();
}
