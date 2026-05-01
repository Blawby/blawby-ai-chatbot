import type { Conversation, ConversationMessage, ConversationMetadata, MessageReactionSummary } from '@/shared/types/conversation';
import type { MessageReaction } from '../../../worker/types';
import { getConversationMessageReactionsEndpoint, getConversationsEndpoint } from '@/config/api';
import { apiClient, isHttpError } from '@/shared/lib/apiClient';

const toMessageReaction = (reaction: MessageReactionSummary): MessageReaction => ({
  emoji: reaction.emoji,
  count: reaction.count,
  reactedByMe: reaction.reacted_by_me
});

// Unwrap apiClient errors into the legacy `Error(message)` contract so callers
// (which all check `instanceof Error` + `.message`) keep working unchanged.
const toErrorMessage = (error: unknown, fallback: string): Error => {
  if (isHttpError(error)) {
    const data = error.response.data as { error?: string } | undefined;
    return new Error(data?.error || `HTTP ${error.response.status}`);
  }
  if (error instanceof Error) return error;
  return new Error(fallback);
};

interface ConversationEnvelope {
  success: boolean;
  data?: Conversation;
}

interface MessageEnvelope {
  success: boolean;
  data?: { message?: ConversationMessage };
}

interface ReactionsEnvelope {
  success: boolean;
  data?: {
    messageId?: string;
    reactions?: MessageReactionSummary[];
  };
}

export const createConversation = async (
  practiceId: string,
  options?: { userId?: string; forceNew?: boolean; status?: string; extraMetadata?: Record<string, unknown> }
): Promise<string> => {
  try {
    const { data } = await apiClient.post<{ success: boolean; data?: { id: string }; conversation?: { id: string } }>(
      getConversationsEndpoint(),
      {
        participantUserIds: options?.userId ? [options.userId] : [],
        metadata: { ...(options?.extraMetadata ?? {}), source: 'widget' },
        practiceId,
        forceNew: options?.forceNew,
        status: options?.status,
      },
      { params: { practiceId } },
    );
    const id = data.data?.id ?? data.conversation?.id;
    if (!id) throw new Error('Failed to create conversation');
    return id;
  } catch (error) {
    throw toErrorMessage(error, 'Failed to create conversation');
  }
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

  try {
    const { data } = await apiClient.patch<ConversationEnvelope>(
      `/api/conversations/${encodeURIComponent(conversationId)}`,
      payload,
      { params: { practiceId } },
    );
    return data.data ?? null;
  } catch (error) {
    throw toErrorMessage(error, 'Failed to update conversation metadata');
  }
};

export const getConversation = async (
  conversationId: string,
  practiceId: string,
  options: { signal?: AbortSignal } = {}
): Promise<Conversation | null> => {
  try {
    const { data } = await apiClient.get<ConversationEnvelope>(
      `/api/conversations/${encodeURIComponent(conversationId)}`,
      { params: { practiceId }, signal: options.signal },
    );
    return data.data ?? null;
  } catch (error) {
    throw toErrorMessage(error, 'Failed to fetch conversation');
  }
};

export const updateConversationTriage = async (
  conversationId: string,
  practiceId: string,
  updates: {
    assignedTo?: string | null;
    priority?: 'low' | 'normal' | 'high' | 'urgent';
  }
): Promise<Conversation | null> => {
  try {
    const { data } = await apiClient.patch<ConversationEnvelope>(
      `/api/conversations/${encodeURIComponent(conversationId)}`,
      updates,
      { params: { practiceId } },
    );
    return data.data ?? null;
  } catch (error) {
    throw toErrorMessage(error, 'Failed to update conversation triage');
  }
};

export const addConversationTag = async (
  conversationId: string,
  practiceId: string,
  tag: string
): Promise<Conversation | null> => {
  try {
    const { data } = await apiClient.post<ConversationEnvelope>(
      `/api/conversations/${encodeURIComponent(conversationId)}/tags`,
      { tag },
      { params: { practiceId } },
    );
    return data.data ?? null;
  } catch (error) {
    throw toErrorMessage(error, 'Failed to add conversation tag');
  }
};

export const removeConversationTag = async (
  conversationId: string,
  practiceId: string,
  tag: string
): Promise<Conversation | null> => {
  try {
    const { data } = await apiClient.delete<ConversationEnvelope>(
      `/api/conversations/${encodeURIComponent(conversationId)}/tags`,
      { params: { practiceId }, body: { tag } },
    );
    return data.data ?? null;
  } catch (error) {
    throw toErrorMessage(error, 'Failed to remove conversation tag');
  }
};

