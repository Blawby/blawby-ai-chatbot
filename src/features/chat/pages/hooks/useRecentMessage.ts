import { useMemo } from 'preact/hooks';
import { resolveConversationDisplayTitle } from '@/shared/utils/conversationDisplay';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
import type { ChatMessageUI } from '../../../../../worker/types';
import type { Conversation } from '@/shared/types/conversation';

export interface RecentMessage {
  preview: string;
  timestampLabel: string;
  senderLabel: string;
  avatarSrc: string | null;
  conversationId: string | null;
}

interface ConversationPreview {
  content?: string;
}

interface UseRecentMessageOptions {
  practiceName?: string | null;
  practiceLogo?: string | null;
  conversationPreviews: Record<string, ConversationPreview | undefined>;
  filteredConversations: Conversation[];
  filteredMessages: ChatMessageUI[];
}

const PREVIEW_MAX = 90;
const clip = (text: string) => (text.length > PREVIEW_MAX ? `${text.slice(0, PREVIEW_MAX)}…` : text);

export function useRecentMessage({
  practiceName,
  practiceLogo,
  conversationPreviews,
  filteredConversations,
  filteredMessages,
}: UseRecentMessageOptions): RecentMessage | null {
  return useMemo(() => {
    const fallbackPracticeName = typeof practiceName === 'string' ? practiceName.trim() : '';

    if (filteredConversations.length > 0) {
      const sorted = [...filteredConversations].sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
      const top = sorted.find((c) => {
        const preview = conversationPreviews[c.id];
        return typeof preview?.content === 'string' && preview.content.trim().length > 0;
      });
      if (top) {
        const previewText = (conversationPreviews[top.id]?.content ?? '').trim();
        return {
          preview: previewText ? clip(previewText) : 'Open to view messages.',
          timestampLabel: formatRelativeTime(top.updated_at),
          senderLabel: resolveConversationDisplayTitle(top, fallbackPracticeName),
          avatarSrc: practiceLogo ?? null,
          conversationId: top.id,
        };
      }
    }

    if (filteredMessages.length === 0) return null;

    const candidate = [...filteredMessages]
      .reverse()
      .find((m) => m.role !== 'system' && typeof m.content === 'string' && m.content.trim().length > 0);
    if (!candidate) return null;

    return {
      preview: clip(candidate.content.trim()),
      timestampLabel: candidate.timestamp ? formatRelativeTime(new Date(candidate.timestamp)) : '',
      senderLabel: fallbackPracticeName,
      avatarSrc: practiceLogo ?? null,
      conversationId: null,
    };
  }, [practiceLogo, practiceName, conversationPreviews, filteredConversations, filteredMessages]);
}
