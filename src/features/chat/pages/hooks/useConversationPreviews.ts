import { useMemo } from 'preact/hooks';
import type { Conversation } from '@/shared/types/conversation';

type UseConversationPreviewsInput = {
  filteredConversations: Conversation[];
  mockConversationPreviews?: Record<string, { content: string; role: string; createdAt: string }> | null;
};

/**
 * Build a {conversationId → preview} map from the latest_message field that
 * `GET /api/conversations?include=latest_message` populates. Previously this
 * hook fanned out one /messages?source=preview request per conversation;
 * with the denormalized list response that N+1 is gone.
 *
 * Mocked previews (storybook, tests) short-circuit the entire pipeline.
 */
export function useConversationPreviews({
  filteredConversations,
  mockConversationPreviews,
}: UseConversationPreviewsInput) {
  const conversationPreviews = useMemo<Record<string, { content: string; role: string; createdAt: string }>>(() => {
    if (mockConversationPreviews) return mockConversationPreviews;
    const map: Record<string, { content: string; role: string; createdAt: string }> = {};
    for (const conversation of filteredConversations) {
      const latest = conversation.latest_message;
      if (latest?.content) {
        map[conversation.id] = {
          content: latest.content,
          role: latest.role,
          createdAt: latest.created_at,
        };
      }
    }
    return map;
  }, [filteredConversations, mockConversationPreviews]);

  return { conversationPreviews };
}
