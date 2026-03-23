import type { Conversation, ConversationMetadata } from '@/shared/types/conversation';

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
  if (contactName) return contactName;

  return fallback;
};
