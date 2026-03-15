import { useState, useCallback, useRef, useEffect, useMemo } from 'preact/hooks';
import ChatContainer from '@/features/chat/components/ChatContainer';
import DragDropOverlay from '@/features/media/components/DragDropOverlay';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import type { UIPracticeConfig } from '@/shared/hooks/usePracticeConfig';
import { useMessageHandling } from '@/shared/hooks/useMessageHandling';
import { useFileUploadWithContext } from '@/shared/hooks/useFileUpload';
import { useConversationSetup } from '@/shared/hooks/useConversationSetup';
import { setupGlobalKeyboardListeners } from '@/shared/utils/keyboard';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useTranslation } from '@/shared/i18n/hooks';
import type { ConversationMetadata, ConversationMode } from '@/shared/types/conversation';
import WorkspaceConversationHeader from '@/features/chat/components/WorkspaceConversationHeader';
import { initializeAccentColor } from '@/shared/utils/accentColors';
import { useConversationSystemMessages } from '@/features/chat/hooks/useConversationSystemMessages';
import { consumePostAuthConversationContext } from '@/shared/utils/anonymousIdentity';

const WIDGET_ATTRIBUTION_STORAGE_KEY = 'blawby:widget:attribution';

const parseTrustedParentOriginFromQuery = (): string | null => {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('trusted_parent_origin');
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return parsed.origin;
  } catch {
    return null;
  }
};

const resolveAllowedParentOrigins = (): string[] => {
  if (typeof window === 'undefined') return [];
  const origins = new Set<string>();
  const trustedParentOrigin = parseTrustedParentOriginFromQuery();
  if (trustedParentOrigin) origins.add(trustedParentOrigin);

  const referrer = typeof document !== 'undefined' ? document.referrer : '';
  if (referrer) {
    try {
      origins.add(new URL(referrer).origin);
    } catch {
      // ignore malformed referrer
    }
  }

  const ancestorOrigins = window.location.ancestorOrigins;
  if (ancestorOrigins && ancestorOrigins.length > 0) {
    for (let i = 0; i < ancestorOrigins.length; i += 1) {
      const origin = ancestorOrigins.item(i);
      if (origin) origins.add(origin);
    }
  }

  return Array.from(origins);
};

