import type { ConversationMetadata } from '../types/conversation';
import {
  CONSULTATION_STATE_VERSION,
  initialConsultationSubmissionState,
  initialIntakeState,
  type ConsultationState,
  type ConsultationStatus,
  type IntakeConversationState,
  type SlimContactDraft,
} from '../types/intake';

type ConsultationPatch = {
  status?: ConsultationStatus;
  contact?: SlimContactDraft | null;
  case?: IntakeConversationState | Partial<IntakeConversationState> | null;
  submission?: Partial<ConsultationState['submission']> | null;
  mode?: ConsultationState['mode'];
  version?: number;
};

type ApplyConsultationPatchOptions = {
  allowReset?: boolean;
  mirrorLegacyFields?: boolean;
};

const trimString = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const normalizeBooleanOrNull = (value: unknown): boolean | null => (
  typeof value === 'boolean' ? value : null
);

const normalizeNumberOrNull = (value: unknown): number | null => (
  typeof value === 'number' && Number.isFinite(value) ? value : null
);

const hasNonEmptyString = (value: unknown): boolean => (
  typeof value === 'string' && value.trim().length > 0
);

export const hasCoreIntakeFields = (
  state: IntakeConversationState | Partial<IntakeConversationState> | null | undefined
): boolean => {
  if (!state) return false;
  return hasNonEmptyString(state.description)
    && hasNonEmptyString(state.city)
    && hasNonEmptyString(state.state);
};

const isEmptyContact = (value: SlimContactDraft | null | undefined): boolean => !value
  || (!trimString(value.name) && !trimString(value.email) && !trimString(value.phone));

const mergeContact = (
  normalized: SlimContactDraft | null,
  source: SlimContactDraft | null | undefined
): SlimContactDraft | null => {
  const sourceContact = normalizeSlimContactDraft(source);
  if (isEmptyContact(normalized) && isEmptyContact(sourceContact)) return null;
  return {
    name: trimString(normalized?.name) || trimString(sourceContact?.name),
    email: trimString(normalized?.email) || trimString(sourceContact?.email),
    phone: trimString(normalized?.phone) || trimString(sourceContact?.phone),
  };
};

const mergeIntakeState = (
  normalized: IntakeConversationState,
  source: IntakeConversationState | null | undefined
): IntakeConversationState => {
  const fallback = source ?? initialIntakeState;
  return {
    practiceArea: normalized.practiceArea ?? fallback.practiceArea,
    description: normalized.description ?? fallback.description,
    urgency: normalized.urgency ?? fallback.urgency,
    opposingParty: normalized.opposingParty ?? fallback.opposingParty,
    city: normalized.city ?? fallback.city,
    state: normalized.state ?? fallback.state,
    desiredOutcome: normalized.desiredOutcome ?? fallback.desiredOutcome,
    courtDate: normalized.courtDate ?? fallback.courtDate,
    hasDocuments: normalized.hasDocuments ?? fallback.hasDocuments,
    householdSize: normalized.householdSize ?? fallback.householdSize,
    enrichmentMode: normalized.enrichmentMode ?? fallback.enrichmentMode,
    turnCount: normalized.turnCount > 0 ? normalized.turnCount : fallback.turnCount,
    ctaShown: normalized.ctaShown || fallback.ctaShown || false,
    ctaResponse: normalized.ctaResponse ?? fallback.ctaResponse,
    notYetCount: normalized.notYetCount > 0 ? normalized.notYetCount : fallback.notYetCount,
  };
};

const mergeSubmission = (
  normalized: ConsultationState['submission'],
  source: Record<string, unknown> | null | undefined
): ConsultationState['submission'] => {
  const fallbackUuid = typeof source?.intakeUuid === 'string' && source.intakeUuid.trim().length > 0
    ? source.intakeUuid.trim()
    : null;
  const fallbackPaymentRequired = typeof source?.intakePaymentRequired === 'boolean'
    ? source.intakePaymentRequired
    : null;
  const fallbackPaymentReceived = typeof source?.intakePaymentReceived === 'boolean'
    ? source.intakePaymentReceived
    : null;
  const fallbackCheckoutSessionId = trimString(source?.checkoutSessionId) || null;
  return {
    intakeUuid: normalized.intakeUuid ?? fallbackUuid,
    submittedAt: normalized.submittedAt ?? (trimString(source?.submittedAt) || null),
    paymentRequired: normalized.paymentRequired ?? fallbackPaymentRequired,
    paymentReceived: normalized.paymentReceived ?? fallbackPaymentReceived,
    checkoutSessionId: normalized.checkoutSessionId ?? fallbackCheckoutSessionId,
  };
};

