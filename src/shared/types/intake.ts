export type IntakeCaseStrength = 'needs_more_info' | 'developing' | 'strong';
export type IntakeUrgency = 'routine' | 'time_sensitive' | 'emergency';
export type IntakeStep =
  | 'ready'
  | 'contact_form_slim'
  | 'contact_form_decision'
  | 'ai_brief'
  | 'pending_review'
  | 'accepted'
  | 'rejected'
  | 'completed';

export interface SlimContactDraft {
  name: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  opposingParty?: string;
  description?: string;
}

export interface IntakeConversationState {
  practiceArea: string | null;
  practiceAreaName: string | null;
  description: string | null;
  urgency: IntakeUrgency | null;
  opposingParty: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  desiredOutcome: string | null;
  courtDate: string | null;
  income: string | null;
  householdSize: number | null;
  hasDocuments: boolean | null;
  eligibilitySignals: string[] | null;
  caseStrength: IntakeCaseStrength | null;
  missingSummary: string | null;
  turnCount: number;
  ctaShown: boolean;
  ctaResponse: 'ready' | 'not_yet' | null;
  notYetCount: number;
}

export const initialIntakeState: IntakeConversationState = {
  practiceArea: null,
  practiceAreaName: null,
  description: null,
  urgency: null,
  opposingParty: null,
  city: null,
  state: null,
  postalCode: null,
  country: null,
  addressLine1: null,
  addressLine2: null,
  desiredOutcome: null,
  courtDate: null,
  income: null,
  householdSize: null,
  hasDocuments: null,
  eligibilitySignals: null,
  caseStrength: null,
  missingSummary: null,
  turnCount: 0,
  ctaShown: false,
  ctaResponse: null,
  notYetCount: 0
};
