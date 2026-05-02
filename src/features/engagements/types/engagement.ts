/**
 * Engagement contract lifecycle: draft → sent → accepted | declined
 *
 * These types mirror the shared `proposal_data` contract defined in backend issue #213.
 * Neither side should invent fields outside this contract without updating both sides.
 */

export type EngagementStatus =
  | 'draft'
  | 'sent'
  | 'accepted'
  | 'declined';

// ── Conflict / Jurisdiction ────────────────────────────────────────────────────

export type ConflictStatus = 'clear' | 'review_required' | 'conflicted' | 'unknown' | 'insufficient_data';
export type JurisdictionStatus = 'supported' | 'unsupported' | 'unknown';

export interface RiskReview {
  conflict_status: ConflictStatus;
  jurisdiction_status: JurisdictionStatus;
  risk_notes?: string[] | null;
  open_questions?: string[] | null;
  conflict_note?: string | null;
}

// ── Proposal Data — shared contract ───────────────────────────────────────────

export interface ProposalRepresentation {
  scope_summary: string;
  included_services?: string[] | null;
  excluded_services?: string[] | null;
  client_identity_notes?: string | null;
  jurisdiction_notes?: string | null;
}

export interface ProposalFees {
  billing_type?: string | null;
  fixed_fee_amount?: number | null;
  hourly_rate_attorney?: number | null;
  hourly_rate_admin?: number | null;
  contingency_percentage?: number | null;
  retainer_amount?: number | null;
  payment_frequency?: string | null;
  fee_notes?: string | null;
}

export interface ProposalClientSummary {
  matter_summary?: string | null;
  location_summary?: string | null;
  goals_summary?: string | null;
  client_name?: string | null;
  co_clients?: string[] | null;
  non_clients?: string[] | null;
}

export interface ProposalDraftMeta {
  version: number;
  generated_at: string;
  generated_by?: string | null;
}

export interface ProposalData {
  representation: ProposalRepresentation;
  fees: ProposalFees;
  risk_review: RiskReview;
  client_summary: ProposalClientSummary;
  draft_meta: ProposalDraftMeta;
  source_snapshot?: {
    intake_uuid?: string | null;
    conversation_id?: string | null;
    matter_id?: string | null;
    practice_area?: string | null;
    urgency?: string | null;
    desired_outcome?: string | null;
    opposing_party?: string | null;
    court_date?: string | null;
  } | null;
  acknowledgment_language?: string | null;
  no_guarantee_language?: string | null;
}

// ── Backend engagement contract ───────────────────────────────────────────────

export interface EngagementListItem {
  id: string;
  matter_id: string;
  matter_number?: string | null;
  title?: string | null;
  status: EngagementStatus;
  client_name?: string | null;
  client_email?: string | null;
  practice_area?: string | null;
  proposal_data?: ProposalData | null;
  conversation_id?: string | null;
  organization_id: string;
  contract_body?: string | null;
  engagement_notes?: string | null;
  sent_at?: string | null;
  accepted_at?: string | null;
  declined_at?: string | null;
  signed_pdf_s3_key?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface EngagementDetail extends EngagementListItem {
  client_id?: string | null;
  description?: string | null;
  urgency?: string | null;
  opposing_party?: string | null;
  desired_outcome?: string | null;
  case_strength?: number | null;
}

export interface EngagementListResponse {
  items: EngagementListItem[];
  total: number;
  page: number;
  total_pages: number;
}

// ── Conflict override payload ──────────────────────────────────────────────────

export interface ConflictOverridePayload {
  conflict_status: ConflictStatus;
  override_reason: string;
}