const CONSULTATION_STATUS_ORDER: ConsultationStatus[] = [
  'idle',
  'collecting_contact',
  'collecting_case',
  'ready_to_submit',
  'submitted',
  'completed',
];

const statusRank = (value: ConsultationStatus): number => CONSULTATION_STATUS_ORDER.indexOf(value);

export const normalizeSlimContactDraft = (value: unknown): SlimContactDraft | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const name = trimString(record.name);
  const email = trimString(record.email);
  const phone = trimString(record.phone);
  if (!name && !email && !phone) return null;
  return { name, email, phone };
};

export const hasConsultationContact = (value: SlimContactDraft | null | undefined): boolean => Boolean(
  value && (trimString(value.name) || trimString(value.email) || trimString(value.phone))
);

export const isIntakeReadyForSubmission = (
  state: IntakeConversationState | Partial<IntakeConversationState> | null | undefined
): boolean => {
  return hasCoreIntakeFields(state);
};

export const isIntakeSubmittable = (
  state: IntakeConversationState | Partial<IntakeConversationState> | null | undefined,
  submission?: {
    paymentRequired?: boolean | null;
    paymentReceived?: boolean | null;
  } | null
): boolean => {
  if (!isIntakeReadyForSubmission(state)) return false;
  const paymentRequired = submission?.paymentRequired === true;
  const paymentReceived = submission?.paymentReceived === true;
  return !paymentRequired || paymentReceived;
};

export const normalizeIntakeConversationState = (value: unknown): IntakeConversationState => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...initialIntakeState };
  }
  const record = value as Record<string, unknown>;
  const urgency = trimString(record.urgency);
  const nextState: IntakeConversationState = {
    practiceArea: trimString(record.practiceArea) || null,
    description: trimString(record.description) || null,
    urgency: (urgency || null) as IntakeConversationState['urgency'],
    opposingParty: trimString(record.opposingParty) || null,
    city: trimString(record.city) || null,
    state: trimString(record.state) || null,
    desiredOutcome: trimString(record.desiredOutcome) || null,
    courtDate: trimString(record.courtDate) || null,
    hasDocuments: typeof record.hasDocuments === 'boolean' ? record.hasDocuments : null,
    householdSize: normalizeNumberOrNull(record.householdSize),
    enrichmentMode: typeof record.enrichmentMode === 'boolean' ? record.enrichmentMode : null,
    turnCount: normalizeNumberOrNull(record.turnCount) ?? 0,
    ctaShown: typeof record.ctaShown === 'boolean' ? record.ctaShown : false,
    ctaResponse:
      record.ctaResponse === 'ready' || record.ctaResponse === 'not_yet'
        ? record.ctaResponse
        : null,
    notYetCount: normalizeNumberOrNull(record.notYetCount) ?? 0,
  };
  return nextState;
};

const normalizeConsultationSubmission = (value: unknown): ConsultationState['submission'] => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...initialConsultationSubmissionState };
  }
  const record = value as Record<string, unknown>;
  return {
    intakeUuid: trimString(record.intakeUuid) || null,
    submittedAt: trimString(record.submittedAt) || null,
    paymentRequired: normalizeBooleanOrNull(record.paymentRequired),
    paymentReceived: normalizeBooleanOrNull(record.paymentReceived),
    checkoutSessionId: trimString(record.checkoutSessionId) || null,
  };
};

export const hasConsultationSignals = (metadata: Record<string, unknown> | null | undefined): boolean => {
  if (!metadata) return false;
  return (
    metadata.mode === 'REQUEST_CONSULTATION'
    || Boolean(metadata.consultation)
    || Boolean(metadata.intakeConversationState)
    || Boolean(metadata.intakeSlimContactDraft)
    || metadata.intakeAiBriefActive === true
    || metadata.intakeSubmitted === true
    || metadata.intakeCompleted === true
    || typeof metadata.intakeUuid === 'string'
  );
};

const deriveConsultationStatus = (
  metadata: Record<string, unknown> | null | undefined,
  contact: SlimContactDraft | null,
  caseState: IntakeConversationState,
  submission: ConsultationState['submission']
): ConsultationStatus => {
  if (metadata?.intakeCompleted === true) return 'completed';
  if (submission.intakeUuid || metadata?.intakeSubmitted === true) return 'submitted';
  if (caseState.ctaResponse === 'ready') return 'ready_to_submit';
  if (hasConsultationContact(contact)) return 'collecting_case';
  return 'collecting_contact';
};

