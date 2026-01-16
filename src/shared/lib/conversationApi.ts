import { getTokenAsync } from '@/shared/lib/tokenStorage';
import type { Conversation, ConversationMetadata } from '@/shared/types/conversation';

export const updateConversationMetadata = async (
  conversationId: string,
  practiceId: string,
  metadata: ConversationMetadata
): Promise<Conversation | null> => {
  const token = await getTokenAsync();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

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
  const token = await getTokenAsync();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

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
