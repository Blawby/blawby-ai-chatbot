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
  practiceSetupTitle = 'Practice setup',
  practiceAssistantTitle = 'Practice Assistant'
): string => {
  const metadata = getMetadata(value);
  if (!metadata) return fallback;

  if (metadata.mode === 'PRACTICE_ONBOARDING') {
    const onboardingTitle = trimString(metadata.title);
    return onboardingTitle || practiceSetupTitle;
  }

  if (metadata.mode === 'PRACTICE_ASSISTANT') {
    const assistantTitle = trimString(metadata.title);
    if (assistantTitle) return assistantTitle;

    const contactName = resolveConversationContactName(metadata);
    if (contactName) return contactName;

    return practiceAssistantTitle;
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

// shouldShowConversationInPracticeInbox + its supporting predicates removed:
// visibility filtering moved to the worker (see worker/utils/intakeVisibility
// + GET /api/conversations). The frontend is now a thin renderer — if the
// worker returned a row, it's visible. See project_conversation_visibility memory.

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
  // Guard against null/undefined, but allow 0 (Unix epoch)
  const lastTs = (() => {
    if (lastActivityAt == null) return 0;
    const date = lastActivityAt instanceof Date ? lastActivityAt : new Date(lastActivityAt);
    const ms = date.getTime();
    return Number.isFinite(ms) ? ms : 0;
  })();
  // Future timestamps and missing/invalid lastTs both fall through to
  // POSITIVE_INFINITY so they're never treated as "active".
  const ageMsRaw = Date.now() - lastTs;
  const ageMs = ageMsRaw < 0 || lastTs <= 0 ? Number.POSITIVE_INFINITY : ageMsRaw;
  // If isLive, always active; otherwise, only if age is within threshold
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
  const years = Math.floor(days / 365);
  if (years >= 1) return `${years} yr ago`;
  return `${months} mo ago`;
};
