import type { Conversation, ConversationMessage, ConversationMetadata, MessageReactionSummary } from '@/shared/types/conversation';
import type { MessageReaction } from '../../../worker/types';
import { getConversationMessageReactionsEndpoint } from '@/config/api';

const buildPracticeParams = (practiceId: string) => {
  return new URLSearchParams({ practiceId });
};

const toMessageReaction = (reaction: MessageReactionSummary): MessageReaction => ({
  emoji: reaction.emoji,
  count: reaction.count,
  reactedByMe: reaction.reacted_by_me
});

export const updateConversationMetadata = async (
  conversationId: string,
  practiceId: string,
  metadata: ConversationMetadata
): Promise<Conversation | null> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  const response = await fetch(
    `/api/conversations/${encodeURIComponent(conversationId)}?practiceId=${encodeURIComponent(practiceId)}`,
    {
      method: 'PATCH',
      headers,
      credentials: 'include',
      body: JSON.stringify({ metadata })
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }

  const data = await response.json() as { success: boolean; data?: Conversation };
  return data.data ?? null;
};

export const logConversationEvent = async (
  conversationId: string,
  practiceId: string,
  eventType: string,
  payload?: Record<string, unknown>
): Promise<void> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  const response = await fetch(
    `/api/conversations/${encodeURIComponent(conversationId)}/audit?practiceId=${encodeURIComponent(practiceId)}`,
    {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ eventType, payload })
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }
};

export const postSystemMessage = async (
  conversationId: string,
  practiceId: string,
  payload: {
    clientId: string;
    content: string;
    metadata?: Record<string, unknown>;
  }
): Promise<ConversationMessage | null> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  const params = buildPracticeParams(practiceId);
  const response = await fetch(
    `/api/conversations/${encodeURIComponent(conversationId)}/system-messages?${params.toString()}`,
    {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify(payload)
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }

  const data = await response.json() as { success: boolean; data?: { message?: ConversationMessage } };
  return data.data?.message ?? null;
};

export const fetchLatestConversationMessage = async (
  conversationId: string,
  practiceId: string
): Promise<ConversationMessage | null> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  const params = buildPracticeParams(practiceId);
  params.set('limit', '1');
  params.set('source', 'preview');
  const response = await fetch(
    `/api/conversations/${encodeURIComponent(conversationId)}/messages?${params.toString()}`,
    {
      method: 'GET',
      headers,
      credentials: 'include'
    }
  );

  if (!response.ok) {
    return null;
  }

  const data = await response.json().catch(() => null) as {
    success?: boolean;
    data?: { messages?: ConversationMessage[] };
  } | null;

  if (!data?.success) {
    return null;
  }

  return data.data?.messages?.[0] ?? null;
};

export const fetchMessageReactions = async (
  conversationId: string,
  messageId: string,
  practiceId: string
): Promise<MessageReaction[]> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  const params = buildPracticeParams(practiceId);
  const response = await fetch(
    `${getConversationMessageReactionsEndpoint(conversationId, messageId)}?${params.toString()}`,
    {
      method: 'GET',
      headers,
      credentials: 'include'
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }

  const data = await response.json() as {
    success: boolean;
    data?: {
      messageId?: string;
      reactions?: MessageReactionSummary[];
    };
  };

  if (!data.success) {
    throw new Error('Failed to fetch reactions');
  }

  return (data.data?.reactions ?? []).map(toMessageReaction);
};

export const addMessageReaction = async (
  conversationId: string,
  messageId: string,
  practiceId: string,
  emoji: string
): Promise<MessageReaction[]> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  const params = buildPracticeParams(practiceId);
  const response = await fetch(
    `${getConversationMessageReactionsEndpoint(conversationId, messageId)}?${params.toString()}`,
    {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ emoji })
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }

  const data = await response.json() as {
    success: boolean;
    data?: {
      reactions?: MessageReactionSummary[];
    };
  };

  if (!data.success) {
    throw new Error('Failed to add reaction');
  }

  return (data.data?.reactions ?? []).map(toMessageReaction);
};

export const removeMessageReaction = async (
  conversationId: string,
  messageId: string,
  practiceId: string,
  emoji: string
): Promise<MessageReaction[]> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  const params = buildPracticeParams(practiceId);
  params.set('emoji', emoji);
  const response = await fetch(
    `${getConversationMessageReactionsEndpoint(conversationId, messageId)}?${params.toString()}`,
    {
      method: 'DELETE',
      headers,
      credentials: 'include'
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }

  const data = await response.json() as {
    success: boolean;
    data?: {
      reactions?: MessageReactionSummary[];
    };
  };

  if (!data.success) {
    throw new Error('Failed to remove reaction');
  }

  return (data.data?.reactions ?? []).map(toMessageReaction);
};
