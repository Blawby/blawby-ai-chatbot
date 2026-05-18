export type IntakeUrgency = 'routine' | 'time_sensitive' | 'emergency';
export type IntakeStep =
  | 'ready'
  | 'disclaimer'
  | 'contact_form_slim'
  | 'contact_form_decision'
  | 'ai_brief'
  | 'collecting_case'
  | 'ready_to_submit'
  | 'pending_review'
  | 'accepted'
  | 'rejected'
  | 'completed';

// ---------------------------------------------------------------------------
// Intake Template system
// ---------------------------------------------------------------------------

/**
 * Determines when a field is collected.
 * - 'required' — collected before submit is available (gates isIntakeReadyForSubmission)
 * - 'enrichment' — collected after the user opts in to "strengthen my case"
 * Replaces the boolean `required` flag for new templates; `required: true` maps to 'required'.
 */
export type FieldPhase = 'required' | 'enrichment';

/**
 * Simple dependency expression.
 * This field is only collected when dependsOn field equals value.
 * Both the AI prompt and the submission gate skip this field when unmet.
 * Example: { dependsOn: 'caseType', value: 'personal_injury' }
 */
export interface FieldCondition {
  /** Key of the field this field depends on */
  dependsOn: string;
  /** The value that field must equal for this field to be active */
  value: string | boolean | number;
}

export interface IntakeFieldDefinition {
  key: string;
  label: string;
  type: 'text' | 'select' | 'date' | 'boolean' | 'number';
  required: boolean;
  /** Only for type === 'select' */
  options?: string[];
  /** true = maps to an existing IntakeConversationState key; false = goes into customFields */
  isStandard: boolean;
  /** Short practice-facing description for template builder field pickers. */
  description?: string;
  /** Deterministic client-facing question used by previews and template demos. */
  previewQuestion?: string;
  /** Optional AI guidance for collecting this field. */
  promptHint?: string;
  /** Describes what counts as a valid answer for this field. */
  validationHint?: string;
  /**
   * Simple dependency expression.
   * This field is only collected when the referenced field matches value.
   * Both the AI prompt and the submission gate skip this field when unmet.
   */
  condition?: FieldCondition | null;
  /**
   * Canonical phase for this field.
   * When present, takes precedence over `required: boolean`.
   * New templates should set this; legacy templates without it fall back to:
   *   required === true  →  'required'
   *   required === false →  'enrichment'
   */
  phase?: FieldPhase;
  /**
   * Optional backend payload destination for this field.
   * Known values map collected answers to first-class backend intake fields
   * during submit. Unmapped custom fields are sent to backend intake metadata
   * under `custom_fields`.
   */
  mapsTo?: string;
}

export interface IntakeTemplate {
  slug: string;
  name: string;
  isDefault: boolean;
  introMessage?: string;
  legalDisclaimer?: string;
  paymentLinkEnabled?: boolean;
  consultationFee?: number;
  fields: IntakeFieldDefinition[];
}

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
  practiceServiceUuid: string | null;
  description: string | null;
  urgency: IntakeUrgency | null;
  opposingParty: string | null;
  city: string | null;
  state: string | null;
  desiredOutcome: string | null;
  courtDate: string | null;
  hasDocuments: boolean | null;
  householdSize: number | null;
  turnCount: number;
  ctaShown: boolean;
  ctaResponse: 'ready' | 'not_yet' | null;
  notYetCount: number;
  enrichmentMode: boolean | null;
  /** Values for non-standard fields defined by custom IntakeTemplates */
  customFields?: Record<string, string | number | boolean>;
}

export interface ConsultationSubmissionState {
  intakeUuid: string | null;
  submittedAt: string | null;
  paymentRequired: boolean | null;
  paymentReceived: boolean | null;
  checkoutSessionId: string | null;
  /** Slug of the IntakeTemplate used when this intake was collected */
  templateSlug?: string | null;
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
  practiceServiceUuid: null,
  description: null,
  urgency: null,
  opposingParty: null,
  city: null,
  state: null,
  desiredOutcome: null,
  courtDate: null,
  hasDocuments: null,
  householdSize: null,
  enrichmentMode: null,
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
  practiceServiceUuid?: string;
  description?: string;
  urgency?: IntakeUrgency;
  opposingParty?: string;
  city?: string;
  state?: string;
  desiredOutcome?: string;
  courtDate?: string;
  hasDocuments?: boolean;
  householdSize?: number | null;
  ctaShown?: boolean;
  intakeReady?: boolean;
  enrichmentMode?: boolean | null;
};

export type IntakeFieldChangeOptions = {
  sendSystemAck?: boolean;
};

export interface DerivedIntakeStatus {
  step: IntakeStep;
  decision?: string;
  intakeUuid?: string;
  submittedAt?: string | null;
  paymentRequired?: boolean;
  paymentReceived?: boolean;
  templateSlug?: string | null;
}
