import type { Conversation, ConversationMetadata, ConversationMode } from '@/shared/types/conversation';

export type ConversationSurface = 'assistant' | 'messages' | 'onboarding';

const getConversationMode = (conversationOrMetadata: Conversation | ConversationMetadata | null | undefined): ConversationMode | null => {
  if (!conversationOrMetadata) return null;
  if (typeof conversationOrMetadata !== 'object') return null;
  if ('user_info' in conversationOrMetadata) {
    const conversation = conversationOrMetadata as Conversation;
    return conversation.user_info?.mode ?? null;
  }
  const metadata = conversationOrMetadata as ConversationMetadata;
  return metadata.mode ?? null;
};

export const getConversationSurface = (
  conversationOrMetadata: Conversation | ConversationMetadata | null | undefined,
): ConversationSurface => {
  const mode = getConversationMode(conversationOrMetadata);
  if (mode === 'PRACTICE_ASSISTANT') return 'assistant';
  if (mode === 'PRACTICE_ONBOARDING') return 'onboarding';
  return 'messages';
};

export const isAssistantConversation = (
  conversationOrMetadata: Conversation | ConversationMetadata | null | undefined,
): boolean => getConversationSurface(conversationOrMetadata) === 'assistant';

export const isOnboardingConversation = (
  conversationOrMetadata: Conversation | ConversationMetadata | null | undefined,
): boolean => getConversationSurface(conversationOrMetadata) === 'onboarding';

export const isMessagesConversation = (
  conversationOrMetadata: Conversation | ConversationMetadata | null | undefined,
): boolean => getConversationSurface(conversationOrMetadata) === 'messages';
