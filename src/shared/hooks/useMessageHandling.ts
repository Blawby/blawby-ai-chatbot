import { useState, useMemo, useRef } from 'preact/hooks';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import type { ConversationMetadata, ConversationMode } from '@/shared/types/conversation';
import { useIntakeFlow } from '@/shared/hooks/useIntakeFlow';
import { useConversation } from '@/shared/hooks/useConversation';
import { useChatComposer } from '@/shared/hooks/useChatComposer';
import { usePaymentStatus } from '@/shared/hooks/usePaymentStatus';
import { resolveConsultationState } from '@/shared/utils/consultationState';

import type { IntakePaymentRequest } from '@/shared/utils/intakePayments';

export interface UseMessageHandlingOptions {
  enabled?: boolean;
  practiceId?: string;
  practiceSlug?: string;
  conversationId?: string;
  ensureConversation?: () => Promise<string | null>;
  userId?: string | null;
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
    enabled = true,
    practiceId,
    practiceSlug,
    conversationId,
    ensureConversation,
    userId,
    mode,
    onConversationMetadataUpdated,
    onError,
    linkAnonymousConversationOnLoad = false
  } = options;

  // 1. Core Transport & State
  const conversation = useConversation({
    enabled,
    practiceId,
    conversationId,
    userId,
    linkAnonymousConversationOnLoad,
    onConversationMetadataUpdated,
    onError,
  });

  const composerRef = useRef<ReturnType<typeof useChatComposer> | null>(null);
  const consultation = useMemo(
    () => resolveConsultationState(conversation.conversationMetadata),
    [conversation.conversationMetadata]
  );

  // 2. Intake Flow logic
  const intake = useIntakeFlow({
    enabled,
    conversationId,
    practiceId,
    practiceSlug,
    conversationMetadata: conversation.conversationMetadata,
    slimContactDraft: consultation?.contact ?? null,
    conversationMetadataRef: conversation.conversationMetadataRef,
    updateConversationMetadata: conversation.updateConversationMetadata,
    applyServerMessages: conversation.applyServerMessages,
    // Proxy functions to chat composer via ref to avoid TDZ errors
    sendMessage: (content, att, reply, opts) => composerRef.current?.sendMessage(content, att, reply, opts),
    sendMessageOverWs: (content, att, meta, reply, convId) => composerRef.current?.sendMessageOverWs(content, att, meta, reply, convId),
    onError,
  });

  // 3. User Actions & AI (Streaming, Intent, etc)
  const composer = useChatComposer({
    enabled,
    practiceId,
    practiceSlug,
    conversationId,
    ensureConversation,
    userId,
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
    pendingEnsureConversationPromiseRef: conversation.pendingEnsureConversationPromiseRef,
    pendingEnsureConversationPromisesRef: conversation.pendingEnsureConversationPromisesRef,
    connectChatRoom: conversation.connectChatRoom,
    updateConversationMetadata: conversation.updateConversationMetadata,
    applyServerMessages: conversation.applyServerMessages,
    fetchConversationMetadata: conversation.fetchConversationMetadata,
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
    enabled,
    conversationId,
    practiceId,
    latestIntakeSubmission: {
      intakeUuid: consultation?.submission?.intakeUuid ?? null,
      paymentRequired: consultation?.submission?.paymentRequired ?? false,
      checkoutSessionId: consultation?.submission?.checkoutSessionId ?? null,
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
    if (!enabled) return false;
    if (mode === 'REQUEST_CONSULTATION') return true;
    if (mode === 'ASK_QUESTION' || mode === 'PRACTICE_ONBOARDING' || mode === null) return false;
    return false;
  }, [enabled, mode]);

  const suspendedState = useMemo(() => ({
    messages: [],
    conversationMetadata: null,
    messagesReady: false,
    hasMoreMessages: false,
    isLoadingMoreMessages: false,
    isSocketReady: false,
    loadMoreMessages: async () => {},
    startConsultFlow: () => {},
    clearMessages: () => {},
    addMessage: () => {},
    updateMessage: () => {},
    ingestServerMessages: () => {},
    updateConversationMetadata: async () => null,
    requestMessageReactions: async (_messageId: string) => {},
    toggleMessageReaction: async (_messageId: string, _emoji: string) => {},
    sendMessage: async () => {},
    paymentRetryNotice: null,
    verifiedPaidIntakeUuids: new Set<string>(),
    intakeStatus: null,
    intakeConversationState: null,
    slimContactDraft: null,
    handleSlimFormContinue: async () => {},
    handleBuildBrief: async () => {},
    handleIntakeCtaResponse: async () => {},
    resetIntakeCta: async () => {},
    handleConfirmSubmit: async () => {},
    handleFinalizeSubmit: async () => ({ paymentLinkUrl: null }),
    handleSubmitNow: async () => {},
    handleContactFormSubmit: async () => {},
    applyIntakeFields: async () => {},
    isConsultFlowActive: false,
  }), []);

  return useMemo(() => ({
    ...(enabled ? {} : suspendedState),
    // Transport & State (from useConversation)
    messages: enabled ? conversation.messages : suspendedState.messages,
    conversationMetadata: enabled ? conversation.conversationMetadata : suspendedState.conversationMetadata,
    messagesReady: enabled ? conversation.messagesReady : suspendedState.messagesReady,
    hasMoreMessages: enabled ? conversation.hasMoreMessages : suspendedState.hasMoreMessages,
    isLoadingMoreMessages: enabled ? conversation.isLoadingMoreMessages : suspendedState.isLoadingMoreMessages,
    isSocketReady: enabled ? conversation.isSocketReady : suspendedState.isSocketReady,
    loadMoreMessages: enabled ? conversation.loadMoreMessages : suspendedState.loadMoreMessages,
    startConsultFlow: enabled ? conversation.startConsultFlow : suspendedState.startConsultFlow,
    clearMessages: enabled ? conversation.clearMessages : suspendedState.clearMessages,
    addMessage: enabled ? conversation.addMessage : suspendedState.addMessage,
    updateMessage: enabled ? conversation.updateMessage : suspendedState.updateMessage,
    ingestServerMessages: enabled ? conversation.ingestServerMessages : suspendedState.ingestServerMessages,
    updateConversationMetadata: enabled ? conversation.updateConversationMetadata : suspendedState.updateConversationMetadata,
    requestMessageReactions: enabled ? conversation.requestMessageReactions : suspendedState.requestMessageReactions,
    toggleMessageReaction: enabled ? conversation.toggleMessageReaction : suspendedState.toggleMessageReaction,

    // Actions & Sending (from useChatComposer)
    sendMessage: enabled ? composer.sendMessage : suspendedState.sendMessage,

    // Payments (from usePaymentStatus)
    paymentRetryNotice: enabled ? payments.paymentRetryNotice : suspendedState.paymentRetryNotice,
    verifiedPaidIntakeUuids: enabled ? verifiedPaidIntakeUuids : suspendedState.verifiedPaidIntakeUuids,

    // Intake Logic (from useIntakeFlow)
    intakeStatus: enabled ? intake.intakeStatus : suspendedState.intakeStatus,
    intakeConversationState: enabled ? intake.intakeConversationState : suspendedState.intakeConversationState,
    slimContactDraft: enabled ? intake.slimContactDraft : suspendedState.slimContactDraft,
    handleSlimFormContinue: enabled ? intake.handleSlimFormContinue : suspendedState.handleSlimFormContinue,
    handleBuildBrief: enabled ? intake.handleBuildBrief : suspendedState.handleBuildBrief,
    handleIntakeCtaResponse: enabled ? intake.handleIntakeCtaResponse : suspendedState.handleIntakeCtaResponse,
    resetIntakeCta: enabled ? intake.resetIntakeCta : suspendedState.resetIntakeCta,
    handleConfirmSubmit: enabled ? intake.handleConfirmSubmit : suspendedState.handleConfirmSubmit,
    handleFinalizeSubmit: enabled ? intake.handleFinalizeSubmit : suspendedState.handleFinalizeSubmit,
    handleSubmitNow: enabled ? intake.handleSubmitNow : suspendedState.handleSubmitNow,
    handleContactFormSubmit: enabled ? intake.handleContactFormSubmit : suspendedState.handleContactFormSubmit,
    applyIntakeFields: enabled ? intake.applyIntakeFields : suspendedState.applyIntakeFields,

    // App state
    isConsultFlowActive: enabled ? isConsultFlowActive : suspendedState.isConsultFlowActive,
  }), [
    enabled,
    conversation.messages,
    conversation.conversationMetadata,
    conversation.messagesReady,
    conversation.hasMoreMessages,
    conversation.isLoadingMoreMessages,
    conversation.isSocketReady,
    conversation.loadMoreMessages,
    conversation.startConsultFlow,
    conversation.clearMessages,
    conversation.addMessage,
    conversation.updateMessage,
    conversation.ingestServerMessages,
    conversation.updateConversationMetadata,
    conversation.requestMessageReactions,
    conversation.toggleMessageReaction,
    composer.sendMessage,
    payments.paymentRetryNotice,
    verifiedPaidIntakeUuids,
    intake.intakeStatus,
    intake.intakeConversationState,
    intake.slimContactDraft,
    intake.handleSlimFormContinue,
    intake.handleBuildBrief,
    intake.handleIntakeCtaResponse,
    intake.resetIntakeCta,
    intake.handleConfirmSubmit,
    intake.handleFinalizeSubmit,
    intake.handleSubmitNow,
    intake.handleContactFormSubmit,
    intake.applyIntakeFields,
    isConsultFlowActive,
    suspendedState,
  ]);
};
