import type { IntakeListItem, PracticeIntakeDetail } from '@/features/intake/api/intakesApi';
import { resolveIntakeTitle } from '@/features/intake/utils/intakeTitle';
import type { ProposalData, ProposalFees } from '@/features/engagements/types/engagement';
import type { IntakeEnrichedData } from '@/shared/types/intake';

export type EngagementDraftForm = {
  intakeId: string;
  contractBody: string;
  engagementNotes: string;
  clientName: string;
  matterSummary: string;
  locationSummary: string;
  goalsSummary: string;
  scopeSummary: string;
  includedServices: string;
  excludedServices: string;
  clientIdentityNotes: string;
  jurisdictionNotes: string;
  billingType: string;
  fixedFeeAmount: string;
  hourlyRateAttorney: string;
  hourlyRateAdmin: string;
  contingencyPercentage: string;
  retainerAmount: string;
  paymentFrequency: string;
  feeNotes: string;
  conflictStatus: ProposalData['risk_review']['conflict_status'];
  jurisdictionStatus: ProposalData['risk_review']['jurisdiction_status'];
  riskNotes: string;
  openQuestions: string;
  practiceArea: string;
  urgency: string;
  desiredOutcome: string;
  opposingParty: string;
  courtDate: string;
  conversationId: string;
  matterId: string;
};

type IntakeLike = IntakeListItem | PracticeIntakeDetail;

export const EMPTY_ENGAGEMENT_DRAFT_FORM: EngagementDraftForm = {
  intakeId: '',
  contractBody: '',
  engagementNotes: '',
  clientName: '',
  matterSummary: '',
  locationSummary: '',
  goalsSummary: '',
  scopeSummary: '',
  includedServices: '',
  excludedServices: '',
  clientIdentityNotes: '',
  jurisdictionNotes: '',
  billingType: '',
  fixedFeeAmount: '',
  hourlyRateAttorney: '',
  hourlyRateAdmin: '',
  contingencyPercentage: '',
  retainerAmount: '',
  paymentFrequency: '',
  feeNotes: '',
  conflictStatus: 'unknown',
  jurisdictionStatus: 'unknown',
  riskNotes: '',
  openQuestions: '',
  practiceArea: '',
  urgency: '',
  desiredOutcome: '',
  opposingParty: '',
  courtDate: '',
  conversationId: '',
  matterId: '',
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

const stringValue = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const nullableString = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const requiredString = (value: string): string => value.trim();

const numberOrNull = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const lineEntries = (value: string): string[] =>
  value
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean);

const firstString = (...values: unknown[]): string => {
  for (const value of values) {
    const resolved = stringValue(value);
    if (resolved) return resolved;
  }
  return '';
};

export const buildEngagementDraftFormFromIntake = (
  intake: IntakeLike,
  current: EngagementDraftForm = EMPTY_ENGAGEMENT_DRAFT_FORM,
): EngagementDraftForm => {
  const metadata = asRecord(intake.metadata);
  const customFields = asRecord(metadata.custom_fields ?? metadata.customFields);
  const address = asRecord(metadata.address);
  const locationSummary = [
    stringValue(address.city),
    stringValue(address.state),
  ].filter(Boolean).join(', ');

  // Read AI enrichment stored at submission time. Prefer enriched fields over raw intake values.
  let enriched: IntakeEnrichedData | null = null;
  const enrichedRaw = customFields._enriched_data;
  if (typeof enrichedRaw === 'string') {
    try { enriched = JSON.parse(enrichedRaw) as IntakeEnrichedData; } catch { /* ignore */ }
  }

  const matterSummary = firstString(
    enriched?.ai_matter_description,
    resolveIntakeTitle(metadata, firstString(metadata.description, metadata.title, metadata.intake_title, '')),
  );
  const desiredOutcome = firstString((intake as PracticeIntakeDetail).desired_outcome, metadata.desired_outcome);
  const practiceArea = firstString(
    enriched?.practice_area,
    (intake as PracticeIntakeDetail).practice_area,
    metadata.practice_area,
    customFields.practice_area,
  );
  const scopeSuggestion = firstString(enriched?.ai_scope_suggestion, '');
  const urgency = firstString((intake as PracticeIntakeDetail).urgency, metadata.urgency);
  const opposingParty = firstString(metadata.opposing_party, customFields.opposing_party);
  const courtDate = firstString((intake as PracticeIntakeDetail).court_date, metadata.court_date, customFields.court_date);

  const next: EngagementDraftForm = {
    ...current,
    intakeId: intake.uuid,
    clientName: firstString(metadata.name, (intake as PracticeIntakeDetail).client_name, current.clientName),
    matterSummary: current.matterSummary || matterSummary,
    locationSummary: current.locationSummary || locationSummary,
    goalsSummary: current.goalsSummary || desiredOutcome,
    scopeSummary: current.scopeSummary || scopeSuggestion || matterSummary,
    practiceArea: current.practiceArea || practiceArea,
    urgency: current.urgency || urgency,
    desiredOutcome: current.desiredOutcome || desiredOutcome,
    opposingParty: current.opposingParty || opposingParty,
    courtDate: current.courtDate || courtDate,
    conversationId: current.conversationId || firstString(intake.conversation_id, metadata.conversation_id),
  };

  return {
    ...next,
    contractBody: current.contractBody || buildDeterministicContractBody(next),
  };
};


