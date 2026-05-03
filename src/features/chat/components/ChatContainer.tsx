import { FunctionComponent } from 'preact';
import type { ComponentChildren } from 'preact';
import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import VirtualMessageList from './VirtualMessageList';
import MessageComposer from './MessageComposer';
import { ChatMessageUI } from '../../../../worker/types';
import { FileAttachment } from '../../../../worker/types';
import { createKeyPressHandler } from '@/shared/utils/keyboard';
import type { UploadingFile } from '@/shared/types/upload';
import type { ConversationMode } from '@/shared/types/conversation';
import type { ReplyTarget } from '@/features/chat/types';
import type { LayoutMode } from '@/app/MainApp';
import { isIntakeSubmittable } from '@/shared/utils/consultationState';
import { getChatPatterns } from '../config/chatPatterns';
import type { OnboardingActions } from './VirtualMessageList';
import { ChatActionCard } from './ChatActionCard';
import { useIntakeContext } from '@/shared/contexts/IntakeContext';

import { features } from '@/config/features';

export interface ChatContainerProps {
    // Disclaimer gating (like slim form)
    disclaimerProps?: {
      text: string;
      onAccept: () => void | Promise<void>;
      onClose: () => void;
    };
  messages: ChatMessageUI[];
  conversationTitle?: string | null;
  conversationContactName?: string | null;
  viewerContext?: 'practice' | 'client' | 'public';
  onSendMessage: (
    message: string,
    attachments: FileAttachment[],
    replyToMessageId?: string | null,
    options?: { additionalContext?: string; mentionedUserIds?: string[]; suppressAi?: boolean }
  ) => void;
  isReady: boolean;
  conversationMode?: ConversationMode | null;
  onSelectMode?: (mode: ConversationMode, source?: 'intro_gate' | 'composer_footer' | 'home_cta' | 'chat_intro' | 'slim_form_dismiss' | 'chat_selector') => void;
  onToggleReaction?: (messageId: string, emoji: string) => void;
  onRequestReactions?: (messageId: string) => void;
  isPublicWorkspace?: boolean;
  practiceConfig?: {
    name: string;
    profileImage: string | null;
    practiceId: string;
    slug?: string | null;
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
  handleFileSelect: (files: File[]) => Promise<unknown>;
  handleCameraCapture: (file: File) => Promise<void>;
  cancelUpload: (fileId: string) => void;
  handleMediaCapture: (blob: Blob, type: 'audio' | 'video') => void;
  isRecording: boolean;
  setIsRecording: (v: boolean) => void;
  isReadyToUpload?: boolean;
  isAnonymousUser?: boolean;
  canChat?: boolean;
  hasMoreMessages?: boolean;
  isLoadingMoreMessages?: boolean;
  onLoadMoreMessages?: () => void | Promise<void>;
  messagesReady?: boolean;
  conversationId?: string | null;


  // Input control prop
  clearInput?: number;

  // Auth prompt overrides
  showAuthPrompt?: boolean;
  authPromptCallbackUrl?: string;
  onAuthPromptRequest?: () => void;
  onAuthPromptClose?: () => void;
  onAuthPromptSuccess?: () => void;
  hideComposer?: boolean;
  hideMessageActions?: boolean;
  onboardingActions?: OnboardingActions;
  mentionCandidates?: Array<{
    userId: string;
    name: string;
    email?: string;
  }>;
}

const ChatContainer: FunctionComponent<ChatContainerProps> = ({
  disclaimerProps,
  messages,
  conversationTitle,
  conversationContactName,
  viewerContext,
  onSendMessage,
  isReady,
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
  clearInput,
  canChat = true,
  onSelectMode,
  hasMoreMessages,
  isLoadingMoreMessages,
  onLoadMoreMessages,
  messagesReady = true,

  showAuthPrompt = false,
  authPromptCallbackUrl,
  onAuthPromptRequest,
  conversationId,
  onAuthPromptClose,
  onAuthPromptSuccess,
  hideComposer = false,
  hideMessageActions = false,
  onboardingActions,
  mentionCandidates = [],
}) => {
  const intakeContext = useIntakeContext();
  const [inputValue, setInputValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const composerDockRef = useRef<HTMLDivElement>(null);
  const [composerInsetPx, setComposerInsetPx] = useState(104);
  const isChatInputLocked = (!isReady && !!conversationId) || (isPublicWorkspace && intakeContext.intakeStatus?.step === 'contact_form_slim');

  // Track whether the chat connection has ever been ready *for the current
  // conversation*. If it was, and isReady flips false again, that's a
  // reconnect-in-progress (vs first-load "still connecting"). Scoping this
  // to conversationId prevents the banner from flashing when the user
  // switches conversations and the new one is still on its first connect.
  const wasEverReadyRef = useRef(false);
  const lastConversationIdRef = useRef<string | null | undefined>(conversationId);
  const [isReconnecting, setIsReconnecting] = useState(false);
  useEffect(() => {
    if (lastConversationIdRef.current !== conversationId) {
      lastConversationIdRef.current = conversationId;
      wasEverReadyRef.current = false;
      setIsReconnecting(false);
      if (!isReady) return;
    }
    if (isReady) {
      wasEverReadyRef.current = true;
      setIsReconnecting(false);
    } else if (wasEverReadyRef.current && Boolean(conversationId)) {
      setIsReconnecting(true);
    }
  }, [isReady, conversationId]);
  const hiddenSystemMessageKeys = new Set(['ask_question_help', 'disclaimer_accepted']);
  const baseMessages = isPublicWorkspace
    ? messages.filter((message) => !hiddenSystemMessageKeys.has(String(message.metadata?.systemMessageKey ?? '')))
    : messages;
  const filteredMessages = baseMessages;
  const hasAcceptedIntakeJoinMessage = isPublicWorkspace && messages.some((message) =>
    message.metadata?.systemMessageKey === 'lead_accepted' ||
    message.metadata?.triageStatus === 'accepted' ||
    message.metadata?.triage_status === 'accepted'
  );
  const composerIntakeStatus = hasAcceptedIntakeJoinMessage && intakeContext.intakeStatus?.step === 'pending_review'
    ? { ...intakeContext.intakeStatus, step: 'accepted' as const }
    : intakeContext.intakeStatus;
  
  const shouldShowSlimForm = isPublicWorkspace &&
    (intakeContext.intakeStatus?.step === 'contact_form_slim' || (!conversationId && conversationMode === 'REQUEST_CONSULTATION')) &&
    !intakeContext.intakeStatus?.intakeUuid &&
    typeof intakeContext.onSlimFormContinue === 'function';

  // Show disclaimer if disclaimerProps is present
  const shouldShowDisclaimer = Boolean(disclaimerProps);
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
      if (hideComposer) {
        setComposerInsetPx(24);
        return;
      }
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
  }, [hideComposer]);

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

