/**
 * Engagement lifecycle: intake_accepted → engagement_draft → engagement_sent → engagement_accepted → active
 *
 * These types mirror the shared `proposal_data` contract defined in backend issue #213.
 * Neither side should invent fields outside this contract without updating both sides.
 */

export type EngagementStatus =
  | 'engagement_draft'
  | 'engagement_sent'
  | 'engagement_accepted'
  | 'engagement_pending'
  | 'active'
  | 'intake_accepted';

// ── Conflict / Jurisdiction ────────────────────────────────────────────────────

export type ConflictStatus = 'clear' | 'review_required' | 'conflicted' | 'unknown' | 'insufficient_data';
export type JurisdictionStatus = 'supported' | 'unsupported' | 'unknown';

export interface RiskReview {
  conflict_status: ConflictStatus;
  jurisdiction_status: JurisdictionStatus;
  open_questions?: string[] | null;
  conflict_note?: string | null;
}

// ── Proposal Data — shared contract ───────────────────────────────────────────

export interface ProposalRepresentation {
  scope_summary: string;
  included_services?: string[] | null;
  excluded_services?: string[] | null;
}

export interface ProposalFees {
  billing_type?: string | null;
  rate?: number | null;
  currency?: string | null;
  retainer?: number | null;
  flat_fee?: number | null;
  contingency_pct?: number | null;
  payment_terms?: string | null;
}

export interface ProposalClientSummary {
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
  acknowledgment_language?: string | null;
  no_guarantee_language?: string | null;
}

// ── Backend Matter (engagement subset) ────────────────────────────────────────

export interface EngagementListItem {
  id: string;
  matter_number?: string | null;
  title?: string | null;
  status: EngagementStatus;
  client_name?: string | null;
  client_email?: string | null;
  practice_area?: string | null;
  proposal_data?: ProposalData | null;
  conversation_id?: string | null;
  organization_id: string;
  created_at: string;
  updated_at?: string | null;
}

export interface EngagementDetail extends EngagementListItem {
  client_id?: string | null;
  billing_type?: string | null;
  rate?: number | null;
  currency?: string | null;
  retainer?: number | null;
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