export const updateConversationMentions = async (
  conversationId: string,
  practiceId: string,
  mentionedUserIds: string[]
): Promise<Conversation | null> => {
  try {
    const { data } = await apiClient.patch<ConversationEnvelope>(
      `/api/conversations/${encodeURIComponent(conversationId)}/mentions`,
      { mentionedUserIds },
      { params: { practiceId } },
    );
    return data.data ?? null;
  } catch (error) {
    throw toErrorMessage(error, 'Failed to update conversation mentions');
  }
};

export const logConversationEvent = async (
  conversationId: string,
  practiceId: string,
  eventType: string,
  payload?: Record<string, unknown>
): Promise<void> => {
  try {
    await apiClient.post(
      `/api/conversations/${encodeURIComponent(conversationId)}/audit`,
      { eventType, payload },
      { params: { practiceId } },
    );
  } catch (error) {
    throw toErrorMessage(error, 'Failed to log conversation event');
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
  try {
    const { data } = await apiClient.post<MessageEnvelope>(
      `/api/conversations/${encodeURIComponent(conversationId)}/system-messages`,
      payload,
      { params: { practiceId } },
    );
    return data.data?.message ?? null;
  } catch (error) {
    throw toErrorMessage(error, 'Failed to post system message');
  }
};

export const fetchLatestConversationMessage = async (
  conversationId: string,
  practiceId: string
): Promise<ConversationMessage | null> => {
  try {
    const { data } = await apiClient.get<{ success?: boolean; data?: { messages?: ConversationMessage[] } }>(
      `/api/conversations/${encodeURIComponent(conversationId)}/messages`,
      { params: { practiceId, limit: '5', source: 'preview' } },
    );
    if (!data?.success) return null;
    const messages = data.data?.messages ?? [];
    return messages.find((message) => message.role !== 'system') ?? messages[0] ?? null;
  } catch {
    // Preview fetch is best-effort: any HTTP/network error → treat as no preview available.
    return null;
  }
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
  try {
    const { data } = await apiClient.post<MessageEnvelope>(
      `/api/conversations/${encodeURIComponent(conversationId)}/messages`,
      payload,
      { params: { practiceId } },
    );
    return data.data?.message ?? null;
  } catch (error) {
    throw toErrorMessage(error, 'Failed to post conversation message');
  }
};

export const fetchConversationMessages = async (
  conversationId: string,
  practiceId: string,
  options: { limit?: number; cursor?: string; signal?: AbortSignal } = {}
): Promise<ConversationMessage[]> => {
  const params: Record<string, string> = { practiceId };
  if (options.limit != null) params.limit = String(options.limit);
  if (options.cursor) params.cursor = options.cursor;

  try {
    const { data } = await apiClient.get<{ success?: boolean; data?: { messages?: ConversationMessage[] } }>(
      `/api/conversations/${encodeURIComponent(conversationId)}/messages`,
      { params, signal: options.signal },
    );
    if (!data?.success) throw new Error('Failed to fetch messages');
    return data.data?.messages ?? [];
  } catch (error) {
    throw toErrorMessage(error, 'Failed to fetch messages');
  }
};

export const fetchMessageReactions = async (
  conversationId: string,
  messageId: string,
  practiceId: string
): Promise<MessageReaction[]> => {
  try {
    const { data } = await apiClient.get<ReactionsEnvelope>(
      getConversationMessageReactionsEndpoint(conversationId, messageId),
      { params: { practiceId } },
    );
    if (!data.success) throw new Error('Failed to fetch reactions');
    return (data.data?.reactions ?? []).map(toMessageReaction);
  } catch (error) {
    throw toErrorMessage(error, 'Failed to fetch reactions');
  }
};

export const addMessageReaction = async (
  conversationId: string,
  messageId: string,
  practiceId: string,
  emoji: string
): Promise<MessageReaction[]> => {
  try {
    const { data } = await apiClient.post<ReactionsEnvelope>(
      getConversationMessageReactionsEndpoint(conversationId, messageId),
      { emoji },
      { params: { practiceId } },
    );
    if (!data.success) throw new Error('Failed to add reaction');
    return (data.data?.reactions ?? []).map(toMessageReaction);
  } catch (error) {
    throw toErrorMessage(error, 'Failed to add reaction');
  }
};

export const removeMessageReaction = async (
  conversationId: string,
  messageId: string,
  practiceId: string,
  emoji: string
): Promise<MessageReaction[]> => {
  try {
    const { data } = await apiClient.delete<ReactionsEnvelope>(
      getConversationMessageReactionsEndpoint(conversationId, messageId),
      { params: { practiceId, emoji } },
    );
    if (!data.success) throw new Error('Failed to remove reaction');
    return (data.data?.reactions ?? []).map(toMessageReaction);
  } catch (error) {
    throw toErrorMessage(error, 'Failed to remove reaction');
  }
};
