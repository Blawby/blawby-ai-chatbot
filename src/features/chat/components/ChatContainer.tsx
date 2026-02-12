import { FunctionComponent } from 'preact';
import type { ComponentChildren } from 'preact';
import { useState, useEffect, useRef, useMemo } from 'preact/hooks';
import VirtualMessageList from './VirtualMessageList';
import MessageComposer from './MessageComposer';
import { ChatMessageUI } from '../../../../worker/types';
import { FileAttachment } from '../../../../worker/types';
import { ContactData } from '@/features/intake/components/ContactForm';
import { IntakePaymentModal } from '@/features/intake/components/IntakePaymentModal';
import { isValidStripePaymentLink, type IntakePaymentRequest } from '@/shared/utils/intakePayments';
import { createKeyPressHandler } from '@/shared/utils/keyboard';
import type { UploadingFile } from '@/shared/hooks/useFileUpload';
import { useMobileDetection } from '@/shared/hooks/useMobileDetection';
import AuthPromptModal from './AuthPromptModal';
import type { ConversationMode } from '@/shared/types/conversation';
import type { ReplyTarget } from '@/features/chat/types';
import { Button } from '@/shared/ui/Button';
import { useTranslation } from '@/shared/i18n/hooks';
import { triggerIntakeInvitation } from '@/shared/lib/apiClient';
import type { MatterTransitionResult } from '@/shared/hooks/usePracticeManagement';
import type { LayoutMode } from '@/app/MainApp';

export interface ChatContainerProps {
  messages: ChatMessageUI[];
  conversationTitle?: string | null;
  onSendMessage: (message: string, attachments: FileAttachment[], replyToMessageId?: string | null) => void;
  onContactFormSubmit?: (data: ContactData) => void;
  onAddMessage?: (message: ChatMessageUI) => void;
  onSelectMode?: (mode: ConversationMode, source: 'intro_gate' | 'composer_footer') => void;
  onToggleReaction?: (messageId: string, emoji: string) => void;
  onRequestReactions?: (messageId: string) => void;
  composerDisabled?: boolean;
  isPublicWorkspace?: boolean;
  practiceConfig?: {
    name: string;
    profileImage: string | null;
    practiceId: string;
    description?: string | null;
    slug?: string | null;
    introMessage?: string | null;
  };
  showPracticeHeader?: boolean;
  heightClassName?: string;
  headerContent?: ComponentChildren;
  useFrame?: boolean;
  layoutMode?: LayoutMode;
  onOpenSidebar?: () => void;
  practiceId?: string;

  // File handling props
  previewFiles: FileAttachment[];
  uploadingFiles: UploadingFile[];
  removePreviewFile: (index: number) => void;
  clearPreviewFiles: () => void;
  handleFileSelect: (files: File[]) => Promise<void>;
  handleCameraCapture: (file: File) => Promise<void>;
  cancelUpload: (fileId: string) => void;
  handleMediaCapture: (blob: Blob, type: 'audio' | 'video') => void;
  isRecording: boolean;
  setIsRecording: (v: boolean) => void;
  isReadyToUpload?: boolean;
  isSessionReady?: boolean;
  isSocketReady?: boolean;
  intakeStatus?: {
    step: string;
    decision?: string;
    intakeUuid?: string | null;
    paymentRequired?: boolean;
    paymentReceived?: boolean;
  };
  conversationId?: string | null;
  isAnonymousUser?: boolean;
  canChat?: boolean;
  hasMoreMessages?: boolean;
  isLoadingMoreMessages?: boolean;
  onLoadMoreMessages?: () => void | Promise<void>;
  messagesReady?: boolean;
  leadReviewActions?: {
    practiceId: string;
    practiceName: string;
    conversationId: string;
    canReviewLeads: boolean;
    acceptMatter: (practiceId: string, matterId: string) => Promise<MatterTransitionResult>;
    rejectMatter: (practiceId: string, matterId: string) => Promise<MatterTransitionResult>;
    onLeadStatusChange?: () => void;
  };

  // Input control prop
  clearInput?: number;

  // Auth prompt overrides
  showAuthPrompt?: boolean;
  authPromptTitle?: string;
  authPromptDescription?: string;
  authPromptCallbackUrl?: string;
  onAuthPromptRequest?: () => void;
  onAuthPromptClose?: () => void;
  onAuthPromptSuccess?: () => void;
}