export const createConsultationState = (
  overrides?: Partial<ConsultationState>
): ConsultationState => ({
  status: overrides?.status ?? 'collecting_contact',
  contact: overrides?.contact ?? null,
  case: overrides?.case ? normalizeIntakeConversationState(overrides.case) : { ...initialIntakeState },
  submission: overrides?.submission
    ? { ...initialConsultationSubmissionState, ...overrides.submission }
    : { ...initialConsultationSubmissionState },
  mode: overrides?.mode ?? 'REQUEST_CONSULTATION',
  version: overrides?.version ?? CONSULTATION_STATE_VERSION,
});

export const resolveConsultationState = (
  metadata: ConversationMetadata | Record<string, unknown> | null | undefined
): ConsultationState | null => {
  const source = metadata ?? null;
  if (!source) return null;
  if (!hasConsultationSignals(source)) return null;

  const existingConsultation =
    source.consultation && typeof source.consultation === 'object' && !Array.isArray(source.consultation)
      ? source.consultation as Record<string, unknown>
      : null;

  const sourceContact = normalizeSlimContactDraft(source.intakeSlimContactDraft);
  const consultationContact = normalizeSlimContactDraft(existingConsultation?.contact);
  const contact = mergeContact(consultationContact, sourceContact);

  const sourceCase = normalizeIntakeConversationState(source.intakeConversationState);
  const consultationCase = normalizeIntakeConversationState(existingConsultation?.case);
  const caseState = mergeIntakeState(consultationCase, sourceCase);

  const sourceSubmission = {
    intakeUuid: typeof source.intakeUuid === 'string' ? source.intakeUuid : null,
    submittedAt: typeof (source as Record<string, unknown>).submittedAt === 'string'
      ? (source as Record<string, unknown>).submittedAt as string
      : null,
    paymentRequired: typeof source.intakePaymentRequired === 'boolean' ? source.intakePaymentRequired : null,
    paymentReceived: typeof source.intakePaymentReceived === 'boolean' ? source.intakePaymentReceived : null,
  };
  const consultationSubmission = normalizeConsultationSubmission(existingConsultation?.submission);
  const submission = mergeSubmission(
    consultationSubmission,
    sourceSubmission
  );

  const statusCandidate = trimString(existingConsultation?.status) as ConsultationStatus;
  const derivedStatus = deriveConsultationStatus(source, contact, caseState, submission);
  const status = (
    statusCandidate === 'idle'
    || statusCandidate === 'collecting_contact'
    || statusCandidate === 'collecting_case'
    || statusCandidate === 'ready_to_submit'
    || statusCandidate === 'submitted'
    || statusCandidate === 'completed'
  ) && statusRank(statusCandidate) >= statusRank(derivedStatus)
    ? statusCandidate
    : derivedStatus;

  return {
    status,
    contact,
    case: caseState,
    submission,
    mode: 'REQUEST_CONSULTATION',
    version:
      typeof existingConsultation?.version === 'number' && Number.isFinite(existingConsultation.version)
        ? existingConsultation.version
        : CONSULTATION_STATE_VERSION,
  };
};

export const mergeConsultationState = (
  existing: ConsultationState | null | undefined,
  patch: ConsultationPatch,
  options?: ApplyConsultationPatchOptions
): ConsultationState => {
  const allowReset = options?.allowReset === true;
  const base = existing ? resolveConsultationState({ consultation: existing }) ?? createConsultationState() : createConsultationState();
  const previousStatus = base.status;

  const nextContact = (() => {
    if (patch.contact === undefined) return base.contact;
    if (patch.contact === null) return allowReset ? null : base.contact;
    return normalizeSlimContactDraft(patch.contact) ?? (allowReset ? null : base.contact);
  })();

  const nextCase = (() => {
    if (patch.case === undefined) return base.case;
    if (patch.case === null) return allowReset ? { ...initialIntakeState } : base.case;
    return normalizeIntakeConversationState({ ...base.case, ...patch.case });
  })();

  const nextSubmission = (() => {
    if (patch.submission === undefined) return base.submission;
    if (patch.submission === null) {
      return allowReset ? { ...initialConsultationSubmissionState } : base.submission;
    }
    return {
      ...base.submission,
      ...patch.submission,
      intakeUuid:
        patch.submission.intakeUuid === undefined
          ? base.submission.intakeUuid
          : trimString(patch.submission.intakeUuid) || null,
      submittedAt:
        patch.submission.submittedAt === undefined
          ? base.submission.submittedAt
          : trimString(patch.submission.submittedAt) || null,
      paymentRequired:
        patch.submission.paymentRequired === undefined
          ? base.submission.paymentRequired
          : normalizeBooleanOrNull(patch.submission.paymentRequired),
      paymentReceived:
        patch.submission.paymentReceived === undefined
          ? base.submission.paymentReceived
          : normalizeBooleanOrNull(patch.submission.paymentReceived),
      checkoutSessionId:
        patch.submission.checkoutSessionId === undefined
          ? base.submission.checkoutSessionId ?? null
          : trimString(patch.submission.checkoutSessionId) || null,
    };
  })();

  const derivedNextStatus = deriveConsultationStatus(
    { mode: 'REQUEST_CONSULTATION', intakeUuid: nextSubmission.intakeUuid, intakeSubmitted: Boolean(nextSubmission.intakeUuid) },
    nextContact,
    nextCase,
    nextSubmission
  );
  const nextStatus = (
    previousStatus === 'submitted'
    || previousStatus === 'completed'
    || previousStatus === 'ready_to_submit'
  ) && patch.status === undefined
    ? previousStatus
    : patch.status ?? derivedNextStatus;

  return {
    status: nextStatus,
    contact: nextContact,
    case: nextCase,
    submission: nextSubmission,
    mode: patch.mode ?? base.mode ?? 'REQUEST_CONSULTATION',
    version: patch.version ?? base.version ?? CONSULTATION_STATE_VERSION,
  };
};

