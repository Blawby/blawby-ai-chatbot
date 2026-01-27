import { useCallback, useEffect, useRef } from 'preact/hooks';
import type { ChatMessageUI } from '../../../../worker/types';
import type { UIPracticeConfig } from '@/shared/hooks/usePracticeConfig';
import type { ConversationMessage, ConversationMode } from '@/shared/types/conversation';
import { postSystemMessage } from '@/shared/lib/conversationApi';

const buildIntroMessage = (
  introMessage: string | null | undefined,
  practiceName: string | null | undefined
): string => {
  const trimmedIntro = typeof introMessage === 'string' ? introMessage.trim() : '';
  if (trimmedIntro) {
    return trimmedIntro;
  }
  const trimmedName = typeof practiceName === 'string' ? practiceName.trim() : '';
  if (trimmedName) {
    return `Hi! Welcome to ${trimmedName}. How can we help?`;
  }
  return 'Hi! How can we help?';
};

const hasSystemMessage = (messages: ChatMessageUI[], key: string): boolean => (
  messages.some((message) => message.metadata?.systemMessageKey === key)
);

const hasContactFormMessage = (messages: ChatMessageUI[]): boolean => (
  messages.some((message) => Boolean(message.contactForm || message.metadata?.contactForm))
);

interface ConversationSystemMessagesOptions {
  conversationId?: string | null;
  practiceId?: string;
  practiceSlug?: string;
  practiceConfig: UIPracticeConfig;
  messagesReady: boolean;
  messages: ChatMessageUI[];
  conversationMode?: ConversationMode | null;
  isConsultFlowActive: boolean;
  shouldRequireModeSelection: boolean;
  ingestServerMessages: (messages: ConversationMessage[]) => void;
}

export const useConversationSystemMessages = ({
  conversationId,
  practiceId,
  practiceSlug,
  practiceConfig,
  messagesReady,
  messages,
  conversationMode,
  isConsultFlowActive,
  shouldRequireModeSelection,
  ingestServerMessages
}: ConversationSystemMessagesOptions): void => {
  const inFlightRef = useRef(new Set<string>());
  const completedRef = useRef(new Set<string>());

  const persistSystemMessage = useCallback(async (
    clientId: string,
    content: string,
    metadata?: Record<string, unknown>
  ) => {
    if (!conversationId || !practiceId) return;
    const trimmedContent = content.trim();
    if (!trimmedContent) return;
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
        },
        practiceSlug
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
  }, [conversationId, ingestServerMessages, practiceId, practiceSlug]);

  useEffect(() => {
    if (!messagesReady || !conversationId || !practiceId) {
      return;
    }
    if (!shouldRequireModeSelection) {
      return;
    }
    if (hasSystemMessage(messages, 'intro')) {
      return;
    }
    const shouldShowModeSelector =
      shouldRequireModeSelection && !conversationMode && !isConsultFlowActive;
    const metadata = {
      systemMessageKey: 'intro',
      ...(shouldShowModeSelector ? { modeSelector: true } : {})
    };
    void persistSystemMessage(
      'system-intro',
      buildIntroMessage(practiceConfig.introMessage, practiceConfig.name),
      metadata
    );
  }, [
    conversationId,
    conversationMode,
    isConsultFlowActive,
    messages,
    messagesReady,
    practiceConfig.introMessage,
    practiceConfig.name,
    practiceId,
    persistSystemMessage,
    shouldRequireModeSelection
  ]);

  useEffect(() => {
    if (!messagesReady || !conversationId || !practiceId) {
      return;
    }
    if (!shouldRequireModeSelection) {
      return;
    }
    if (conversationMode !== 'REQUEST_CONSULTATION') {
      return;
    }
    if (hasContactFormMessage(messages)) {
      return;
    }
    void persistSystemMessage(
      'system-contact-form',
      'Could you share your contact details? It will help us find the best lawyer for your case.',
      {
        systemMessageKey: 'contact_form',
        contactForm: {
          fields: ['name', 'email', 'phone', 'location', 'opposingParty', 'description'],
          required: ['name', 'email'],
          message: undefined
        }
      }
    );
  }, [
    conversationId,
    conversationMode,
    messages,
    messagesReady,
    practiceId,
    persistSystemMessage,
    shouldRequireModeSelection
  ]);
};
