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
    // Staff-initiated conversations have no intake/matter yet but have been
    // claimed via assignment. Treat assignment as acceptance so the thread
    // appears in the inbox immediately after the picker creates it.
    if (typeof conversation.assigned_to === 'string' && conversation.assigned_to.trim().length > 0) return true;
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

// Presence threshold: a conversation is "active" if its last activity was
// within this window. Otherwise it's treated as offline. We don't have a real
// presence signal yet so last_message_at + the live socket state are the
// best proxies we can use today.
const ACTIVE_PRESENCE_THRESHOLD_MS = 5 * 60 * 1000;

export type ConversationPresence = {
  status: 'active' | 'offline';
  /** Subtitle label for the conversation header / inspector. */
  label: string;
};

/**
 * Resolve a "online | offline" presence indicator for a conversation header
 * and the message-list avatar dot. Inputs:
 * - `lastActivityAt`: ISO timestamp of the latest activity (typically
 *   conversation.last_message_at). Newer than 5 min → active.
 * - `isLive`: optional override — when the socket reports an active session
 *   for the conversation we mark it active regardless of timestamps.
 */
export const resolveConversationPresence = (
  lastActivityAt: string | number | Date | null | undefined,
  isLive: boolean = false
): ConversationPresence => {
  const lastTs = (() => {
    if (!lastActivityAt) return 0;
    const date = lastActivityAt instanceof Date ? lastActivityAt : new Date(lastActivityAt);
    const ms = date.getTime();
    return Number.isFinite(ms) ? ms : 0;
  })();
  const ageMs = lastTs > 0 ? Math.max(0, Date.now() - lastTs) : Number.POSITIVE_INFINITY;
  const isActive = isLive || ageMs <= ACTIVE_PRESENCE_THRESHOLD_MS;
  if (isActive) {
    return { status: 'active', label: 'Active now' };
  }
  if (lastTs === 0) {
    return { status: 'offline', label: 'Offline' };
  }
  return { status: 'offline', label: `Last active ${formatRelativePresence(ageMs)}` };
};

const formatRelativePresence = (ageMs: number): string => {
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} wk ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} mo ago`;
  const years = Math.floor(days / 365);
  return `${years} yr ago`;
};