export const buildProposalDataFromDraft = (form: EngagementDraftForm): ProposalData => {
  const fees: ProposalFees = {
    billing_type: requiredString(form.billingType),
    fixed_fee_amount: numberOrNull(form.fixedFeeAmount),
    hourly_rate_attorney: numberOrNull(form.hourlyRateAttorney),
    hourly_rate_admin: numberOrNull(form.hourlyRateAdmin),
    contingency_percentage: numberOrNull(form.contingencyPercentage),
    retainer_amount: numberOrNull(form.retainerAmount),
    payment_frequency: nullableString(form.paymentFrequency),
    fee_notes: requiredString(form.feeNotes),
  };

  return {
    client_summary: {
      client_name: requiredString(form.clientName),
      matter_summary: requiredString(form.matterSummary),
      location_summary: requiredString(form.locationSummary),
      goals_summary: requiredString(form.goalsSummary),
    },
    representation: {
      scope_summary: form.scopeSummary.trim(),
      included_services: lineEntries(form.includedServices),
      excluded_services: lineEntries(form.excludedServices),
      client_identity_notes: requiredString(form.clientIdentityNotes),
      jurisdiction_notes: requiredString(form.jurisdictionNotes),
    },
    fees,
    risk_review: {
      conflict_status: form.conflictStatus,
      jurisdiction_status: form.jurisdictionStatus,
      risk_notes: lineEntries(form.riskNotes),
      open_questions: lineEntries(form.openQuestions),
    },
    source_snapshot: {
      intake_uuid: requiredString(form.intakeId),
      conversation_id: requiredString(form.conversationId),
      matter_id: requiredString(form.matterId),
      practice_area: requiredString(form.practiceArea),
      urgency: requiredString(form.urgency),
      desired_outcome: requiredString(form.desiredOutcome),
      opposing_party: requiredString(form.opposingParty),
      court_date: nullableString(form.courtDate),
    },
    draft_meta: {
      generated_at: new Date().toISOString(),
      generated_by: 'staff',
      version: 1,
    },
  };
};

export const buildDeterministicContractBody = (form: EngagementDraftForm): string => {
  const clientName = form.clientName.trim() || 'Client';
  const matterSummary = form.matterSummary.trim() || 'the legal matter described in the intake';
  const scopeSummary = form.scopeSummary.trim() || matterSummary;
  const goalsSummary = form.goalsSummary.trim();
  const feeNotes = form.feeNotes.trim();
  const included = lineEntries(form.includedServices);
  const excluded = lineEntries(form.excludedServices);

  return [
    `Engagement Letter for ${clientName}`,
    '',
    `This engagement letter confirms the proposed representation for ${matterSummary}.`,
    '',
    'Scope of Representation',
    scopeSummary,
    included.length ? `Included services:\n${included.map((item) => `- ${item}`).join('\n')}` : '',
    excluded.length ? `Excluded services:\n${excluded.map((item) => `- ${item}`).join('\n')}` : '',
    goalsSummary ? `Client goals:\n${goalsSummary}` : '',
    '',
    'Fees and Billing',
    feeNotes || 'Fee terms will be governed by the billing details in this engagement agreement.',
    '',
    'Client Acknowledgment',
    'By accepting this engagement, the client confirms they have reviewed the scope, billing terms, and responsibilities described in this agreement.',
    '',
    'No Guarantee',
    'The practice will provide legal services diligently and professionally, but no outcome is guaranteed.',
  ].filter((part) => part.trim().length > 0).join('\n\n');
};
