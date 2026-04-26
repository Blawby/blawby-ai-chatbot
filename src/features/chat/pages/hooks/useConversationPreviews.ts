import { useState, useRef, useEffect } from 'preact/hooks';
import { fetchLatestConversationMessage } from '@/shared/lib/conversationApi';
import type { Conversation } from '@/shared/types/conversation';

type UseConversationPreviewsInput = {
  practiceId: string;
  view: string;
  workspace: string;
  filteredConversations: Conversation[];
  isSessionPending: boolean;
  isAnonymous: boolean;
  sessionUserId: string | null;
  mockConversationPreviews?: Record<string, { content: string; role: string; createdAt: string }> | null;
  mockConversations?: unknown[] | null;
};

export function useConversationPreviews({
  practiceId,
  view,
  workspace,
  filteredConversations,
  isSessionPending,
  isAnonymous,
  sessionUserId,
  mockConversationPreviews,
  mockConversations,
}: UseConversationPreviewsInput) {
  const [conversationPreviews, setConversationPreviews] = useState<Record<string, {
    content: string;
    role: string;
    createdAt: string;
  }>>({});
  const fetchedPreviewIds = useRef<Set<string>>(new Set());
  const previewFailureCounts = useRef<Record<string, number>>({});
  const MAX_PREVIEW_ATTEMPTS = 2;
  const shouldLoadConversationPreviews = view === 'home' || view === 'list' || view === 'conversation';

  useEffect(() => {
    fetchedPreviewIds.current = new Set();
    previewFailureCounts.current = {};
    setConversationPreviews(mockConversationPreviews ?? {});
  }, [practiceId, mockConversationPreviews, mockConversations]);

  useEffect(() => {
    if (mockConversationPreviews || mockConversations) return;
    if (!shouldLoadConversationPreviews || filteredConversations.length === 0 || !practiceId) {
      return;
    }
    if (workspace === 'practice' && (isSessionPending || isAnonymous || !sessionUserId)) {
      return;
    }
    let isMounted = true;
    const loadPreviews = async () => {
      const updates: Record<string, { content: string; role: string; createdAt: string }> = {};
      const toFetch = filteredConversations.slice(0, 10).filter(
        (conversation) => !fetchedPreviewIds.current.has(conversation.id)
      );
      await Promise.all(toFetch.map(async (conversation) => {
        const message = await fetchLatestConversationMessage(
          conversation.id,
          practiceId
        ).catch(() => null);
        if (message?.content) {
          fetchedPreviewIds.current.add(conversation.id);
          updates[conversation.id] = {
            content: message.content,
            role: message.role,
            createdAt: message.created_at
          };
          return;
        }
        const currentFailures = previewFailureCounts.current[conversation.id] ?? 0;
        const nextFailures = currentFailures + 1;
        previewFailureCounts.current[conversation.id] = nextFailures;
        if (nextFailures >= MAX_PREVIEW_ATTEMPTS) {
          fetchedPreviewIds.current.add(conversation.id);
        }
      }));
      if (isMounted && Object.keys(updates).length > 0) {
        setConversationPreviews((prev) => ({ ...prev, ...updates }));
      }
    };
    void loadPreviews();
    return () => {
      isMounted = false;
    };
  }, [filteredConversations, isAnonymous, isSessionPending, mockConversationPreviews, mockConversations, practiceId, sessionUserId, shouldLoadConversationPreviews, workspace]);

  return { conversationPreviews };
}
