import { useState, useMemo, useRef } from 'preact/hooks';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import type { ConversationMetadata, ConversationMode, SetupFieldsPayload } from '@/shared/types/conversation';
import { useIntakeFlow } from '@/shared/hooks/useIntakeFlow';
import { useSetupFlow } from '@/shared/hooks/useSetupFlow';
import { useConversation } from '@/shared/hooks/useConversation';
import { useChatComposer } from '@/shared/hooks/useChatComposer';
import { usePaymentStatus } from '@/shared/hooks/usePaymentStatus';
import { resolveConsultationState, applyConsultationPatchToMetadata } from '@/shared/utils/consultationState';
import type { 
  IntakeConversationState, 
  SlimContactDraft, 
  IntakeFieldsPayload, 
  DerivedIntakeStatus, 
  IntakeFieldChangeOptions 
} from '@/shared/types/intake';
import type { ChatMessageUI, FileAttachment } from '../../../worker/types';
import type { ConversationMessage } from '@/shared/types/conversation';
import type { ContactData } from '@/features/intake/components/ContactForm';

export interface UseMessageHandlingOptions {
  enabled?: boolean;
  practiceId?: string;
  practiceSlug?: string;
  conversationId?: string;
  onEnsureConversation?: () => Promise<string | null>;
  userId?: string | null;
  isAnonymous?: boolean;
  linkAnonymousConversationOnLoad?: boolean;
  mode?: ConversationMode | null;
  onConversationMetadataUpdated?: (metadata: ConversationMetadata | null) => void;
  onError?: (error: unknown, context?: Record<string, unknown>) => void;
  skipInitialFetch?: boolean;
}

export interface UseMessageHandlingResult {
  messages: ChatMessageUI[];
  conversationMetadata: ConversationMetadata | null;
  messagesReady: boolean;
  hasMoreMessages: boolean;
  isLoadingMoreMessages: boolean;
  isSocketReady: boolean;
  loadMoreMessages: () => Promise<void>;
  startConsultFlow: (id: string) => void;
  clearMessages: () => void;
  addMessage: (msg: ChatMessageUI) => void;
  updateMessage: (id: string, patch: Partial<ChatMessageUI>) => void;
  ingestServerMessages: (msgs: ConversationMessage[]) => void;
  updateConversationMetadata: (patch: Partial<ConversationMetadata>) => Promise<ConversationMetadata | null>;
  requestMessageReactions: (messageId: string) => Promise<void>;
  toggleMessageReaction: (messageId: string, emoji: string) => Promise<void>;
  sendMessage: (content: string, attachments?: FileAttachment[], replyToId?: string | null, options?: { additionalContext?: string }) => Promise<void>;
  paymentRetryNotice: { message: string; paymentUrl: string } | null;
  verifiedPaidIntakeUuids: Set<string>;
  intakeStatus: DerivedIntakeStatus | null;
  intakeConversationState: IntakeConversationState | null;
  slimContactDraft: SlimContactDraft | null;
  handleSlimFormContinue: (draft: ContactData) => Promise<void>;
  handleBuildBrief: () => Promise<void>;
  handleIntakeCtaResponse: (response: 'ready' | 'not_yet') => Promise<void>;
  resetIntakeCta: () => Promise<void>;
  handleConfirmSubmit: () => Promise<void>;
  handleFinalizeSubmit: (options?: { generatePaymentLinkOnly?: boolean }) => Promise<{ paymentLinkUrl: string | null; intakeUuid: string | null }>;
  handleContactFormSubmit: (data: ContactData) => Promise<void>;
  applyIntakeFields: (payload: IntakeFieldsPayload, options?: IntakeFieldChangeOptions) => Promise<void>;
  setupFields: SetupFieldsPayload;
  applySetupFields: (payload: Partial<SetupFieldsPayload>, options?: { sendSystemAck?: boolean }) => Promise<void>;
  isConsultFlowActive: boolean;
}

