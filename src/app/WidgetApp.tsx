import { useState, useCallback, useRef, useEffect, useMemo } from 'preact/hooks';
import ChatContainer from '@/features/chat/components/ChatContainer';
import DragDropOverlay from '@/features/media/components/DragDropOverlay';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import type { UIPracticeConfig } from '@/shared/hooks/usePracticeConfig';
import { useMessageHandling } from '@/shared/hooks/useMessageHandling';
import { useFileUploadWithContext } from '@/shared/hooks/useFileUpload';
import { useConversationSetup } from '@/shared/hooks/useConversationSetup';
import { setupGlobalKeyboardListeners } from '@/shared/utils/keyboard';
import type { FileAttachment } from '../../worker/types';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useTranslation } from '@/shared/i18n/hooks';
import type { ConversationMetadata, ConversationMode } from '@/shared/types/conversation';
import WorkspaceConversationHeader from '@/features/chat/components/WorkspaceConversationHeader';
import BriefStrengthIndicator from '@/features/chat/components/BriefStrengthIndicator';
import { initializeAccentColor } from '@/shared/utils/accentColors';
import { useConversationSystemMessages } from '@/features/chat/hooks/useConversationSystemMessages';

export function WidgetApp({
  practiceId,
  practiceConfig,
  routeConversationId,
  bootstrapSession,
}: {
  practiceId: string;
  practiceConfig: UIPracticeConfig;
  routeConversationId?: string;
  bootstrapSession?: { user?: { id?: string; isAnonymous?: boolean; is_anonymous?: boolean } } | null;
}) {
  const [clearInputTrigger, setClearInputTrigger] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [conversationMode, setConversationMode] = useState<ConversationMode | null>(null);
  const [retryTrigger, setRetryTrigger] = useState(0);
  const autoConversationAttemptedRef = useRef(false);

  const { showError } = useToastContext();
  const showErrorRef = useRef(showError);
  useEffect(() => { showErrorRef.current = showError; }, [showError]);

  const { session, isPending: sessionIsPending, isAnonymous } = useSessionContext();
  const effectiveSession = useMemo(() => {
    if (session?.user?.id) return session;
    const fallbackUser = bootstrapSession?.user;
    if (!fallbackUser?.id) return session;
    return {
      user: {
        ...fallbackUser,
        id: fallbackUser.id,
        isAnonymous: fallbackUser.isAnonymous ?? fallbackUser.is_anonymous ?? true,
      },
      session: null,
    } as typeof session;
  }, [bootstrapSession?.user, session]);
  const effectiveIsAnonymous =
    session?.user?.isAnonymous
    ?? bootstrapSession?.user?.isAnonymous
    ?? bootstrapSession?.user?.is_anonymous
    ?? isAnonymous;

  useEffect(() => {
    initializeAccentColor(practiceConfig.accentColor || 'gold');
  }, [practiceConfig.accentColor]);

  // Handle widget-specific mode setup
  const {
    conversationId: setupConversationId,
    createConversation,
    applyConversationMode,
  } = useConversationSetup({
    practiceId,
    workspace: 'public',
    routeConversationId,
    session: effectiveSession,
    sessionIsPending,
    isPracticeWorkspace: false,
    isPublicWorkspace: true,
    onModeChange: setConversationMode,
    onError: (msg) => showErrorRef.current?.(msg),
  });

  const activeConversationId = routeConversationId ?? setupConversationId;
  const autoConversationRetryCountRef = useRef(0);
  const autoConversationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const MAX_AUTO_CONVERSATION_RETRIES = 3;

  useEffect(() => {
    // Cleanup function that always runs on effect cleanup or re-run
    const cleanup = () => {
      if (autoConversationTimeoutRef.current) {
        clearTimeout(autoConversationTimeoutRef.current);
        autoConversationTimeoutRef.current = null;
      }
    };

    // Guard checks - return cleanup even when early exiting
    if (routeConversationId || setupConversationId) return cleanup;
    if (sessionIsPending || !effectiveSession?.user || !practiceId) return cleanup;
    if (autoConversationAttemptedRef.current) return cleanup;
    if (autoConversationRetryCountRef.current >= MAX_AUTO_CONVERSATION_RETRIES) return cleanup;

    autoConversationAttemptedRef.current = true;
    void createConversation().catch((error) => {
      const retryCount = autoConversationRetryCountRef.current + 1;
      autoConversationRetryCountRef.current = retryCount;
      const message = error instanceof Error ? error.message : 'Failed to start conversation';
      showErrorRef.current?.(message);

      if (retryCount < MAX_AUTO_CONVERSATION_RETRIES) {
        // Exponential backoff: 1s, 2s, 4s
        const delayMs = Math.pow(2, retryCount - 1) * 1000;
        autoConversationTimeoutRef.current = setTimeout(() => {
          autoConversationAttemptedRef.current = false;
          setRetryTrigger(prev => prev + 1);
        }, delayMs);
      }
    });

    return cleanup;
  }, [createConversation, effectiveSession?.user, practiceId, routeConversationId, sessionIsPending, setupConversationId, retryTrigger]);

  const handleMessageError = useCallback((error: string | Error) => {
    const message = typeof error === 'string' ? error : error.message;
    if (message.toLowerCase().includes('chat connection closed')) return;
    showErrorRef.current?.(message || 'We hit a snag sending that message.');
  }, []);

  const handleConversationMetadataUpdated = useCallback((metadata: ConversationMetadata | null) => {
    if (metadata?.mode) setConversationMode(metadata.mode);
  }, []);

  const messageHandling = useMessageHandling({
    practiceId,
    conversationId: activeConversationId ?? undefined,
    linkAnonymousConversationOnLoad: true,
    mode: conversationMode,
    onConversationMetadataUpdated: handleConversationMetadataUpdated,
    onError: handleMessageError,
  });

  const {
    messages, conversationMetadata, sendMessage, addMessage, clearMessages,
    requestMessageReactions, toggleMessageReaction,
    intakeStatus, intakeConversationState, handleIntakeCtaResponse,
    slimContactDraft, handleSlimFormContinue, handleBuildBrief, handleSubmitNow,
    startConsultFlow, updateConversationMetadata, isConsultFlowActive,
    ingestServerMessages, messagesReady, hasMoreMessages, isLoadingMoreMessages,
    loadMoreMessages, isSocketReady,
  } = messageHandling;

  useEffect(() => { clearMessages(); }, [practiceId, clearMessages]);

  const { t } = useTranslation('common');

  // Intake Auth (simplistic for widget, just redirecting or showing prompt if needed)
  const intakeUuid = intakeStatus?.intakeUuid ?? null;
  const intakeAuthTarget = useMemo(() => {
    if (!intakeUuid) return null;
    if (intakeStatus?.paymentRequired && !intakeStatus?.paymentReceived) return null;
    return intakeUuid;
  }, [intakeUuid, intakeStatus?.paymentReceived, intakeStatus?.paymentRequired]);

  const shouldShowAuthPrompt = Boolean(effectiveIsAnonymous && intakeAuthTarget);

  const awaitingInvitePath = useMemo(() => {
    if (!intakeUuid) return null;
    const slug = practiceConfig.slug ?? '';
    const params = new URLSearchParams();
    params.set('intakeUuid', intakeUuid);
    if (slug) params.set('practiceSlug', slug);
    if (practiceConfig.name) params.set('practiceName', practiceConfig.name);
    return `/awaiting-invite?${params.toString()}`;
  }, [intakeUuid, practiceConfig.slug, practiceConfig.name]);

  useEffect(() => {
    if (shouldShowAuthPrompt || window.location.pathname.startsWith('/auth')) return;
    if (!effectiveIsAnonymous || !intakeUuid || !awaitingInvitePath) return;

    try {
      const currentPendingPath = window.sessionStorage.getItem('intakeAwaitingInvitePath');
      if (currentPendingPath !== awaitingInvitePath) {
        window.sessionStorage.setItem('intakeAwaitingInvitePath', awaitingInvitePath);
      }
    } catch (error) {
       console.warn('[Widget] Failed to persist intake returning path', error);
    }
  }, [effectiveIsAnonymous, intakeUuid, awaitingInvitePath, shouldShowAuthPrompt]);

  // System Messages
  useConversationSystemMessages({
    conversationId: activeConversationId ?? undefined,
    practiceId,
    practiceConfig: { ...practiceConfig, name: practiceConfig.name ?? '', profileImage: practiceConfig.profileImage ?? '' },
    messagesReady,
    messages,
    conversationMode,
    isConsultFlowActive,
    shouldRequireModeSelection: true,
    ingestServerMessages,
  });

  const canChat = activeConversationId != null;
  const isComposerDisabled = isRecording;

  const handleModeSelection = useCallback(async (mode: ConversationMode, source?: 'intro_gate' | 'composer_footer') => {
    if (!practiceId || !activeConversationId) return;
    await applyConversationMode(mode, activeConversationId, source ?? 'intro_gate', startConsultFlow);
  }, [practiceId, activeConversationId, applyConversationMode, startConsultFlow]);

  // File Uploads
  const {
    previewFiles,
    uploadingFiles,
    isReadyToUpload,
    handleFileSelect,
    removePreviewFile,
    clearPreviewFiles,
    isDragging,
    cancelUpload,
    handleMediaCapture,
  } = useFileUploadWithContext({ conversationId: activeConversationId ?? undefined });

  const handleCameraCapture = useCallback(async (file: File) => {
    await handleFileSelect([file]);
  }, [handleFileSelect]);

  useEffect(() => {
    return setupGlobalKeyboardListeners({
      onFocusInput: () => {
        document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Message input"]')?.focus();
      }
    });
  }, []);

  const intakeAuthTitle = t('intake.authTitle');
  const intakeAuthDescription = practiceConfig.name
    ? t('intake.authDescription', { practice: practiceConfig.name })
    : t('intake.authDescriptionFallback');

  return (
    <>
      <DragDropOverlay isVisible={isDragging} />
      <div className="absolute inset-x-0 inset-y-0 h-[100dvh] w-full overflow-hidden flex flex-col supports-[height:100cqh]:h-[100cqh] supports-[height:100svh]:h-[100svh] bg-white sm:bg-transparent justify-end sm:p-[10px] md:p-4 perspective-[1000px] bg-glass">
        <ChatContainer
          messages={messages}
          onSendMessage={sendMessage}
          conversationMode={conversationMode}
          onSelectMode={handleModeSelection}
          onToggleReaction={toggleMessageReaction}
          onRequestReactions={requestMessageReactions}
          composerDisabled={isComposerDisabled}
          isPublicWorkspace={true}
          leadReviewActions={null}
          messagesReady={messagesReady}
          headerContent={<WorkspaceConversationHeader
              practiceName={practiceConfig.name}
              practiceLogo={practiceConfig.profileImage}
            />}
          heightClassName="h-full"
          useFrame={false}
          layoutMode="widget"
          practiceConfig={{...practiceConfig, name: practiceConfig.name ?? '', profileImage: practiceConfig.profileImage ?? '', practiceId}}
          onOpenSidebar={undefined}
          practiceId={practiceId}
          previewFiles={previewFiles}
          uploadingFiles={uploadingFiles}
          removePreviewFile={removePreviewFile}
          clearPreviewFiles={clearPreviewFiles}
          handleCameraCapture={handleCameraCapture}
          handleFileSelect={async (files) => { await handleFileSelect(files); }}
          handleMediaCapture={handleMediaCapture}
          cancelUpload={cancelUpload}
          isRecording={isRecording}
          setIsRecording={setIsRecording}
          clearInput={clearInputTrigger}
          isReadyToUpload={isReadyToUpload}
          isSessionReady={effectiveSession !== undefined && !sessionIsPending}
          isSocketReady={isSocketReady}
          intakeStatus={intakeStatus}
          intakeConversationState={intakeConversationState}
          onIntakeCtaResponse={handleIntakeCtaResponse}
          slimContactDraft={slimContactDraft}
          onSlimFormContinue={handleSlimFormContinue}
          onBuildBrief={handleBuildBrief}
          onSubmitNow={handleSubmitNow}
          isAnonymousUser={effectiveIsAnonymous}
          canChat={canChat}
          hasMoreMessages={hasMoreMessages}
          isLoadingMoreMessages={isLoadingMoreMessages}
          onLoadMoreMessages={loadMoreMessages}
          showAuthPrompt={shouldShowAuthPrompt}
          authPromptTitle={intakeAuthTitle}
          authPromptDescription={intakeAuthDescription}
        />
      </div>
    </>
  );
}
