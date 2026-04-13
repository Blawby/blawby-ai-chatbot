import { useCallback, useRef } from 'preact/hooks';
import type { ConversationMessage } from '@/shared/types/conversation';
import { postSystemMessage } from '@/shared/lib/conversationApi';

interface ConversationSystemMessagesOptions {
 conversationId?: string | null;
 practiceId?: string;
 ingestServerMessages: (messages: ConversationMessage[]) => void;
}

export const useConversationSystemMessages = ({
 conversationId,
 practiceId,
 ingestServerMessages
}: ConversationSystemMessagesOptions) => {
 const inFlightRef = useRef(new Set<string>());
 const completedRef = useRef(new Set<string>());

 const persistSystemMessage = useCallback(async (
  clientId: string,
  content: string,
  metadata?: Record<string, unknown>
 ) => {
  if (!conversationId || !practiceId) return;
  const trimmedContent = content.trim();
  const shouldAllowEmpty = clientId === 'system-contact-form';
  if (!trimmedContent && !shouldAllowEmpty) return;
  const key = `${conversationId}:${clientId}`;
  if (completedRef.current.has(key) || inFlightRef.current.has(key)) {
   return;
  }
  inFlightRef.current.add(key);
  try {
   const message = await postSystemMessage(
    conversationId,
    practiceId,
    {
     clientId,
     content: trimmedContent,
     metadata
    }
   );
   completedRef.current.add(key);
   if (message) {
    ingestServerMessages([message]);
   }
  } catch (error) {
   if (import.meta.env.DEV) {
    console.warn('[useConversationSystemMessages] Failed to persist system message', error);
   }
  } finally {
   inFlightRef.current.delete(key);
  }
 }, [conversationId, ingestServerMessages, practiceId]);

 // All intro message logic removed as per user request
 return { persistSystemMessage };
};