const DISABLED_MESSAGE_HANDLING_RESULT: UseMessageHandlingResult = {
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
  requestMessageReactions: async () => {},
  toggleMessageReaction: async () => {},
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
  handleFinalizeSubmit: async () => ({ paymentLinkUrl: null, intakeUuid: null }),
  handleContactFormSubmit: async () => {},
  applyIntakeFields: async () => {},
  setupFields: {},
  applySetupFields: async () => {},
  isConsultFlowActive: false,
};

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
    onEnsureConversation,
    userId,
    isAnonymous,
    mode,
    onConversationMetadataUpdated,
    onError,
    linkAnonymousConversationOnLoad = false,
    skipInitialFetch = false,
  } = options;

  const composerRef = useRef<ReturnType<typeof useChatComposer> | null>(null);

  // 3. Core Transport & State
  const conversation = useConversation({
    enabled,
    practiceId,
    conversationId,
    userId,
    isAnonymous,
    linkAnonymousConversationOnLoad,
    onConversationMetadataUpdated,
    skipInitialFetch,
    onError,
  });

  const consultation = useMemo(
    () => resolveConsultationState(conversation.conversationMetadata),
    [conversation.conversationMetadata]
  );

  // Keep ref updated for subsequent intakes if needed, though usually stable

  // Intake Flow logic
  const liveIntake = useIntakeFlow({
    enabled,
    conversationId,
    practiceId,
    practiceSlug,
    onEnsureConversation,
    conversationMetadata: conversation.conversationMetadata,
    slimContactDraft: consultation?.contact ?? null,
    conversationMetadataRef: conversation.conversationMetadataRef,
    updateConversationMetadata: conversation.updateConversationMetadata,
    applyServerMessages: conversation.applyServerMessages,
    sendMessage: (content, att, reply, opts) => {
      const fn = composerRef.current?.sendMessage;
      return fn ? fn(content, att, reply, opts) : Promise.resolve();
    },
    sendMessageOverWs: (content, att, meta, reply, convId) => {
      const fn = composerRef.current?.sendMessageOverWs;
      return fn ? fn(content, att, meta, reply, convId) : Promise.resolve({ messageId: '', seq: 0, serverTs: '', clientId: '' });
    },
    onError,
  });

  const liveSetup = useSetupFlow({
    enabled,
    conversationId,
    practiceId,
    conversationMetadata: conversation.conversationMetadata,
    conversationMetadataRef: conversation.conversationMetadataRef,
    updateConversationMetadata: conversation.updateConversationMetadata,
  });


  // 3. User Actions & AI (Streaming, Intent, etc)
  const composer = useChatComposer({
    enabled,
    practiceId,
    practiceSlug,
    conversationId,
    onEnsureConversation,
    userId,
    linkAnonymousConversationOnLoad,
    mode: conversation.conversationMetadata?.mode ?? mode ?? null,
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
    pendingEnsureConversationPromisesRef: conversation.pendingEnsureConversationPromisesRef,
    connectChatRoom: conversation.connectChatRoom,
    updateConversationMetadata: conversation.updateConversationMetadata,
    applyServerMessages: conversation.applyServerMessages,
    fetchConversationMetadata: conversation.fetchConversationMetadata,
    applyIntakeFields: liveIntake.applyIntakeFields,
    applySetupFields: liveSetup.applySetupFields,
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
      // Patch conversation metadata to mark payment as received
      const nextMetadata = applyConsultationPatchToMetadata(
        conversation.conversationMetadata,
        { submission: { paymentReceived: true } },
        { mirrorLegacyFields: true }
      );
      // Unmount-safe async update
      let isMounted = true;
      (async () => {
        try {
          await conversation.updateConversationMetadata(nextMetadata);
        } catch (error) {
          if (isMounted) {
            setVerifiedPaidIntakeUuids(prev => {
              const next = new Set(prev);
              next.delete(uuid);
              return next;
            });
            if (typeof onError === 'function') {
              onError(error, { context: 'updateConversationMetadata', conversationId });
            }
          }
        }
      })();
      return () => { isMounted = false; };
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

  return useMemo(() => {
    if (!enabled) {
      return DISABLED_MESSAGE_HANDLING_RESULT;
    }

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
      sendMessage: async (...args: Parameters<typeof composer.sendMessage>) => {
        // Ensure we have a conversation record and its ID before proceeding
        if (typeof onEnsureConversation === 'function') {
          const ensuredId = await onEnsureConversation();
          if (ensuredId == null) {
            throw new Error('Failed to ensure conversation before sending message.');
          }
        }

        const isDraft = conversation.conversationMetadataRef.current?.status === 'draft' ||
                        (!conversation.conversationMetadataRef.current && skipInitialFetch);
        if (isDraft) {
          try {
            await conversation.updateConversationMetadata({ status: 'active' });
          } catch (err) {
            console.error('[useMessageHandling] Failed to activate conversation on send', err);
            throw err;
          }
        }
        return composer.sendMessage(...args);
      },

      // Payments (from usePaymentStatus)
      paymentRetryNotice: payments.paymentRetryNotice,
      verifiedPaidIntakeUuids,

      // Intake Logic (from useIntakeFlow)
      intakeStatus: liveIntake.intakeStatus,
      intakeConversationState: liveIntake.intakeConversationState,
      slimContactDraft: liveIntake.slimContactDraft,
      handleSlimFormContinue: liveIntake.handleSlimFormContinue,
      handleBuildBrief: liveIntake.handleBuildBrief,
      handleIntakeCtaResponse: liveIntake.handleIntakeCtaResponse,
      resetIntakeCta: liveIntake.resetIntakeCta,
      handleConfirmSubmit: liveIntake.handleConfirmSubmit,
      handleFinalizeSubmit: liveIntake.handleFinalizeSubmit,
      handleContactFormSubmit: liveIntake.handleContactFormSubmit,
      applyIntakeFields: liveIntake.applyIntakeFields,
      setupFields: liveSetup.setupFields,
      applySetupFields: liveSetup.applySetupFields,

      // App state
      isConsultFlowActive,
    };
  }, [
    enabled,
    conversation,
    composer,
    onEnsureConversation,
    skipInitialFetch,
    payments.paymentRetryNotice,
    verifiedPaidIntakeUuids,
    liveIntake.intakeStatus,
    liveIntake.intakeConversationState,
    liveIntake.slimContactDraft,
    liveIntake.handleSlimFormContinue,
    liveIntake.handleBuildBrief,
    liveIntake.handleIntakeCtaResponse,
    liveIntake.resetIntakeCta,
    liveIntake.handleConfirmSubmit,
    liveIntake.handleFinalizeSubmit,
    liveIntake.handleContactFormSubmit,
    liveIntake.applyIntakeFields,
    liveSetup.setupFields,
    liveSetup.applySetupFields,
    isConsultFlowActive
  ]);
};
