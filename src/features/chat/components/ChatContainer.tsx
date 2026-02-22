import { FunctionComponent } from 'preact';
import type { ComponentChildren, JSX } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import VirtualMessageList from './VirtualMessageList';
import MessageComposer from './MessageComposer';
import { ChatMessageUI } from '../../../../worker/types';
import { FileAttachment } from '../../../../worker/types';
import { ContactData, ContactForm } from '@/features/intake/components/ContactForm';
import { IntakePaymentModal } from '@/features/intake/components/IntakePaymentModal';
import { isValidStripePaymentLink, type IntakePaymentRequest } from '@/shared/utils/intakePayments';
import { createKeyPressHandler } from '@/shared/utils/keyboard';
import type { UploadingFile } from '@/shared/hooks/useFileUpload';
import { useMobileDetection } from '@/shared/hooks/useMobileDetection';
import AuthPromptModal from './AuthPromptModal';
import type { ConversationMode } from '@/shared/types/conversation';
import type { ReplyTarget } from '@/features/chat/types';
import { useTranslation } from '@/shared/i18n/hooks';
import type { LayoutMode } from '@/app/MainApp';
import type { IntakeConversationState } from '@/shared/types/intake';
import { getChatPatterns } from '../config/chatPatterns';
import { cn } from '@/shared/utils/cn';

export interface ChatContainerProps {
  messages: ChatMessageUI[];
  conversationTitle?: string | null;
  onSendMessage: (message: string, attachments: FileAttachment[], replyToMessageId?: string | null) => void;
  onAddMessage?: (message: ChatMessageUI) => void;
  conversationMode?: ConversationMode | null;
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
  intakeConversationState?: IntakeConversationState | null;
  onIntakeCtaResponse?: (response: 'ready' | 'not_yet') => void;
  onSlimFormContinue?: (data: ContactData) => void | Promise<void>;
  onSlimFormDismiss?: () => void | Promise<void>;
  onBuildBrief?: () => void;
  onSubmitNow?: () => void | Promise<void>;
  slimContactDraft?: {
    name: string;
    email: string;
    phone: string;
  } | null;
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
    mattersBasePath: string;
    navigateTo: (path: string) => void;
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
  onAddMessage: _onAddMessage,
  conversationMode,
  isPublicWorkspace = false,
  practiceConfig,
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
  intakeConversationState,
  onIntakeCtaResponse,
  onSlimFormContinue,
  onSlimFormDismiss,
  onBuildBrief,
  onSubmitNow,
  slimContactDraft,
  clearInput,
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
  const [pendingSubmitAfterAuth, setPendingSubmitAfterAuth] = useState(false);
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
  const shouldShowSlimForm = intakeStatus?.step === 'contact_form_slim' && conversationMode === 'REQUEST_CONSULTATION';
  const [slimDrawerOffset, setSlimDrawerOffset] = useState(0);
  const [isDismissingSlimDrawer, setIsDismissingSlimDrawer] = useState(false);
  const slimDrawerDragRef = useRef<{ pointerId: number | null; startY: number }>({ pointerId: null, startY: 0 });
  const slimDrawerOpenedAtRef = useRef(0);
  const ignoreNextSlimBackdropClickRef = useRef(false);
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

    const lastMessage = filteredMessages[filteredMessages.length - 1];
    const hasIntakeCta = Boolean(lastMessage?.metadata?.intakeReadyCta);
    const canHandleCta = hasIntakeCta && intakeConversationState?.ctaResponse !== 'ready';
    const normalized = message.trim();
    const { affirmative, negative } = getChatPatterns('en'); // TODO: Pass actual language when available
    const isAffirmative = affirmative.test(normalized);
    const isNegative = negative.test(normalized);

    if (canHandleCta && onIntakeCtaResponse) {
      if (isAffirmative) {
        (async () => {
          await handleSubmitNowAction();
        })();
        setInputValue('');
        setReplyTarget(null);
        if (textareaRef.current && isMobile) {
          textareaRef.current.blur();
        }
        return;
      }
      if (isNegative) {
        onIntakeCtaResponse('not_yet');
        setInputValue('');
        setReplyTarget(null);
        if (textareaRef.current && isMobile) {
          textareaRef.current.blur();
        }
        return;
      }
    }

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

