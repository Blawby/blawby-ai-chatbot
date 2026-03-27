import { FunctionComponent } from 'preact';
import type { ComponentChildren } from 'preact';
import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import VirtualMessageList from './VirtualMessageList';
import MessageComposer from './MessageComposer';
import { ChatMessageUI } from '../../../../worker/types';
import { FileAttachment } from '../../../../worker/types';
import { ContactData, ContactForm } from '@/features/intake/components/ContactForm';
import { isValidStripePaymentLink, type IntakePaymentRequest } from '@/shared/utils/intakePayments';
import { createKeyPressHandler } from '@/shared/utils/keyboard';
import type { UploadingFile } from '@/shared/hooks/useFileUpload';
import type { ConversationMode } from '@/shared/types/conversation';
import type { ReplyTarget } from '@/features/chat/types';
import { useTranslation } from '@/shared/i18n/hooks';
import type { LayoutMode } from '@/app/MainApp';
import type { IntakeConversationState } from '@/shared/types/intake';
import { isIntakeSubmittable } from '@/shared/utils/consultationState';
import { getChatPatterns } from '../config/chatPatterns';
import type { OnboardingActions } from './VirtualMessageList';
import { getSession as refreshAuthSession } from '@/shared/lib/authClient';
import { rememberPostAuthConversationContext, type PostAuthConversationContext } from '@/shared/utils/anonymousIdentity';
import { ChatActionCard } from './ChatActionCard';