export const applyConsultationPatchToMetadata = (
  metadata: ConversationMetadata | null | undefined,
  patch: ConsultationPatch,
  options?: ApplyConsultationPatchOptions
): ConversationMetadata => {
  const previous = metadata ?? {};
  const currentConsultation = resolveConsultationState(previous);
  const consultation = mergeConsultationState(currentConsultation, patch, options);
  const nextMetadata: ConversationMetadata = {
    ...previous,
    consultation,
    mode: consultation.mode,
  };

  if (options?.mirrorLegacyFields !== false) {
    nextMetadata.intakeConversationState = consultation.case;
    nextMetadata.intakeSlimContactDraft = consultation.contact;
    nextMetadata.intakeAiBriefActive = (
      consultation.status === 'collecting_case'
      || consultation.status === 'ready_to_submit'
    );
    nextMetadata.intakeUuid = consultation.submission.intakeUuid;
    nextMetadata.intakePaymentRequired = consultation.submission.paymentRequired ?? undefined;
    nextMetadata.intakePaymentReceived = consultation.submission.paymentReceived ?? undefined;
    nextMetadata.intakeSubmitted = (
      consultation.status === 'submitted'
      || consultation.status === 'completed'
      || Boolean(consultation.submission.intakeUuid)
    );
    nextMetadata.intakeCompleted = consultation.status === 'completed';
  }

  return nextMetadata;
};

export const clearConsultationMetadata = (
  metadata: ConversationMetadata | null | undefined,
  mode: ConversationMetadata['mode'] = 'ASK_QUESTION'
): ConversationMetadata => {
  const previous = metadata ?? {};
  const nextMetadata: ConversationMetadata = {
    ...previous,
    consultation: null,
    mode,
    intakeConversationState: { ...initialIntakeState },
    intakeSlimContactDraft: null,
    intakeAiBriefActive: false,
    intakeUuid: null,
    intakePaymentRequired: undefined,
    intakePaymentReceived: undefined,
    intakeSubmitted: false,
    intakeCompleted: false,
  };

  return nextMetadata;
};

export const deriveIntakeStatusFromConsultation = (
  metadata: ConversationMetadata | null | undefined
) => {
  const consultation = resolveConsultationState(metadata);
  if (!consultation) {
    return {
      step: 'contact_form_slim',
      decision: metadata?.intakeDecision as string | undefined,
      intakeUuid: metadata?.intakeUuid as string | undefined,
      submittedAt: (metadata as Record<string, unknown> | null | undefined)?.submittedAt as string | undefined,
      paymentRequired: metadata?.intakePaymentRequired as boolean | undefined,
      paymentReceived: metadata?.intakePaymentReceived as boolean | undefined,
    } as const;
  }

  const step = (() => {
    if (consultation.status === 'completed') return 'completed';
    if (consultation.status === 'submitted') return 'pending_review';
    if (consultation.status === 'collecting_contact') return 'contact_form_slim';
    if (consultation.case.ctaResponse === 'ready') return 'ready_to_submit';
    if (consultation.case.ctaShown === true) return 'contact_form_decision';
    if (hasCoreIntakeFields(consultation.case)) return 'ai_brief';
    if (hasConsultationContact(consultation.contact)) return 'collecting_case';
    return 'contact_form_slim';
  })();

  return {
    step,
    decision: metadata?.intakeDecision as string | undefined,
    intakeUuid: consultation.submission.intakeUuid ?? undefined,
    submittedAt: consultation.submission.submittedAt ?? undefined,
    paymentRequired: consultation.submission.paymentRequired ?? undefined,
    paymentReceived: consultation.submission.paymentReceived ?? undefined,
  } as const;
};
