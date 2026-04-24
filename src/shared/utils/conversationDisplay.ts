import type { Conversation, ConversationMetadata } from '@/shared/types/conversation';
import { resolveConsultationState } from '@/shared/utils/consultationState';

type ConversationLike = Conversation | ConversationMetadata | null | undefined;

const trimString = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const getMetadata = (value: ConversationLike): ConversationMetadata | null => {
  if (!value) return null;
  if ('user_info' in value) {
    return (value.user_info ?? null) as ConversationMetadata | null;
  }
  return value as ConversationMetadata;
};

export const resolveConversationContactName = (value: ConversationLike): string => {
  const metadata = getMetadata(value);
  if (!metadata) return '';

  const consultationName = trimString(resolveConsultationState(metadata)?.contact?.name);
  if (consultationName) return consultationName;

  const slimDraftName = trimString(metadata.intakeSlimContactDraft?.name);
  if (slimDraftName) return slimDraftName;

  const contactDetails = metadata.contactDetails;
  if (contactDetails && typeof contactDetails === 'object' && !Array.isArray(contactDetails)) {
    const contactName = trimString((contactDetails as { name?: unknown }).name);
    if (contactName) return contactName;
  }

  return '';
};

export const resolveConversationDisplayTitle = (
  value: ConversationLike,
  fallback: string,
  practiceSetupTitle = 'Practice setup'
): string => {
  const metadata = getMetadata(value);
  if (!metadata) return fallback;

  if (metadata.mode === 'PRACTICE_ONBOARDING') {
    const onboardingTitle = trimString(metadata.title);
    return onboardingTitle || practiceSetupTitle;
  }

  const title = trimString(metadata.title);
  if (title) return title;

  const contactName = resolveConversationContactName(metadata);
  if (resolveConsultationState(metadata) && contactName) {
    return contactName;
  }

  if (contactName) return contactName;

  return fallback;
};

export const resolveConversationCaseTitle = (value: ConversationLike, fallback: string): string => {
  const metadata = getMetadata(value);
  if (!metadata) return fallback;

  const title = trimString(metadata.title) || trimString(metadata.intake_title);
  return title || fallback;
};

export const resolveConversationIntakeUuid = (value: ConversationLike): string | null => {
  const metadata = getMetadata(value);
  if (!metadata) return null;

  const directUuid = trimString(metadata.intakeUuid);
  if (directUuid) return directUuid;

  const consultation = resolveConsultationState(metadata);
  const consultationUuid = trimString(consultation?.submission?.intakeUuid);
  return consultationUuid || null;
};

const normalizeTriageStatus = (value: unknown): string | null => {
  const normalized = trimString(value).toLowerCase();
  return normalized || null;
};

const resolveMetadataTriageStatus = (metadata: ConversationMetadata | null): string | null => {
  if (!metadata) return null;
  return normalizeTriageStatus(metadata.triageStatus)
    ?? normalizeTriageStatus(metadata.triage_status)
    ?? normalizeTriageStatus(metadata.intakeTriageStatus)
    ?? normalizeTriageStatus(metadata.intake_triage_status);
};

const isVisibleTriageStatus = (status: string | null): boolean | null => {
  if (!status) return null;
  return status === 'accepted';
};

export const shouldShowConversationInPracticeInbox = (
  conversation: Conversation,
  intakeTriageStatus?: string | null,
  options: { intakeLookupLoaded?: boolean; requireAcceptedIntakeRecord?: boolean } = {}
): boolean => {
  const authoritativeVisibility = isVisibleTriageStatus(normalizeTriageStatus(intakeTriageStatus));
  if (authoritativeVisibility !== null) return authoritativeVisibility;

  if (options.requireAcceptedIntakeRecord) {
    if (conversation.matter_id) return true;
    if (conversation.lead?.matter_id) return true;
    return false;
  }

  const metadata = getMetadata(conversation);
  const consultation = resolveConsultationState(metadata);
  const metadataVisibility = isVisibleTriageStatus(resolveMetadataTriageStatus(metadata));
  if (metadataVisibility !== null) return metadataVisibility;

  if (!consultation) return true;
  if (conversation.matter_id) return true;
  if (conversation.lead?.matter_id) return true;
  if (options.intakeLookupLoaded) return false;

  return true;
};
