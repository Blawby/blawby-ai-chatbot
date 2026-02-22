import { useState, useMemo, useRef } from 'preact/hooks';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import type { ConversationMetadata, ConversationMode } from '@/shared/types/conversation';
import { useIntakeFlow } from '@/shared/hooks/useIntakeFlow';
import { useConversation } from '@/shared/hooks/useConversation';
import { useChatComposer } from '@/shared/hooks/useChatComposer';
import { usePaymentStatus } from '@/shared/hooks/usePaymentStatus';

export interface UseMessageHandlingOptions {
  practiceId?: string;
  practiceSlug?: string;
  conversationId?: string;
  linkAnonymousConversationOnLoad?: boolean;
  mode?: ConversationMode | null;
  onConversationMetadataUpdated?: (metadata: ConversationMetadata | null) => void;
  onError?: (error: unknown, context?: Record<string, unknown>) => void;
}

export const useMessageHandlingWithContext = (options: Omit<UseMessageHandlingOptions, 'practiceId'>) => {
  const { activePracticeId } = useSessionContext();
  return useMessageHandling({ ...options, practiceId: activePracticeId ?? undefined });
};

export const useMessageHandling = (options: UseMessageHandlingOptions) => {
  const {
    practiceId,
    practiceSlug,
    conversationId,
    mode,
    onConversationMetadataUpdated,
    onError,
    linkAnonymousConversationOnLoad = false
  } = options;

  // 1. Core Transport & State
  const conversation = useConversation({
    practiceId,
    conversationId,
    linkAnonymousConversationOnLoad,
    onConversationMetadataUpdated,
    onError,
  });

  const composerRef = useRef<ReturnType<typeof useChatComposer> | null>(null);

  // 2. Intake Flow logic
  const intake = useIntakeFlow({
    conversationId,
    practiceId,
    conversationMetadata: conversation.conversationMetadata,
    slimContactDraft: conversation.conversationMetadata?.intakeSlimContactDraft ?? null,
    conversationMetadataRef: conversation.conversationMetadataRef,
    updateConversationMetadata: conversation.updateConversationMetadata,
    applyServerMessages: conversation.applyServerMessages,
    // Proxy functions to chat composer via ref to avoid TDZ errors
    sendMessage: (content, att, reply) => composerRef.current?.sendMessage(content, att, reply),
    sendMessageOverWs: (content, att, meta, reply) => composerRef.current?.sendMessageOverWs(content, att, meta, reply),
    onError,
  });

  // 3. User Actions & AI (Streaming, Intent, etc)
  const composer = useChatComposer({
    practiceId,
    practiceSlug,
    conversationId,
    linkAnonymousConversationOnLoad,
    mode,
    messages: conversation.messages,
    messagesRef: conversation.messagesRef,
    conversationMetadataRef: conversation.conversationMetadataRef,
    setMessages: conversation.setMessages,
    sendFrame: conversation.sendFrame,
    sendReadUpdate: conversation.sendReadUpdate,
    waitForSocketReady: conversation.waitForSocketReady,
    isSocketReadyRef: conversation.isSocketReadyRef,
    socketConversationIdRef: conversation.socketConversationIdRef,
    messageIdSetRef: conversation.messageIdSetRef,
    pendingClientMessageRef: conversation.pendingClientMessageRef,
    pendingAckRef: conversation.pendingAckRef,
    pendingStreamMessageIdRef: conversation.pendingStreamMessageIdRef,
    orphanTimerRef: conversation.orphanTimerRef,
    conversationIdRef: conversation.conversationIdRef,
    connectChatRoom: conversation.connectChatRoom,
    updateConversationMetadata: conversation.updateConversationMetadata,
    applyServerMessages: conversation.applyServerMessages,
    applyIntakeFields: intake.applyIntakeFields,
    onError,
  });

  // Update composerRef after composer is created
  if (composerRef.current !== composer) {
    composerRef.current = composer;
  }

  // 4. Payment statuses & reconciliation
  const [verifiedPaidIntakeUuids, setVerifiedPaidIntakeUuids] = useState<Set<string>>(new Set());
  
  const payments = usePaymentStatus({
    conversationId,
    practiceId,
    latestIntakeSubmission: {
      intakeUuid: conversation.conversationMetadata?.intakeUuid ?? null,
      paymentRequired: conversation.conversationMetadata?.intakePaymentRequired ?? false,
    },
    onPaymentConfirmed: (uuid) => {
      setVerifiedPaidIntakeUuids(prev => {
        const next = new Set(prev);
        next.add(uuid);
        return next;
      });
    },
    applyServerMessages: conversation.applyServerMessages,
    onError,
  });

  // Derived state for UI orchestration
  const isConsultFlowActive = useMemo(() => {
    if (mode === 'REQUEST_CONSULTATION') return true;
    if (mode === 'ASK_QUESTION' || mode === null) return false;
    return false;
  }, [mode]);

  return {
    // Transport & State (from useConversation)
    messages: conversation.messages,
    conversationMetadata: conversation.conversationMetadata,
    messagesReady: conversation.messagesReady,
    hasMoreMessages: conversation.hasMoreMessages,
    isLoadingMoreMessages: conversation.isLoadingMoreMessages,
    isSocketReady: conversation.isSocketReady,
    loadMoreMessages: conversation.loadMoreMessages,
    startConsultFlow: conversation.startConsultFlow,
    clearMessages: conversation.clearMessages,
    addMessage: conversation.addMessage,
    updateMessage: conversation.updateMessage,
    ingestServerMessages: conversation.ingestServerMessages,
    updateConversationMetadata: conversation.updateConversationMetadata,
    requestMessageReactions: conversation.requestMessageReactions,
    toggleMessageReaction: conversation.toggleMessageReaction,

    // Actions & Sending (from useChatComposer)
    sendMessage: composer.sendMessage,

    // Payments (from usePaymentStatus)
    paymentRetryNotice: payments.paymentRetryNotice,
    verifiedPaidIntakeUuids,

    // Intake Logic (from useIntakeFlow)
    intakeStatus: intake.intakeStatus,
    intakeConversationState: intake.intakeConversationState,
    slimContactDraft: intake.slimContactDraft,
    handleSlimFormContinue: intake.handleSlimFormContinue,
    handleBuildBrief: intake.handleBuildBrief,
    handleIntakeCtaResponse: intake.handleIntakeCtaResponse,
    resetIntakeCta: intake.resetIntakeCta,
    handleSubmitNow: intake.handleSubmitNow,
    handleContactFormSubmit: intake.handleContactFormSubmit,

    // App state
    isConsultFlowActive,
  };
};
