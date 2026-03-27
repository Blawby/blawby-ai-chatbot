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
}

export type ConsultationStatus =
  | 'idle'
  | 'collecting_contact'
  | 'collecting_case'
  | 'ready_to_submit'
  | 'submitted'
  | 'completed';

export interface IntakeConversationState {
  practiceArea: string | null;
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
  turnCount: number;
  ctaShown: boolean;
  ctaResponse: 'ready' | 'not_yet' | null;
  notYetCount: number;
}

export interface ConsultationSubmissionState {
  intakeUuid: string | null;
  submittedAt: string | null;
  paymentRequired: boolean | null;
  paymentReceived: boolean | null;
}

export interface ConsultationState {
  status: ConsultationStatus;
  contact: SlimContactDraft | null;
  case: IntakeConversationState;
  submission: ConsultationSubmissionState;
  mode: 'REQUEST_CONSULTATION';
  version: number;
}

export const initialIntakeState: IntakeConversationState = {
  practiceArea: null,
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
  turnCount: 0,
  ctaShown: false,
  ctaResponse: null,
  notYetCount: 0
};

export const initialConsultationSubmissionState: ConsultationSubmissionState = {
  intakeUuid: null,
  submittedAt: null,
  paymentRequired: null,
  paymentReceived: null,
};

export const CONSULTATION_STATE_VERSION = 1;

export type IntakeFieldsPayload = {
  practiceArea?: string;
  description?: string;
  urgency?: IntakeUrgency;
  opposingParty?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  addressLine1?: string;
  addressLine2?: string;
  desiredOutcome?: string;
  courtDate?: string;
  income?: string;
  householdSize?: number;
  hasDocuments?: boolean;
  eligibilitySignals?: string[];
  ctaShown?: boolean;
};

export type IntakeFieldChangeOptions = {
  sendSystemAck?: boolean;
};

export interface DerivedIntakeStatus {
  step: IntakeStep;
  decision?: string;
  intakeUuid?: string;
  paymentRequired?: boolean;
  paymentReceived?: boolean;
}