const postToParentFrame = (payload: Record<string, unknown>): void => {
  if (typeof window === 'undefined') return;
  if (window.parent === window) return;
  const allowedOrigins = resolveAllowedParentOrigins();
  if (allowedOrigins.length === 0) {
    console.warn('[Widget] Unable to postMessage to parent: no trusted origin');
    return;
  }
  for (const origin of allowedOrigins) {
    window.parent.postMessage(payload, origin);
  }
};

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
  const [isRecording, setIsRecording] = useState(false);
  const [conversationMode, setConversationMode] = useState<ConversationMode | null>(null);
  const [retryTrigger, setRetryTrigger] = useState(0);
  const autoConversationAttemptedRef = useRef(false);
  const widgetVisibleRef = useRef(false);
  const assistantMessageIdsRef = useRef(new Set<string>());
  const initializedAssistantSnapshotRef = useRef(false);

  const { showError } = useToastContext();
  const showErrorRef = useRef(showError);
  showErrorRef.current = showError;

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
    setConversationId,
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
    if (sessionIsPending) return;
    if (effectiveIsAnonymous) return;
    const pending = consumePostAuthConversationContext();
    if (!pending) return;
    if (pending.practiceId && pending.practiceId !== practiceId) return;
    if (pending.conversationId) {
      setConversationId(pending.conversationId);
    }
  }, [effectiveIsAnonymous, practiceId, sessionIsPending, setConversationId]);

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

  const { t } = useTranslation('common');

  const handleMessageError = useCallback((error: string | Error) => {
    const message = typeof error === 'string' ? error : error.message;
    if (message.toLowerCase().includes('chat connection closed')) return;
    showErrorRef.current?.(message || t('weHitASnag.sendingMessage'));
  }, [t]);

  const handleConversationMetadataUpdated = useCallback((metadata: ConversationMetadata | null) => {
    if (metadata?.mode) setConversationMode(metadata.mode);
  }, []);

  const messageHandling = useMessageHandling({
    practiceId,
    practiceSlug: practiceConfig.slug ?? undefined,
    conversationId: activeConversationId ?? undefined,
    linkAnonymousConversationOnLoad: true,
    mode: conversationMode,
    onConversationMetadataUpdated: handleConversationMetadataUpdated,
    onError: handleMessageError,
  });

  const {
    messages, conversationMetadata: _conversationMetadata, sendMessage, addMessage: _addMessage, clearMessages,
    requestMessageReactions, toggleMessageReaction,
    intakeStatus, intakeConversationState, handleIntakeCtaResponse,
    slimContactDraft, handleSlimFormContinue, handleBuildBrief, handleSubmitNow,
    startConsultFlow, updateConversationMetadata: _updateConversationMetadata, isConsultFlowActive,
    ingestServerMessages, messagesReady, hasMoreMessages, isLoadingMoreMessages,
    loadMoreMessages, isSocketReady,
  } = messageHandling;

  useEffect(() => { clearMessages(); }, [practiceId, clearMessages]);



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
       throw error;
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

  const requestWidgetClose = useCallback(() => {
    postToParentFrame({ type: 'blawby:close-request' });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.parent === window) return;

    postToParentFrame({ type: 'blawby:ready' });

    const handleParentMessage = (event: MessageEvent) => {
      const allowedOrigins = resolveAllowedParentOrigins();
      if (allowedOrigins.length > 0 && !allowedOrigins.includes(event.origin)) return;

      let data: unknown = event.data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch {
          return;
        }
      }
      if (!data || typeof data !== 'object') return;
      const type = (data as { type?: unknown }).type;
      if (typeof type !== 'string') return;

      if (type === 'blawby:open') {
        widgetVisibleRef.current = true;
      } else if (type === 'blawby:close') {
        widgetVisibleRef.current = false;
      } else if (type === 'blawby:attribution') {
        const attribution = (data as { attribution?: unknown }).attribution;
        if (!attribution || typeof attribution !== 'object' || Array.isArray(attribution)) return;
        try {
          window.sessionStorage.setItem(WIDGET_ATTRIBUTION_STORAGE_KEY, JSON.stringify(attribution));
        } catch {
          // ignore storage failures
        }
      }
    };

    window.addEventListener('message', handleParentMessage);
    return () => {
      window.removeEventListener('message', handleParentMessage);
    };
  }, []);

  useEffect(() => {
    if (!messagesReady) return;
    let hasNewAssistantMessage = false;
    for (const message of messages) {
      if (message.role !== 'assistant') continue;
      if (assistantMessageIdsRef.current.has(message.id)) continue;
      assistantMessageIdsRef.current.add(message.id);
      if (initializedAssistantSnapshotRef.current) {
        hasNewAssistantMessage = true;
      }
    }
    if (!initializedAssistantSnapshotRef.current) {
      initializedAssistantSnapshotRef.current = true;
      return;
    }
    if (hasNewAssistantMessage && !widgetVisibleRef.current) {
      postToParentFrame({ type: 'blawby:new-message' });
    }
  }, [messages, messagesReady]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      requestWidgetClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [requestWidgetClose]);

  const closeButton = (
    <button
      type="button"
      aria-label="Close chat"
      onClick={requestWidgetClose}
      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[rgb(var(--accent-foreground))] opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-white/80 transition-opacity"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  );

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
          messagesReady={messagesReady}
          headerContent={<WorkspaceConversationHeader
              practiceName={practiceConfig.name}
              rightSlot={window.parent !== window ? closeButton : undefined}
            />}
          heightClassName="h-full"
          useFrame={false}
          layoutMode="widget"
          practiceConfig={{...practiceConfig, name: practiceConfig.name ?? '', profileImage: practiceConfig.profileImage ?? '', practiceId}}
          onOpenSidebar={undefined}
          practiceId={practiceId}
          conversationId={activeConversationId ?? null}
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
          clearInput={0}
          isReadyToUpload={isReadyToUpload}
          isSessionReady={effectiveSession !== undefined && !sessionIsPending}
          isSocketReady={isSocketReady}
          intakeStatus={intakeStatus}
          intakeConversationState={intakeConversationState}
          onIntakeCtaResponse={handleIntakeCtaResponse}
          slimContactDraft={slimContactDraft}
          onSlimFormContinue={handleSlimFormContinue}
          onSlimFormDismiss={async () => {
            setConversationMode(null);
          }}
          onBuildBrief={handleBuildBrief}
          onSubmitNow={handleSubmitNow}
          isAnonymousUser={effectiveIsAnonymous}
          canChat={canChat}
          hasMoreMessages={hasMoreMessages}
          isLoadingMoreMessages={isLoadingMoreMessages}
          onLoadMoreMessages={loadMoreMessages}
          showAuthPrompt={shouldShowAuthPrompt}
        />
      </div>
    </>
  );
}