    const canHandleCta = isPublicWorkspace && isIntakeSubmittable(intakeContext.intakeConversationState, {
      paymentRequired: intakeContext.intakeStatus?.paymentRequired ?? null,
      paymentReceived: intakeContext.intakeStatus?.paymentReceived ?? null,
    }) && intakeContext.intakeConversationState?.ctaResponse !== 'ready';
    const normalized = message.trim();
    const { affirmative, negative } = getChatPatterns('en'); // TODO: Pass actual language when available
    const isPatternAffirmative = affirmative.test(normalized);
    const isNegative = negative.test(normalized);

    if (canHandleCta && intakeContext.onIntakeCtaResponse && isPatternAffirmative) {
      (async () => {
        try {
          await handleConfirmSubmitAction();
          setInputValue('');
          setReplyTarget(null);
        } catch (error) {
          console.error('[ChatContainer] Intake finalization failed:', error);
          // Retain state so user can retry or see what they sent
        }
      })();
      return;
    }

    if (canHandleCta && intakeContext.onIntakeCtaResponse && isNegative) {
      void intakeContext.onIntakeCtaResponse('not_yet');
      setInputValue('');
      setReplyTarget(null);
      return;
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

  const submitActionInFlightRef = useRef(false);

  const emitAuthPromptRequest = useCallback(() => {
    onAuthPromptRequest?.();
  }, [onAuthPromptRequest]);

  const handleConfirmSubmitAction = async () => {
    if (submitActionInFlightRef.current) {
      return;
    }
    submitActionInFlightRef.current = true;
    if (intakeContext.onSubmitNow) {
      try {
        await intakeContext.onSubmitNow();
      } finally {
        submitActionInFlightRef.current = false;
      }
      return;
    }
    try {
      if (intakeContext.onIntakeCtaResponse) {
        await Promise.resolve(intakeContext.onIntakeCtaResponse('ready'));
      }
    } finally {
      submitActionInFlightRef.current = false;
    }
  };

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

  const handleModeSelection = (mode: ConversationMode) => {
    if (!onSelectMode) return;
    onSelectMode(mode);
  };

  const handleAskQuestion = () => {
    handleModeSelection('ASK_QUESTION');
  };

  const handleRequestConsultation = () => {
    handleModeSelection('REQUEST_CONSULTATION');
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
      : `flex flex-col flex-1 min-h-0 w-full overflow-hidden relative ${isPublicWorkspace ? 'bg-transparent py-4' : 'bg-transparent'}`;

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
    if (!intakeContext.onSlimFormDismiss || isDismissingSlimDrawer) return;
    setIsDismissingSlimDrawer(true);
    try {
      await intakeContext.onSlimFormDismiss();
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
                conversationContactName={conversationContactName}
                viewerContext={viewerContext}
                practiceConfig={practiceConfig}
                isPublicWorkspace={isPublicWorkspace}
                onOpenSidebar={onOpenSidebar}
                practiceId={practiceId}
                onReply={handleReply}
                onToggleReaction={onToggleReaction && features.enableMessageReactions ? onToggleReaction : undefined}
                onRequestReactions={onRequestReactions}
                onAuthPromptRequest={emitAuthPromptRequest}
                onQuickReply={handleQuickReply}
                modeSelectorActions={onSelectMode ? {
                  onAskQuestion: handleAskQuestion,
                  onRequestConsultation: handleRequestConsultation
                } : undefined}

                hasMoreMessages={hasMoreMessages}
                isLoadingMoreMessages={isLoadingMoreMessages}
                onLoadMoreMessages={onLoadMoreMessages}
                showSkeleton={!messagesReady}
                compactLayout={false}
                onboardingActions={onboardingActions}
                bottomInsetPx={composerInsetPx}
                hideMessageActions={hideMessageActions}
              />
            </div>

          </div>

          <div ref={composerDockRef} className="sticky bottom-0 z-[1000] w-full">
            {isReconnecting ? (
              <div
                className="mx-auto flex w-full max-w-3xl items-center gap-2 px-4 py-2 text-xs text-input-placeholder"
                role="status"
                aria-live="polite"
              >
                <span
                  aria-hidden="true"
                  className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-500"
                />
                Reconnecting to chat…
              </div>
            ) : null}
            <ChatActionCard
              isOpen={showAuthPrompt || shouldShowSlimForm || shouldShowDisclaimer}
              type={showAuthPrompt ? 'auth' : shouldShowSlimForm ? 'slim-form' : shouldShowDisclaimer ? 'disclaimer' : null}
              onClose={() => {
                if (showAuthPrompt) onAuthPromptClose?.();
                else if (shouldShowSlimForm) dismissSlimForm('manual');
                else if (shouldShowDisclaimer && disclaimerProps) disclaimerProps.onClose();
              }}
              authProps={{
                practiceName: practiceConfig?.name,
                initialEmail: intakeContext.slimContactDraft?.email ?? '',
                initialName: intakeContext.slimContactDraft?.name ?? '',
                callbackURL: authPromptCallbackUrl,
                onSuccess: onAuthPromptSuccess
              }}
              slimFormProps={{
                onContinue: intakeContext.onSlimFormContinue as NonNullable<typeof intakeContext.onSlimFormContinue>,
                initialValues: intakeContext.slimContactDraft
              }}
              disclaimerProps={shouldShowDisclaimer && disclaimerProps ? disclaimerProps : undefined}
            />

            {(!showAuthPrompt && !shouldShowSlimForm && !shouldShowDisclaimer && !hideComposer) && (
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
                  isSessionReady={isReady || (!conversationId && !!canChat)}
                  isSocketReady={isReady || (!conversationId && !!canChat)}
                  intakeStatus={isPublicWorkspace ? composerIntakeStatus : undefined}
                  disabled={isChatInputLocked}
                  replyTo={replyTarget}
                  onCancelReply={handleCancelReply}
                  mentionCandidates={mentionCandidates}
                  hideAttachmentControls={!features.enableFileAttachments}
                  isPublicWorkspace={isPublicWorkspace}
                />
            )}
          </div>
        </div>
      </main>



    </div>
  );
};

export default ChatContainer; 
