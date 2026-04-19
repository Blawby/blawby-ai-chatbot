import type { Conversation, ConversationMessage, ConversationMetadata, MessageReactionSummary } from '@/shared/types/conversation';
import type { MessageReaction } from '../../../worker/types';
import { getConversationMessageReactionsEndpoint, getConversationsEndpoint } from '@/config/api';
import { withWidgetAuthHeaders } from '@/shared/utils/widgetAuth';

const buildPracticeParams = (practiceId: string) => {
  return new URLSearchParams({ practiceId });
};

const toMessageReaction = (reaction: MessageReactionSummary): MessageReaction => ({
  emoji: reaction.emoji,
  count: reaction.count,
  reactedByMe: reaction.reacted_by_me
});

export const createConversation = async (
  practiceId: string,
  options?: { userId?: string; forceNew?: boolean; status?: string; extraMetadata?: Record<string, unknown> }
): Promise<string> => {
  const params = buildPracticeParams(practiceId);
  const response = await fetch(`${getConversationsEndpoint()}?${params.toString()}`, {
    method: 'POST',
    headers: withWidgetAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify({
      participantUserIds: options?.userId ? [options.userId] : [],
      metadata: { source: 'widget', ...(options?.extraMetadata ?? {}) },
      practiceId,
      forceNew: options?.forceNew,
      status: options?.status
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }

  const data = await response.json() as { success: boolean; data?: { id: string }; conversation?: { id: string } };
  const id = data.data?.id ?? data.conversation?.id;
  if (!id) throw new Error('Failed to create conversation');
  return id;
};

export const updateConversationMetadata = async (
  conversationId: string,
  practiceId: string,
  metadata: ConversationMetadata
): Promise<Conversation | null> => {
  // The API PATCH endpoint accepts `status` as a top-level field (not inside
  // `metadata`), so we hoist it out of the metadata object before sending.
  const { status, ...restMetadata } = metadata as Record<string, unknown>;
  const payload: Record<string, unknown> = { metadata: restMetadata };
  if (status !== undefined) {
    payload.status = status;
  }

  const response = await fetch(
    `/api/conversations/${encodeURIComponent(conversationId)}?practiceId=${encodeURIComponent(practiceId)}`,
    {
      method: 'PATCH',
      headers: withWidgetAuthHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'include',
      body: JSON.stringify(payload)
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }

  const data = await response.json() as { success: boolean; data?: Conversation };
  return data.data ?? null;
};

export const getConversation = async (
  conversationId: string,
  practiceId: string,
  options: { signal?: AbortSignal } = {}
): Promise<Conversation | null> => {
  const response = await fetch(
    `/api/conversations/${encodeURIComponent(conversationId)}?practiceId=${encodeURIComponent(practiceId)}`,
    {
      headers: withWidgetAuthHeaders(),
      credentials: 'include',
      signal: options.signal
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }

  const data = await response.json() as { success: boolean; data?: Conversation };
  return data.data ?? null;
};

export const updateConversationTriage = async (
  conversationId: string,
  practiceId: string,
  updates: {
    assignedTo?: string | null;
    priority?: 'low' | 'normal' | 'high' | 'urgent';
  }
): Promise<Conversation | null> => {
  const response = await fetch(
    `/api/conversations/${encodeURIComponent(conversationId)}?practiceId=${encodeURIComponent(practiceId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(updates)
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }

  const data = await response.json() as { success: boolean; data?: Conversation };
  return data.data ?? null;
};

export const addConversationTag = async (
  conversationId: string,
  practiceId: string,
  tag: string
): Promise<Conversation | null> => {
  const response = await fetch(
    `/api/conversations/${encodeURIComponent(conversationId)}/tags?practiceId=${encodeURIComponent(practiceId)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ tag })
    }
  );
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }
  const data = await response.json() as { success: boolean; data?: Conversation };
  return data.data ?? null;
};

export const removeConversationTag = async (
  conversationId: string,
  practiceId: string,
  tag: string
): Promise<Conversation | null> => {
  const response = await fetch(
    `/api/conversations/${encodeURIComponent(conversationId)}/tags?practiceId=${encodeURIComponent(practiceId)}`,
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ tag })
    }
  );
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }
  const data = await response.json() as { success: boolean; data?: Conversation };
  return data.data ?? null;
};

export const updateConversationMentions = async (
  conversationId: string,
  practiceId: string,
  mentionedUserIds: string[]
): Promise<Conversation | null> => {
  const response = await fetch(
    `/api/conversations/${encodeURIComponent(conversationId)}/mentions?practiceId=${encodeURIComponent(practiceId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ mentionedUserIds })
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
  const response = await fetch(
    `/api/conversations/${encodeURIComponent(conversationId)}/audit?practiceId=${encodeURIComponent(practiceId)}`,
    {
      method: 'POST',
      headers: withWidgetAuthHeaders({ 'Content-Type': 'application/json' }),
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
  const params = buildPracticeParams(practiceId);
  const response = await fetch(
    `/api/conversations/${encodeURIComponent(conversationId)}/system-messages?${params.toString()}`,
    {
      method: 'POST',
      headers: withWidgetAuthHeaders({ 'Content-Type': 'application/json' }),
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
  params.set('limit', '5');
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

  const messages = data.data?.messages ?? [];
  return messages.find((message) => message.role !== 'system') ?? messages[0] ?? null;
};

export const postConversationMessage = async (
  conversationId: string,
  practiceId: string,
  payload: {
    content: string;
    metadata?: Record<string, unknown>;
    replyToMessageId?: string | null;
  }
): Promise<ConversationMessage | null> => {
  const params = buildPracticeParams(practiceId);
  const response = await fetch(
    `/api/conversations/${encodeURIComponent(conversationId)}/messages?${params.toString()}`,
    {
      method: 'POST',
      headers: withWidgetAuthHeaders({ 'Content-Type': 'application/json' }),
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

export const fetchConversationMessages = async (
  conversationId: string,
  practiceId: string,
  options: { limit?: number; cursor?: string; signal?: AbortSignal } = {}
): Promise<ConversationMessage[]> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  const params = buildPracticeParams(practiceId);
  if (options.limit != null) {
    params.set('limit', String(options.limit));
  }
  if (options.cursor) {
    params.set('cursor', options.cursor);
  }

  const response = await fetch(
    `/api/conversations/${encodeURIComponent(conversationId)}/messages?${params.toString()}`,
    {
      method: 'GET',
      headers,
      credentials: 'include',
      signal: options.signal
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }

  const data = await response.json().catch(() => null) as {
    success?: boolean;
    data?: { messages?: ConversationMessage[] };
  } | null;

  if (!data?.success) {
    throw new Error('Failed to fetch messages');
  }

  return data.data?.messages ?? [];
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
