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
  desiredOutcome: string | null;
  courtDate: string | null;
  hasDocuments: boolean | null;
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
  checkoutSessionId: string | null;
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
  desiredOutcome: null,
  courtDate: null,
  hasDocuments: null,
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
  checkoutSessionId: null,
};

export const CONSULTATION_STATE_VERSION = 1;

export type IntakeFieldsPayload = {
  practiceArea?: string;
  description?: string;
  urgency?: IntakeUrgency;
  opposingParty?: string;
  city?: string;
  state?: string;
  desiredOutcome?: string;
  courtDate?: string;
  hasDocuments?: boolean;
  ctaShown?: boolean;
  intakeReady?: boolean;
  quickReplies?: string[] | null;
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