const ChatContainer: FunctionComponent<ChatContainerProps> = ({
  messages,
  conversationTitle,
  onSendMessage,
  onContactFormSubmit,
  onAddMessage: _onAddMessage,
  isPublicWorkspace = false,
  practiceConfig,
  showPracticeHeader = true,
  heightClassName,
  headerContent,
  useFrame = true,
  layoutMode,
  onOpenSidebar,
  practiceId,
  onToggleReaction,
  onRequestReactions,
  previewFiles,
  uploadingFiles,
  removePreviewFile,
  clearPreviewFiles,
  handleFileSelect,
  handleCameraCapture,
  cancelUpload,
  handleMediaCapture,
  isRecording,
  setIsRecording,
  isReadyToUpload,
  isSessionReady,
  isSocketReady,
  intakeStatus,
  clearInput,
  conversationId,
  isAnonymousUser,
  canChat = true,
  onSelectMode,
  composerDisabled,
  hasMoreMessages,
  isLoadingMoreMessages,
  onLoadMoreMessages,
  messagesReady = true,
  leadReviewActions,
  showAuthPrompt = false,
  authPromptTitle,
  authPromptDescription,
  authPromptCallbackUrl,
  onAuthPromptRequest,
  onAuthPromptClose,
  onAuthPromptSuccess
}) => {
  const { t } = useTranslation('common');
  const [inputValue, setInputValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isMobile = useMobileDetection();
  const [paymentRequest, setPaymentRequest] = useState<IntakePaymentRequest | null>(null);
  const [pendingPaymentRequest, setPendingPaymentRequest] = useState<IntakePaymentRequest | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const isChatInputLocked = Boolean(composerDisabled) || isSessionReady === false || isSocketReady === false;
  const baseMessages = isPublicWorkspace
    ? messages.filter((message) => message.metadata?.systemMessageKey !== 'ask_question_help'
      && message.metadata?.systemMessageKey !== 'intro')
    : messages;
  const hasNonSystemMessages = baseMessages.some((message) => message.role !== 'system');
  const filteredMessages = hasNonSystemMessages
    ? baseMessages.filter((message) => message.metadata?.systemMessageKey !== 'intro')
    : baseMessages;
  const contactFormMessage = filteredMessages.find((message) => Boolean(message.contactForm));
  const shouldShowContactFormFooter = Boolean(
    contactFormMessage &&
    onContactFormSubmit &&
    intakeStatus?.step === 'contact_form'
  );
  const contactFormId = useMemo(() => (
    conversationId ? `contact-form-${conversationId}` : 'contact-form'
  ), [conversationId]);
  const contactFormVariant = isPublicWorkspace ? 'plain' : 'card';
  // Simple resize handler for window size changes
  useEffect(() => {
    const handleResize = () => {
      if (textareaRef.current) {
        // Use the same improved auto-expand logic
        textareaRef.current.style.height = 'auto';
        const newHeight = Math.max(24, textareaRef.current.scrollHeight);
        textareaRef.current.style.height = `${newHeight}px`;
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Initialize textarea height on mount
  useEffect(() => {
    if (textareaRef.current && textareaRef.current.value) {
      textareaRef.current.style.height = 'auto';
      const newHeight = Math.max(24, textareaRef.current.scrollHeight);
      textareaRef.current.style.height = `${newHeight}px`;
    }
  }, []);

  // Clear input when clearInput prop changes (numeric change counter)
  useEffect(() => {
    if (clearInput && clearInput > 0) {
      setInputValue('');
      if (textareaRef.current) {
        textareaRef.current.value = '';
        textareaRef.current.style.height = '24px';
      }
    }
  }, [clearInput]);

  const handleSubmit = () => {
    if (isChatInputLocked) return;
    if (!inputValue.trim() && previewFiles.length === 0) return;

    const message = inputValue.trim();
    const attachments = [...previewFiles];
    const replyToMessageId = replyTarget?.messageId ?? null;

    // Send message to API
    onSendMessage(message, attachments, replyToMessageId);

    // Clear preview files after sending
    clearPreviewFiles();

    // Reset input
    setInputValue('');
    setReplyTarget(null);

    // Only blur on mobile devices to collapse virtual keyboard
    if (textareaRef.current && isMobile) {
      textareaRef.current.blur();
    }
  };

  const baseKeyHandler = createKeyPressHandler(handleSubmit);

  const handleKeyDown = (e: KeyboardEvent) => {
    // isComposing is not in TypeScript's KeyboardEvent but exists at runtime
    if ((e as KeyboardEvent & { isComposing?: boolean }).isComposing || e.repeat) {
      return;
    }
    if (isChatInputLocked) {
      return;
    }
    baseKeyHandler(e);
  };

  const openPayment = (request: IntakePaymentRequest): boolean => {
    const hasClientSecret = typeof request.clientSecret === 'string' &&
      request.clientSecret.trim().length > 0;
    if (!hasClientSecret &&
      request.paymentLinkUrl &&
      isValidStripePaymentLink(request.paymentLinkUrl) &&
      typeof window !== 'undefined') {
      window.open(request.paymentLinkUrl, '_blank', 'noopener');
      return false;
    }
    setPaymentRequest(request);
    setIsPaymentModalOpen(true);
    return true;
  };

  const handleAuthPromptClose = () => {
    setPendingPaymentRequest(null);
    onAuthPromptClose?.();
  };

  const handleAuthSuccess = () => {
    let modalOpened = false;
    if (pendingPaymentRequest) {
      modalOpened = openPayment(pendingPaymentRequest);
      setPendingPaymentRequest(null);
    }
    if (!modalOpened) {
      onAuthPromptSuccess?.();
    }
  };

  const handleOpenPayment = (request: IntakePaymentRequest) => {
    if (isAnonymousUser) {
      setPendingPaymentRequest(request);
      onAuthPromptRequest?.();
      return;
    }
    openPayment(request);
  };

  const handleClosePayment = () => {
    setIsPaymentModalOpen(false);
  };

  const handlePaymentSuccess = async () => {
    if (!paymentRequest) {
      handleClosePayment();
      return;
    }

    if (paymentRequest.intakeUuid && !isAnonymousUser) {
      try {
        await triggerIntakeInvitation(paymentRequest.intakeUuid);
      } catch (error) {
        console.error('[Chat] Failed to trigger intake invitation', error);
      }
    }

    const isValidUuid = typeof paymentRequest.intakeUuid === 'string'
      && (
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(paymentRequest.intakeUuid)
        || /^[0-9A-HJKMNP-TV-Z]{26}$/i.test(paymentRequest.intakeUuid)
      );

    if (typeof window !== 'undefined' && isValidUuid && paymentRequest.intakeUuid) {
      try {
        const payload: Record<string, string> = {};
        if (paymentRequest.practiceName) payload.practiceName = paymentRequest.practiceName;
        if (paymentRequest.practiceId) payload.practiceId = paymentRequest.practiceId;
        if (paymentRequest.conversationId) payload.conversationId = paymentRequest.conversationId;

        window.sessionStorage.setItem(
          `intakePaymentSuccess:${paymentRequest.intakeUuid}`,
          JSON.stringify(payload)
        );
      } catch (error) {
        console.warn('[Chat] Failed to persist payment success flag', error);
      }
    } else if (paymentRequest.intakeUuid) {
      console.warn('[Chat] Skipped persisting invalid intakeUuid', paymentRequest.intakeUuid);
    }
    handleClosePayment();
  };

  const handleModeSelection = (mode: ConversationMode, source: 'intro_gate' | 'composer_footer') => {
    if (!onSelectMode) return;
    onSelectMode(mode, source);
  };

  const handleAskQuestion = () => {
    handleModeSelection('ASK_QUESTION', 'intro_gate');
  };

  const handleRequestConsultation = () => {
    handleModeSelection('REQUEST_CONSULTATION', 'intro_gate');
  };

  const resolvedLayoutMode: LayoutMode = layoutMode ?? (useFrame === false ? 'desktop' : 'embed');
  const shouldFrame = resolvedLayoutMode !== 'desktop';
  const containerClassName = isPublicWorkspace && !shouldFrame
    ? 'flex flex-col min-h-0 flex-1 h-full w-full m-0 p-0 relative overflow-hidden'
    : `flex flex-col min-h-0 flex-1 ${heightClassName ?? 'h-full'} w-full m-0 p-0 relative overflow-hidden ${isPublicWorkspace ? 'bg-surface-base' : 'bg-surface-base'}`;
  const mainClassName = isPublicWorkspace && !shouldFrame
    ? 'flex flex-col flex-1 min-h-0 w-full overflow-hidden relative'
    : `flex flex-col flex-1 min-h-0 w-full overflow-hidden relative ${isPublicWorkspace ? 'items-center px-3 py-4' : 'bg-surface-base'}`;
  const frameClassName = !shouldFrame
    ? 'flex flex-col flex-1 min-h-0 w-full'
    : (isPublicWorkspace
      ? 'flex flex-col flex-1 min-h-0 w-full max-w-[420px] mx-auto rounded-[32px] bg-surface-base shadow-[0_32px_80px_rgba(15,23,42,0.18)] border border-line-default overflow-hidden'
      : 'flex flex-col flex-1 min-h-0 w-full');

  const handleReply = (target: ReplyTarget) => {
    setReplyTarget(target);
    textareaRef.current?.focus();
  };

  const handleCancelReply = () => {
    setReplyTarget(null);
  };

  return (
    <div
      className={containerClassName}
      data-testid="chat-container"
    >
      <main className={mainClassName}>
        {canChat ? (
          <div className={frameClassName}>
            {headerContent ? (
              <div className="shrink-0">
                {headerContent}
              </div>
            ) : null}
            <div className="flex flex-1 min-h-0 flex-col">
              {isPublicWorkspace && filteredMessages.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-start px-6 pt-8 text-center text-sm text-gray-500 dark:text-gray-400">
                  <p className="max-w-[300px]">
                    {typeof practiceConfig?.introMessage === 'string' && practiceConfig.introMessage.trim()
                      ? practiceConfig.introMessage.trim()
                      : t('chat.publicIntro')}
                  </p>
                </div>
              ) : (
                <VirtualMessageList
                  messages={messagesReady ? filteredMessages : []}
                  conversationTitle={conversationTitle}
                  practiceConfig={practiceConfig}
                  showPracticeHeader={showPracticeHeader && !isPublicWorkspace}
                  isPublicWorkspace={isPublicWorkspace}
                  onOpenSidebar={onOpenSidebar}
                  onContactFormSubmit={onContactFormSubmit}
                  onOpenPayment={handleOpenPayment}
                  practiceId={practiceId}
                  onReply={handleReply}
                  onToggleReaction={onToggleReaction}
                  onRequestReactions={onRequestReactions}
                  onAuthPromptRequest={onAuthPromptRequest}
                  intakeStatus={intakeStatus}
                  modeSelectorActions={onSelectMode ? {
                    onAskQuestion: handleAskQuestion,
                    onRequestConsultation: handleRequestConsultation
                  } : undefined}
                  leadReviewActions={leadReviewActions}
                  hasMoreMessages={hasMoreMessages}
                  isLoadingMoreMessages={isLoadingMoreMessages}
                  onLoadMoreMessages={onLoadMoreMessages}
                  showSkeleton={!messagesReady}
                  contactFormVariant={contactFormVariant}
                  contactFormFormId={contactFormId}
                  showContactFormSubmit={false} // Never show internal submit button
                />
              )}
            </div>

            {shouldShowContactFormFooter ? (
              <div className="pl-4 pr-4 pb-3 bg-surface-base h-auto flex flex-col w-full sticky bottom-0 z-[1000] backdrop-blur-md">
                <Button
                  type="submit"
                  form={contactFormId}
                  variant="primary"
                  className="w-full"
                  disabled={!onContactFormSubmit}
                  data-testid="contact-form-submit-footer"
                  onClick={() => {
                    // Rely on native button type="submit" and form attribute.
                    // If any fallback is needed, it would go here, but preferred
                    // is native behavior. We'll add a log for debugging.
                    if (import.meta.env.DEV) {
                      const form = document.getElementById(contactFormId);
                      if (!form) {
                        console.error('[ChatContainer] Form not found with id:', contactFormId);
                      }
                    }
                  }}
                >
                  {t('forms.contactForm.submit')}
                </Button>
              </div>
            ) : (
              <MessageComposer
                inputValue={inputValue}
                setInputValue={setInputValue}
                previewFiles={previewFiles}
                uploadingFiles={uploadingFiles}
                removePreviewFile={removePreviewFile}
                handleFileSelect={handleFileSelect}
                handleCameraCapture={handleCameraCapture}
                cancelUpload={cancelUpload}
                isRecording={isRecording}
                handleMediaCapture={handleMediaCapture}
                setIsRecording={setIsRecording}
                onSubmit={handleSubmit}
                onKeyDown={handleKeyDown}
                textareaRef={textareaRef}
                isReadyToUpload={isReadyToUpload}
                isSessionReady={isSessionReady}
                isSocketReady={isSocketReady}
                intakeStatus={intakeStatus}
                disabled={composerDisabled}
                showStatusMessage={!isPublicWorkspace}
                replyTo={replyTarget}
                onCancelReply={handleCancelReply}
              />
            )}
          </div>
        ) : null}
      </main>

      <AuthPromptModal
        isOpen={showAuthPrompt}
        onClose={handleAuthPromptClose}
        practiceName={practiceConfig?.name}
        onSuccess={handleAuthSuccess}
        title={authPromptTitle}
        description={authPromptDescription}
        callbackURL={authPromptCallbackUrl}
      />

      <IntakePaymentModal
        isOpen={isPaymentModalOpen}
        onClose={handleClosePayment}
        paymentRequest={paymentRequest}
        onSuccess={handlePaymentSuccess}
      />
    </div>
  );
};

export default ChatContainer; 
