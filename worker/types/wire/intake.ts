/**
 * Wire types for intake submission — single source of truth for the
 * `/api/conversations/:id/submit-intake` and `RemoteApiService.createIntake`
 * payloads and responses.
 *
 * Snake_case fields match the backend contract verbatim. The frontend
 * types (camelCase) live alongside their hooks/services and adapt to
 * these.
 */

export interface BackendIntakeCreatePayload {
  slug: string;
  amount: number;
  name: string;
  email: string;
  user_id?: string;
  phone?: string;
  conversation_id: string;
  description?: string;
  urgency?: string;
  opposing_party?: string;
  desired_outcome?: string;
  court_date?: string;
  case_strength?: number;
  has_documents?: boolean;
  income?: number;
  household_size?: number;
  practice_service_uuid?: string;
  address?: {
    city?: string;
    state?: string;
  };
  /** Plain-text digest of the intake conversation; max 4000 chars. Used by backend to bootstrap proposal_data. */
  transcript_summary?: string;
  /** Template attribution and unmapped custom answers stored in backend intake metadata. */
  custom_fields?: Record<string, string | number | boolean>;
}

export interface BackendIntakeCreateResponse {
  success: boolean;
  data?: {
    uuid: string;
    status: string;
    payment_link_url: string | null;
    organization?: {
      name?: string | null;
      [key: string]: unknown;
    } | null;
    [key: string]: unknown;
  };
  error?: string;
}