  const handleQuickReply = (text: string) => {
    setInputValue(text);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const onSubmitNowRef = useRef(onSubmitNow);
  useEffect(() => {
    onSubmitNowRef.current = onSubmitNow;
  }, [onSubmitNow]);

  const handleSubmitNowAction = async () => {
    if (isAnonymousUser) {
      setPendingSubmitAfterAuth(true);
      onAuthPromptRequest?.();
      return;
    }
    if (onSubmitNow) {
      await onSubmitNow();
      return;
    }
    onIntakeCtaResponse?.('ready');
  };

  useEffect(() => {
    if (!pendingSubmitAfterAuth) return;
    if (isAnonymousUser) return;
    if (!onSubmitNowRef.current) {
      onIntakeCtaResponse?.('ready');
      setPendingSubmitAfterAuth(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        await onSubmitNowRef.current?.();
      } catch (error) {
        console.error('Failed to continue intake after auth', error);
      } finally {
        if (!cancelled) {
          setPendingSubmitAfterAuth(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAnonymousUser, pendingSubmitAfterAuth]);

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
    setPendingSubmitAfterAuth(false);
    onAuthPromptClose?.();
  };

  const handleAuthSuccess = async () => {
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

  /**
   * Layout mode resolution:
   * - 'widget'  → public chat (iframe or direct). No centering or max-width.
   * - 'desktop' → full-chrome practice workspace.
   * - 'mobile'  → authenticated client mobile view.
   *
   * useFrame=false is a legacy escape hatch for desktop mode.
   */
  const resolvedLayoutMode: LayoutMode = layoutMode ?? (useFrame === false ? 'desktop' : 'widget');
  const isWidgetMode = resolvedLayoutMode === 'widget';
  const isDesktopMode = resolvedLayoutMode === 'desktop';

  const containerClassName = `flex flex-col min-h-0 flex-1 ${heightClassName ?? 'h-full'} w-full m-0 p-0 relative overflow-hidden bg-transparent border-0 rounded-none shadow-none`;

  // mainClassName: widget and desktop have no centering wrapper.
  const mainClassName = isDesktopMode
    ? 'flex flex-col flex-1 min-h-0 w-full overflow-hidden relative'
    : isWidgetMode
      ? 'flex flex-col flex-1 min-h-0 w-full h-full overflow-hidden relative bg-transparent'
      : `flex flex-col flex-1 min-h-0 w-full overflow-hidden relative ${isPublicWorkspace ? 'items-center px-3 py-4' : 'bg-transparent'}`;

  // frameClassName: widget fills 100%; non-widget public caps at 420px; desktop is unconstrained.
  const frameClassName = isDesktopMode
    ? 'relative flex flex-col flex-1 min-h-0 w-full'
    : isWidgetMode
      ? 'relative flex flex-col flex-1 min-h-0 w-full h-full overflow-hidden bg-transparent border-0 rounded-none shadow-none'
      : (isPublicWorkspace
        ? 'relative flex flex-col flex-1 min-h-0 w-full max-w-[420px] mx-auto overflow-hidden bg-transparent border-0 rounded-none shadow-none'
        : 'relative flex flex-col flex-1 min-h-0 w-full');


  const handleReply = (target: ReplyTarget) => {
    setReplyTarget(target);
    textareaRef.current?.focus();
  };

  const handleCancelReply = () => {
    setReplyTarget(null);
  };

  useEffect(() => {
    if (shouldShowSlimForm) {
      slimDrawerOpenedAtRef.current = Date.now();
      // Prevent the opening click/tap from immediately dismissing the drawer via backdrop click-through.
      ignoreNextSlimBackdropClickRef.current = true;
      return;
    }
    slimDrawerOpenedAtRef.current = 0;
    ignoreNextSlimBackdropClickRef.current = false;
  }, [shouldShowSlimForm]);

  const dismissSlimForm = async (source: 'backdrop' | 'gesture' | 'manual' = 'manual') => {
    if (!onSlimFormDismiss || isDismissingSlimDrawer) return;
    if (source === 'backdrop') {
      if (ignoreNextSlimBackdropClickRef.current) {
        ignoreNextSlimBackdropClickRef.current = false;
        return;
      }
      const openedAt = slimDrawerOpenedAtRef.current;
      if (openedAt > 0 && Date.now() - openedAt < 1000) {
        return;
      }
    }
    setIsDismissingSlimDrawer(true);
    setSlimDrawerOffset(0);
    try {
      await onSlimFormDismiss();
    } finally {
      setIsDismissingSlimDrawer(false);
    }
  };

  const handleSlimDrawerPointerDown = (event: JSX.TargetedPointerEvent<HTMLDivElement>) => {
    slimDrawerDragRef.current = { pointerId: event.pointerId, startY: event.clientY };
  };

  const handleSlimDrawerPointerMove = (event: JSX.TargetedPointerEvent<HTMLDivElement>) => {
    const activePointerId = slimDrawerDragRef.current.pointerId;
    if (activePointerId === null || event.pointerId !== activePointerId) return;
    const delta = Math.max(0, event.clientY - slimDrawerDragRef.current.startY);
    setSlimDrawerOffset(delta);
  };

  const handleSlimDrawerPointerUp = async (event: JSX.TargetedPointerEvent<HTMLDivElement>) => {
    const activePointerId = slimDrawerDragRef.current.pointerId;
    if (activePointerId === null || event.pointerId !== activePointerId) return;
    const shouldDismiss = slimDrawerOffset > 72;
    slimDrawerDragRef.current.pointerId = null;
    setSlimDrawerOffset(0);
    if (shouldDismiss) {
      await dismissSlimForm('gesture');
    }
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
                <div className={cn(
                  'flex flex-col items-center justify-start px-6 text-center text-sm text-input-placeholder',
                  shouldShowSlimForm ? 'pt-2 pb-0' : 'flex-1 pt-8'
                )}>
                  <p className="max-w-[300px]">
                    {typeof practiceConfig?.introMessage === 'string' && practiceConfig.introMessage.trim()
                      ? practiceConfig.introMessage.trim()
                      : t('chat.publicIntro')}
                  </p>
                </div>
              ) : (
                <>
                  <VirtualMessageList
                    messages={messagesReady ? filteredMessages : []}
                    conversationTitle={conversationTitle}
                    practiceConfig={practiceConfig}
                    isPublicWorkspace={isPublicWorkspace}
                    onOpenSidebar={onOpenSidebar}
                    onOpenPayment={handleOpenPayment}
                    practiceId={practiceId}
                    onReply={handleReply}
                    onToggleReaction={onToggleReaction}
                    onRequestReactions={onRequestReactions}
                    onAuthPromptRequest={onAuthPromptRequest}
                    intakeStatus={intakeStatus}
                    intakeConversationState={intakeConversationState}
                    hasSlimContactDraft={Boolean(slimContactDraft)}
                    onQuickReply={handleQuickReply}
                    onIntakeCtaResponse={onIntakeCtaResponse}
                    onSubmitNow={handleSubmitNowAction}
                    onBuildBrief={onBuildBrief}
                    modeSelectorActions={onSelectMode ? {
                      onAskQuestion: handleAskQuestion,
                      onRequestConsultation: handleRequestConsultation
                    } : undefined}
                    leadReviewActions={leadReviewActions}
                    hasMoreMessages={hasMoreMessages}
                    isLoadingMoreMessages={isLoadingMoreMessages}
                    onLoadMoreMessages={onLoadMoreMessages}
                    showSkeleton={!messagesReady}
                    compactLayout={shouldShowSlimForm}
                  />
                </>
              )}
            </div>

            {shouldShowSlimForm && onSlimFormContinue ? (
              <button
                type="button"
                className="absolute inset-0 z-[950] h-full w-full cursor-default bg-black/20"
                aria-label={t('common.close')}
                onClick={() => { void dismissSlimForm('backdrop'); }}
              />
            ) : null}

            <div className="sticky bottom-0 z-[1000] w-full">
              {shouldShowSlimForm && onSlimFormContinue ? (
                <div
                  className="px-4 pb-6 pt-4 bg-surface-overlay/95 backdrop-blur-2xl rounded-t-3xl max-h-[80dvh] overflow-y-auto shadow-2xl flex flex-col w-full animate-drawer-up"
                  style={{ transform: slimDrawerOffset > 0 ? `translateY(${slimDrawerOffset}px)` : undefined }}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    className="w-12 h-1.5 bg-input-placeholder/20 rounded-full mx-auto mb-6 shrink-0 touch-none cursor-grab active:cursor-grabbing"
                    aria-label={t('common.close')}
                    onPointerDown={handleSlimDrawerPointerDown}
                    onPointerMove={handleSlimDrawerPointerMove}
                    onPointerUp={(event) => { void handleSlimDrawerPointerUp(event); }}
                    onPointerCancel={() => {
                      slimDrawerDragRef.current.pointerId = null;
                      setSlimDrawerOffset(0);
                    }}
                  />
                  <ContactForm
                    onSubmit={onSlimFormContinue}
                    fields={['name', 'email', 'phone']}
                    required={['name', 'email', 'phone']}
                    initialValues={slimContactDraft ?? undefined}
                    variant="plain"
                    showSubmitButton={true}
                    submitFullWidth={true}
                    submitLabel={t('chat.continue')}
                  />
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
          </div>
        ) : null}
      </main>

      <AuthPromptModal
        isOpen={showAuthPrompt}
        onClose={handleAuthPromptClose}
        practiceName={practiceConfig?.name}
        initialName={slimContactDraft?.name}
        initialEmail={slimContactDraft?.email}
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