export interface ChatContainerProps {
  messages: ChatMessageUI[];
  conversationTitle?: string | null;
  onSendMessage: (
    message: string,
    attachments: FileAttachment[],
    replyToMessageId?: string | null,
    options?: { mentionedUserIds?: string[] }
  ) => void;
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
  };
  heightClassName?: string;
  headerContent?: ComponentChildren;
  useFrame?: boolean;
  layoutMode?: LayoutMode;
  onOpenSidebar?: () => void;
  practiceId?: string;
  conversationId?: string | null;

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
  /** Phase 2: called after payment is confirmed; creates the intake record */
  onFinalizeSubmit?: () => void | Promise<{ paymentLinkUrl: string | null }>;
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
  authPromptCallbackUrl?: string;
  onAuthPromptRequest?: () => void;
  onAuthPromptClose?: () => void;
  onAuthPromptSuccess?: () => void;
  onboardingActions?: OnboardingActions;
  mentionCandidates?: Array<{
    userId: string;
    name: string;
    email?: string;
  }>;
  /**
   * Called once (after first render) with ChatContainer's handleOpenPayment function.
   * Allows ancestors to imperatively open the payment card from outside the component,
   * e.g. from useIntakeFlow's payment gate in handleConfirmSubmit.
   */
  onRegisterOpenPayment?: (open: (request: import('@/shared/utils/intakePayments').IntakePaymentRequest) => void) => void;
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
  conversationId,
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
  onFinalizeSubmit,
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
  authPromptCallbackUrl,
  onAuthPromptRequest,
  onAuthPromptClose,
  onAuthPromptSuccess,
  onboardingActions,
  mentionCandidates = [],
  onRegisterOpenPayment,
}) => {
  const { t } = useTranslation('common');
  const [inputValue, setInputValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [paymentRequest, setPaymentRequest] = useState<IntakePaymentRequest | null>(null);
  const [pendingPaymentRequest, setPendingPaymentRequest] = useState<IntakePaymentRequest | null>(null);
  const [pendingSubmitAfterAuth, setPendingSubmitAfterAuth] = useState(false);
  const authSuccessCloseRef = useRef(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const composerDockRef = useRef<HTMLDivElement>(null);
  const [composerInsetPx, setComposerInsetPx] = useState(104);
  const isChatInputLocked = Boolean(composerDisabled) || isSessionReady === false || isSocketReady === false;
  const baseMessages = isPublicWorkspace
    ? messages.filter((message) => message.metadata?.systemMessageKey !== 'ask_question_help')
    : messages;
  const hasUserMessages = messages.some((message) => message.role === 'user');
  const filteredMessages = hasUserMessages
    ? baseMessages.filter((message) => message.metadata?.systemMessageKey !== 'intro')
    : baseMessages;
  
  const hasContactInfoSubmitted = Boolean(
    intakeStatus?.intakeUuid || 
    intakeStatus?.step === 'completed' || 
    intakeStatus?.step === 'pending_review'
  );

  const shouldShowSlimForm = isPublicWorkspace && 
    intakeStatus?.step === 'contact_form_slim' && 
    conversationMode === 'REQUEST_CONSULTATION' && 
    !hasContactInfoSubmitted &&
    typeof onSlimFormContinue === 'function';
  const [isDismissingSlimDrawer, setIsDismissingSlimDrawer] = useState(false);


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

  // Keep message-list bottom padding in sync with the sticky composer height.
  useEffect(() => {
    const element = composerDockRef.current;
    if (!element) return;

    const updateInset = () => {
      const nextInset = Math.max(80, Math.ceil(element.getBoundingClientRect().height) + 12);
      setComposerInsetPx(nextInset);
    };

    updateInset();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateInset);
      observer.observe(element);
      return () => observer.disconnect();
    }

    const fallback = window.setInterval(updateInset, 200);
    return () => window.clearInterval(fallback);
  }, []);

  // Return focus to chat input when slim form is dismissed
  const prevShouldShowSlimFormRef = useRef(shouldShowSlimForm);
  useEffect(() => {
    if (prevShouldShowSlimFormRef.current && !shouldShowSlimForm) {
      textareaRef.current?.focus();
    }
    prevShouldShowSlimFormRef.current = shouldShowSlimForm;
  }, [shouldShowSlimForm]);


  const handleSubmit = (mentionedUserIds?: string[]) => {
    if (isChatInputLocked) return;
    if (!inputValue.trim() && previewFiles.length === 0) return;

    const message = inputValue.trim();
    const attachments = [...previewFiles];
    const replyToMessageId = replyTarget?.messageId ?? null;

    const canHandleCta = isIntakeSubmittable(intakeConversationState, {
      paymentRequired: intakeStatus?.paymentRequired ?? null,
      paymentReceived: intakeStatus?.paymentReceived ?? null,
    }) && intakeConversationState?.ctaResponse !== 'ready';
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
        return;
      }
      if (isNegative) {
        onIntakeCtaResponse('not_yet');
        setInputValue('');
        setReplyTarget(null);
        return;
      }
    }

    // Send message to API
    onSendMessage(message, attachments, replyToMessageId, { mentionedUserIds });

    // Clear preview files after sending
    clearPreviewFiles();

    // Reset input
    setInputValue('');
    setReplyTarget(null);
  };

  const handleQuickReply = (text: string) => {
    setInputValue(text);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const onSubmitNowRef = useRef(onSubmitNow);
  const submitActionInFlightRef = useRef(false);
  useEffect(() => {
    onSubmitNowRef.current = onSubmitNow;
  }, [onSubmitNow]);

  const effectiveLayout: LayoutMode = layoutMode ?? 'widget';
  const resolvedWorkspaceType: PostAuthConversationContext['workspace'] = isPublicWorkspace
    ? 'public'
    : effectiveLayout === 'mobile'
      ? 'client'
      : effectiveLayout === 'widget'
        ? 'widget'
        : 'practice';

  const rememberPostAuthContext = useCallback(() => {
    if (!isAnonymousUser) return;
    if (!conversationId) return;
    const resolvedPracticeId = practiceConfig?.practiceId || practiceId;
    const resolvedPracticeSlug = practiceConfig?.slug || null;
    if (!resolvedPracticeId && !resolvedPracticeSlug) return;
    rememberPostAuthConversationContext({
      conversationId,
      practiceId: resolvedPracticeId ?? null,
      practiceSlug: resolvedPracticeSlug,
      workspace: resolvedWorkspaceType,
    });
  }, [conversationId, isAnonymousUser, practiceConfig?.practiceId, practiceConfig?.slug, practiceId, resolvedWorkspaceType]);

  const emitAuthPromptRequest = useCallback(() => {
    rememberPostAuthContext();
    onAuthPromptRequest?.();
  }, [rememberPostAuthContext, onAuthPromptRequest]);

  useEffect(() => {
    if (!showAuthPrompt) return;
    rememberPostAuthContext();
  }, [rememberPostAuthContext, showAuthPrompt]);

  const handleSubmitNowAction = async () => {
    if (submitActionInFlightRef.current) {
      return;
    }
    submitActionInFlightRef.current = true;
    if (onSubmitNow) {
      try {
        await onSubmitNow();
      } finally {
        submitActionInFlightRef.current = false;
      }
      return;
    }
    try {
      if (onIntakeCtaResponse) {
        await Promise.resolve(onIntakeCtaResponse('ready'));
      }
    } finally {
      submitActionInFlightRef.current = false;
    }
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
  }, [isAnonymousUser, pendingSubmitAfterAuth, onIntakeCtaResponse]);

  const baseKeyHandler = createKeyPressHandler(handleSubmit);

  const handleKeyDown = (e: KeyboardEvent, mentionedUserIds?: string[]) => {
    // isComposing is not in TypeScript's KeyboardEvent but exists at runtime
    if ((e as KeyboardEvent & { isComposing?: boolean }).isComposing || e.repeat) {
      return;
    }
    if (isChatInputLocked) {
      return;
    }
    
    // Check for Enter (without Shift) to handle submission with mention data
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(mentionedUserIds);
      return;
    }

    baseKeyHandler(e);
  };

  const openPayment = useCallback((request: IntakePaymentRequest): boolean => {
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
  }, []);

  const handleAuthPromptClose = () => {
    setPendingPaymentRequest(null);
    if (!authSuccessCloseRef.current) {
      setPendingSubmitAfterAuth(false);
    }
    authSuccessCloseRef.current = false;
    onAuthPromptClose?.();
  };

  const handleAuthSuccess = async () => {
    authSuccessCloseRef.current = true;
    try {
      await refreshAuthSession().catch(() => undefined);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('auth:session-updated'));
      }
    } catch {
      // best effort: the auth form has already completed the sign-in
    }
    let modalOpened = false;
    if (pendingPaymentRequest) {
      modalOpened = openPayment(pendingPaymentRequest);
      setPendingPaymentRequest(null);
    }
    if (!modalOpened) {
      onAuthPromptSuccess?.();
    }
  };

  const handleOpenPayment = useCallback((request: IntakePaymentRequest) => {
    if (isAnonymousUser) {
      setPendingPaymentRequest(request);
      emitAuthPromptRequest();
      return;
    }
    openPayment(request);
  }, [isAnonymousUser, emitAuthPromptRequest, openPayment, setPendingPaymentRequest]);

  // Register handleOpenPayment with the parent once it is stable.
  // The parent (WidgetApp/MainApp) stores the ref and passes it as onOpenPayment
  // to useMessageHandling → useIntakeFlow so the payment gate can open the card
  // without going through message metadata parsing.
  useEffect(() => {
    if (onRegisterOpenPayment) {
      onRegisterOpenPayment(handleOpenPayment);
    }
  }, [onRegisterOpenPayment, handleOpenPayment]);

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
    // Phase 2: now that payment is confirmed, create the intake record.
    if (onFinalizeSubmit) {
      try {
        const result = await onFinalizeSubmit();
        if (result && typeof result === 'object' && 'paymentLinkUrl' in result && result.paymentLinkUrl) {
          openPayment({
            intakeUuid: paymentRequest?.intakeUuid ?? '',
            paymentLinkUrl: result.paymentLinkUrl,
            practiceId: paymentRequest?.practiceId ?? '',
            conversationId: paymentRequest?.conversationId ?? '',
          });
        }
      } catch (finalizeError) {
        console.error('[ChatContainer] handleFinalizeSubmit failed after payment success', finalizeError);
      }
    }
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
      : `flex flex-col flex-1 min-h-0 w-full overflow-hidden relative ${isPublicWorkspace ? 'bg-transparent px-2 sm:px-4 py-4' : 'bg-transparent'}`;

  // frameClassName: widget fills 100%; non-widget public caps at 420px; desktop is unconstrained.
  const frameClassName = isDesktopMode
    ? 'relative flex flex-col flex-1 min-h-0 w-full'
    : isWidgetMode
      ? 'relative flex flex-col flex-1 min-h-0 w-full h-full overflow-hidden bg-transparent border-0 rounded-none shadow-none'
      : (isPublicWorkspace
        ? 'relative flex flex-col flex-1 min-h-0 w-full overflow-hidden bg-transparent border-0 rounded-none shadow-none'
        : 'relative flex flex-col flex-1 min-h-0 w-full');


  const handleReply = (target: ReplyTarget) => {
    setReplyTarget(target);
    textareaRef.current?.focus();
  };

  const handleCancelReply = () => {
    setReplyTarget(null);
  };



  const dismissSlimForm = async (source: 'backdrop' | 'gesture' | 'manual' = 'manual') => {
    void source;
    if (!onSlimFormDismiss || isDismissingSlimDrawer) return;
    setIsDismissingSlimDrawer(true);
    try {
      await onSlimFormDismiss();
    } finally {
      setIsDismissingSlimDrawer(false);
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
            <div 
              className="flex flex-1 min-h-0 flex-col"
            >
              {headerContent ? (
                <div className="shrink-0">
                  {headerContent}
                </div>
              ) : null}
              <div className="flex flex-1 min-h-0 flex-col">
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
                  onAuthPromptRequest={emitAuthPromptRequest}
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
                  compactLayout={false}
                  onboardingActions={onboardingActions}
                  bottomInsetPx={composerInsetPx}
                />
              </div>

            </div>

            <div ref={composerDockRef} className="sticky bottom-0 z-[1000] w-full">
              <ChatActionCard
                isOpen={isPaymentModalOpen || showAuthPrompt || shouldShowSlimForm}
                type={isPaymentModalOpen ? 'payment' : showAuthPrompt ? 'auth' : shouldShowSlimForm ? 'slim-form' : null}
                onClose={() => {
                  if (isPaymentModalOpen) handleClosePayment();
                  else if (showAuthPrompt) handleAuthPromptClose();
                  else if (shouldShowSlimForm) dismissSlimForm('manual');
                }}
                authProps={{
                  practiceName: practiceConfig?.name,
                  initialEmail: slimContactDraft?.email ?? '',
                  initialName: slimContactDraft?.name ?? '',
                  callbackURL: authPromptCallbackUrl,
                  onSuccess: handleAuthSuccess
                }}
                paymentProps={{
                  request: paymentRequest,
                  onSuccess: handlePaymentSuccess
                }}
                slimFormProps={{
                  onContinue: onSlimFormContinue as NonNullable<typeof onSlimFormContinue>,
                  initialValues: slimContactDraft
                }}
              />

              {(!isPaymentModalOpen && !showAuthPrompt && !shouldShowSlimForm) && (
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
                  replyTo={replyTarget}
                  onCancelReply={handleCancelReply}
                  mentionCandidates={mentionCandidates}
                />
              )}
            </div>
          </div>
        ) : null}
      </main>



    </div>
  );
};

export default ChatContainer; 
