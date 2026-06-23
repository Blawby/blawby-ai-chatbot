import { describe, expect, it, vi } from 'vitest';

import type { PracticeIntakeDetail } from '@/features/intake/api/intakesApi';
import {
  buildDeterministicContractBody,
  buildEngagementDraftFormFromIntake,
  buildProposalDataFromDraft,
  EMPTY_ENGAGEMENT_DRAFT_FORM,
} from '@/features/engagements/utils/engagementDraft';

const acceptedIntake: PracticeIntakeDetail = {
  uuid: 'intake-123',
  organization_id: 'practice-123',
  conversation_id: 'conversation-123',
  status: 'succeeded',
  triage_status: 'accepted',
  metadata: {
    email: 'jane@example.com',
    name: 'Jane Client',
    title: 'Custody consultation',
    description: 'Parenting schedule dispute',
    desired_outcome: 'Protect weekday parenting time',
    urgency: 'time_sensitive',
    opposing_party: 'John Other',
    court_date: '2026-06-15',
    practice_area: 'Family Law',
    address: {
      city: 'Austin',
      state: 'TX',
    },
  },
  created_at: '2026-05-22T06:52:21.651Z',
  amount: 0,
  currency: 'USD',
  payment_verified: false,
  stripe_charge_id: null,
  practice_area: 'Family Law',
  urgency: 'time_sensitive',
  desired_outcome: 'Protect weekday parenting time',
  court_date: '2026-06-15',
  has_documents: false,
  household_size: null,
  income: null,
  client_name: 'Jane Client',
};

describe('engagementDraft', () => {
  it('maps accepted intake metadata into proposal data without backend-invented values', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-22T10:00:00.000Z'));

    const form = buildEngagementDraftFormFromIntake(acceptedIntake, EMPTY_ENGAGEMENT_DRAFT_FORM);
    const proposal = buildProposalDataFromDraft(form);

    expect(proposal.client_summary).toMatchObject({
      client_name: 'Jane Client',
      matter_summary: 'Custody consultation',
      location_summary: 'Austin, TX',
      goals_summary: 'Protect weekday parenting time',
    });
    expect(proposal.representation.scope_summary).toBe('Custody consultation');
    expect(proposal.fees).toMatchObject({
      billing_type: '',
      fixed_fee_amount: null,
      hourly_rate_attorney: null,
      hourly_rate_admin: null,
      contingency_percentage: null,
      retainer_amount: null,
      payment_frequency: null,
      fee_notes: '',
    });
    expect(proposal.risk_review).toMatchObject({
      conflict_status: 'unknown',
      jurisdiction_status: 'unknown',
      risk_notes: [],
      open_questions: [],
    });
    expect(proposal.source_snapshot).toMatchObject({
      intake_uuid: 'intake-123',
      conversation_id: 'conversation-123',
      matter_id: '',
      practice_area: 'Family Law',
      urgency: 'time_sensitive',
      desired_outcome: 'Protect weekday parenting time',
      opposing_party: 'John Other',
      court_date: '2026-06-15',
    });
    expect(proposal.draft_meta).toEqual({
      generated_at: '2026-05-22T10:00:00.000Z',
      generated_by: 'staff',
      version: 1,
    });

    vi.useRealTimers();
  });

  it('serializes missing required string fields as empty strings and arrays', () => {
    const form = buildEngagementDraftFormFromIntake({
      ...acceptedIntake,
      conversation_id: null,
      metadata: undefined,
      practice_area: null,
      urgency: null,
      desired_outcome: null,
      court_date: null,
      client_name: undefined,
    });
    const proposal = buildProposalDataFromDraft(form);

    expect(proposal.client_summary.client_name).toBe('');
    expect(proposal.client_summary.location_summary).toBe('');
    expect(proposal.representation.included_services).toEqual([]);
    expect(proposal.risk_review.open_questions).toEqual([]);
    expect(proposal.source_snapshot?.conversation_id).toBe('');
    expect(proposal.source_snapshot?.matter_id).toBe('');
    expect(proposal.source_snapshot?.practice_area).toBe('');
    expect(proposal.source_snapshot?.urgency).toBe('');
    expect(proposal.source_snapshot?.court_date).toBeNull();
  });

  it('generates contract body deterministically from current form data', () => {
    const form = {
      ...EMPTY_ENGAGEMENT_DRAFT_FORM,
      clientName: 'Jane Client',
      matterSummary: 'Custody consultation',
      scopeSummary: 'Limited-scope advice and drafting.',
      includedServices: 'Review facts\nDraft agreement',
      excludedServices: 'Trial representation',
      feeNotes: 'Fixed fee due before work begins.',
    };

    expect(buildDeterministicContractBody(form)).toMatchInlineSnapshot(`
      "Engagement Letter for Jane Client

      This engagement letter confirms the proposed representation for Custody consultation.

      Scope of Representation

      Limited-scope advice and drafting.

      Included services:
      - Review facts
      - Draft agreement

      Excluded services:
      - Trial representation

      Fees and Billing

      Fixed fee due before work begins.

      Client Acknowledgment

      By accepting this engagement, the client confirms they have reviewed the scope, billing terms, and responsibilities described in this agreement.

      No Guarantee

      The practice will provide legal services diligently and professionally, but no outcome is guaranteed."
    `);
  });
});
