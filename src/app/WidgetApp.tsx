import { FunctionComponent } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useTranslation } from '@/shared/i18n/hooks';
import { Button } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { XMarkIcon, HomeIcon, ChatBubbleLeftRightIcon, InformationCircleIcon } from '@heroicons/react/24/outline';
import ChatContainer from '@/features/chat/components/ChatContainer';
import InspectorPanel from '@/shared/ui/inspector/InspectorPanel';
import WorkspaceHomeView from '@/features/chat/views/WorkspaceHomeView';
import { useToastContext } from '@/shared/contexts/ToastContext';
import WidgetConversationListView from '@/features/chat/views/WidgetConversationListView';
import { useConversations } from '@/shared/hooks/useConversations';
import { useFileUploadWithContext } from '@/shared/hooks/useFileUpload';
import { useMessageHandling } from '@/shared/hooks/useMessageHandling';
import { useConversationSystemMessages } from '@/shared/hooks/useConversationSystemMessages';
import { fetchLatestConversationMessage } from '@/shared/lib/conversationApi';
import { postToParentFrame, resolveAllowedParentOrigins } from '@/shared/utils/widgetEvents';
import { setupGlobalKeyboardListeners } from '@/shared/utils/keyboard';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
import { resolveConversationDisplayTitle } from '@/shared/utils/conversationDisplay';
import { usePracticeDetails } from '@/shared/hooks/usePracticeDetails';
import { practiceDetailsStore } from '@/shared/stores/practiceDetailsStore';
import { useStore } from '@nanostores/preact';
import { NavRail, NavRailItem } from '@/shared/ui/nav/NavRail';
import type { ConversationMetadata, ConversationMode } from '@/shared/types/conversation';
import type { UIPracticeConfig } from '@/shared/hooks/usePracticeConfig';
import DragDropOverlay from '@/shared/ui/DragDropOverlay';
import { shouldShowWorkspaceDetailBack } from '@/shared/utils/workspaceDetailNavigation';
import { resolveStrengthStyle, resolveStrengthTier } from '@/shared/utils/intakeStrength';
import { DetailHeader } from '@/shared/ui/layout/DetailHeader';
import { resolveConsultationState } from '@/shared/utils/consultationState';
import { MobileInspectorOverlay } from '@/shared/ui/inspector/MobileInspectorOverlay';

interface WidgetAppProps {
  practiceId: string;
  practiceConfig: UIPracticeConfig;
  routeConversationId?: string;
  bootstrapConversationId?: string | null;
  bootstrapSession?: {
    user?: {
      id: string;
      isAnonymous?: boolean;
      is_anonymous?: boolean;
    } | null;
  } | null;
}

export const WidgetApp: FunctionComponent<WidgetAppProps> = ({
  practiceId,
  practiceConfig,
  routeConversationId,
  bootstrapConversationId,
  bootstrapSession
}) => {
  const [view, setView] = useState<'home' | 'list' | 'chat'>(routeConversationId ? 'chat' : 'home');
  const [setupConversationId, setConversationId] = useState<string | null>(null);
  const [conversationMode, setConversationMode] = useState<ConversationMode | null>(null);
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [hasPersistError, setHasPersistError] = useState(false);
  const widgetVisibleRef = useRef(false);
  const showErrorRef = useRef<((msg: string) => void) | null>(null);
  const inFlightCreateRef = useRef<Promise<string> | null>(null);

  const { showError: showToastError } = useToastContext();

  useEffect(() => {
    showErrorRef.current = (msg: string) => showToastError('Error', msg);
  }, [showToastError]);

  const currentUserId = bootstrapSession?.user?.id ?? null;
  const isAnonymous = bootstrapSession?.user?.isAnonymous ?? bootstrapSession?.user?.is_anonymous ?? true;

  const isEmbedded = typeof window !== 'undefined' && window.parent !== window;

  const effectiveConversationId = routeConversationId ?? setupConversationId ?? bootstrapConversationId ?? null;

  const createConversation = useCallback(async (options?: { forceNew?: boolean }): Promise<string> => {
    if (inFlightCreateRef.current) return inFlightCreateRef.current;

    const createPromise = (async () => {
      try {
        const { createConversation: apiCreateConversation } = await import('@/shared/lib/conversationApi');
        const conversationId = await apiCreateConversation(practiceId, {
          userId: currentUserId ?? undefined,
          forceNew: options?.forceNew
        });
        setConversationId(conversationId);
        return conversationId;
      } finally {
        inFlightCreateRef.current = null;
      }
    })();

    inFlightCreateRef.current = createPromise;
    return createPromise;
  }, [practiceId, currentUserId, setConversationId]);

  const ensureConversation = useCallback(async (options?: { forceNew?: boolean }): Promise<string | null> => {
    const existingConversationId = effectiveConversationId;
    if (!options?.forceNew && existingConversationId) return existingConversationId;
    return createConversation(options);
  }, [createConversation, effectiveConversationId]);

  const applyConversationMode = useCallback(async (mode: ConversationMode, targetId: string, source: string, startIntake: boolean): Promise<boolean> => {
    try {
      const { updateConversationMetadata } = await import('@/shared/lib/conversationApi');
      await updateConversationMetadata(targetId, practiceId, {
        mode,
        metadata: {
          modeSource: source,
          startIntake: startIntake ? 'true' : 'false'
        }
      });
      setConversationMode(mode);
      return true;
    } catch (error) {
      console.error('[WidgetApp] Failed to apply conversation mode:', error);
      const message = error instanceof Error ? error.message : 'Failed to update conversation mode';
      showErrorRef.current?.(message);
      return false;
    }
  }, [practiceId, setConversationMode]);

  const { details: practiceDetails } = usePracticeDetails(practiceId, practiceConfig.slug);
  
  // Use reactive practice details from store to ensure re-renders on updates
  const practiceDetailsMap = useStore(practiceDetailsStore);
  const cachedPracticeDetails = practiceDetailsMap[practiceId] || practiceDetails;

  // Fetch conversations to show "Recent Message" on home page and for the list view
  const { conversations, isLoading: isConversationsLoading } = useConversations({
    practiceId,
    list: true,
    enabled: Boolean(practiceId),
    allowAnonymous: true
  });

  const latestConversation = useMemo(() => {
    if (!conversations) return null;
    // Pick the first conversation that actually has a message (not an empty prewarmed draft)
    return conversations.find(c => Boolean(c.last_message_at || c.last_message_content)) || null;
  }, [conversations]);

  const hasRealConversations = Boolean(latestConversation);
  const [conversationPreviews, setConversationPreviews] = useState<Record<string, {
    content: string;
    role: string;
    createdAt: string;
  }>>({});
  const fetchedPreviewIds = useRef<Set<string>>(new Set());
  const previewFailureCounts = useRef<Record<string, number>>({});
  const MAX_PREVIEW_ATTEMPTS = 2;

  const recentMessage = useMemo(() => {
    if (!latestConversation) return null;
    const conversationLabel = resolveConversationDisplayTitle(latestConversation, practiceConfig.name || 'Assistant');
    const latestPreview = conversationPreviews[latestConversation.id];
    return {
      preview: latestPreview?.content || latestConversation.last_message_content || latestConversation.user_info?.title || 'Click to continue your conversation',
      timestampLabel: latestPreview?.createdAt
        ? formatRelativeTime(latestPreview.createdAt)
        : latestConversation.last_message_at
          ? formatRelativeTime(latestConversation.last_message_at)
          : '',
      senderLabel: conversationLabel,
      avatarSrc: practiceConfig.profileImage,
      conversationId: latestConversation.id
    };
  }, [latestConversation, practiceConfig.name, practiceConfig.profileImage, conversationPreviews]);

  useEffect(() => {
    fetchedPreviewIds.current = new Set();
    previewFailureCounts.current = {};
    setConversationPreviews({});
  }, [practiceId]);

  useEffect(() => {
    if (!practiceId || conversations.length === 0 || view === 'chat') return;
    let isMounted = true;

    const loadPreviews = async () => {
      const updates: Record<string, { content: string; role: string; createdAt: string }> = {};
      const toFetch = conversations.slice(0, 10).filter(
        (conversation) => !fetchedPreviewIds.current.has(conversation.id)
      );

      await Promise.all(toFetch.map(async (conversation) => {
        const message = await fetchLatestConversationMessage(conversation.id, practiceId).catch(() => null);
        if (message?.content) {
          fetchedPreviewIds.current.add(conversation.id);
          updates[conversation.id] = {
            content: message.content,
            role: message.role,
            createdAt: message.created_at,
          };
          return;
        }

        const currentFailures = previewFailureCounts.current[conversation.id] ?? 0;
        const nextFailures = currentFailures + 1;
        previewFailureCounts.current[conversation.id] = nextFailures;
        if (nextFailures >= MAX_PREVIEW_ATTEMPTS) {
          fetchedPreviewIds.current.add(conversation.id);
        }
      }));

      if (isMounted && Object.keys(updates).length > 0) {
        setConversationPreviews((prev) => ({ ...prev, ...updates }));
      }
    };

    void loadPreviews();
    return () => {
      isMounted = false;
    };
  }, [conversations, practiceId, view]);

  // Previews for ConversationListView
  const previews = useMemo(() => {
    const map: Record<string, { content: string; role: string; createdAt: string }> = {};
    conversations.forEach(c => {
      const preview = conversationPreviews[c.id];
      map[c.id] = {
        content: preview?.content || c.last_message_content || c.user_info?.title || 'No messages yet',
        role: preview?.role || 'assistant',
        createdAt: preview?.createdAt || c.last_message_at || c.updated_at || ''
      };
    });
    return map;
  }, [conversations, conversationPreviews]);

  const { t } = useTranslation('common');

  const handleMessageError = useCallback((error: string | Error) => {
    const message = typeof error === 'string' ? error : error.message;
    if (message.toLowerCase().includes('chat connection closed')) return;
    showErrorRef.current?.(message || t('weHitASnag.sendingMessage'));
  }, [t]);

  const handleConversationMetadataUpdated = useCallback((metadata: ConversationMetadata | null) => {
    if (metadata?.mode) setConversationMode(metadata.mode);
  }, []);

  // Bridge for payment gate: useIntakeFlow calls onOpenPayment imperatively;
  // ChatContainer registers its handleOpenPayment here on mount.
  const openPaymentRef = useRef<((req: import('@/shared/utils/intakePayments').IntakePaymentRequest) => void) | null>(null);
  const handleOpenPaymentBridge = useCallback(
    (req: import('@/shared/utils/intakePayments').IntakePaymentRequest) => openPaymentRef.current?.(req),
    []
  );

  const messageHandling = useMessageHandling({
    practiceId,
    practiceSlug: practiceConfig.slug ?? undefined,
    conversationId: effectiveConversationId ?? undefined,
    ensureConversation: () => ensureConversation(),
    userId: currentUserId,
    linkAnonymousConversationOnLoad: true,
    mode: conversationMode,
    onConversationMetadataUpdated: handleConversationMetadataUpdated,
    onError: handleMessageError,
    onOpenPayment: handleOpenPaymentBridge,
  });

  const {
    messages, conversationMetadata, sendMessage, addMessage: _addMessage, clearMessages,
    requestMessageReactions, toggleMessageReaction,
    intakeStatus, intakeConversationState, handleIntakeCtaResponse,
    slimContactDraft, handleSlimFormContinue, handleBuildBrief, handleSubmitNow, handleFinalizeSubmit,
    startConsultFlow: _startConsultFlow, updateConversationMetadata: _updateConversationMetadata, isConsultFlowActive: _isConsultFlowActive,
    ingestServerMessages, messagesReady, hasMoreMessages, isLoadingMoreMessages,
    loadMoreMessages, isSocketReady, applyIntakeFields,
  } = messageHandling;

  useEffect(() => { clearMessages(); }, [practiceId, clearMessages]);

  const activeConversationId = effectiveConversationId;

  // Intake Auth (simplistic for widget, just redirecting or showing prompt if needed)
  const intakeUuid = intakeStatus?.intakeUuid ?? null;
  const intakeAuthTarget = useMemo(() => {
    if (!intakeUuid) return null;
    if (intakeStatus?.paymentRequired && !intakeStatus?.paymentReceived) return null;
    return intakeUuid;
  }, [intakeUuid, intakeStatus?.paymentReceived, intakeStatus?.paymentRequired]);

  const shouldShowAuthPrompt = Boolean(isAnonymous && intakeAuthTarget);

  const intakePostAuthPath = useMemo(() => {
    if (!intakeUuid) return null;
    if (!practiceConfig.slug || !activeConversationId) return null;
    return `/public/${encodeURIComponent(practiceConfig.slug)}/conversations/${encodeURIComponent(activeConversationId)}`;
  }, [activeConversationId, intakeUuid, practiceConfig.slug]);

  useEffect(() => {
    if (!isAnonymous || !intakeUuid || !intakePostAuthPath) return;

    try {
      const currentPendingPath = window.sessionStorage.getItem('intakeAwaitingInvitePath');
      if (currentPendingPath !== intakePostAuthPath) {
        window.sessionStorage.setItem('intakeAwaitingInvitePath', intakePostAuthPath);
      }
    } catch (error) {
      console.warn('[Widget] Failed to persist intake returning path', error);
      setHasPersistError(true);
    }

    if (shouldShowAuthPrompt || window.location.pathname.startsWith('/auth')) return;
  }, [activeConversationId, intakePostAuthPath, isAnonymous, intakeUuid, shouldShowAuthPrompt]);

  // System Messages
  useConversationSystemMessages({
    conversationId: activeConversationId ?? undefined,
    practiceId,
    ingestServerMessages,
  });

  const canChat = activeConversationId != null;
  const _isComposerDisabled = false; // Add recording check if needed

  const handleModeSelection = useCallback(async (mode: ConversationMode, source?: 'intro_gate' | 'composer_footer') => {
    if (!practiceId) return;
    
    try {
      const targetId = source === 'intro_gate' || mode === 'REQUEST_CONSULTATION'
        ? await ensureConversation({ forceNew: true })
        : await ensureConversation();
      
      if (!targetId) return;
      const success = await applyConversationMode(mode, targetId, source ?? 'intro_gate', mode === 'REQUEST_CONSULTATION');
      if (success) {
        setView('chat');
      }
    } catch (error) {
      console.error('[WidgetApp] Failed to handle mode selection:', error);
      const message = error instanceof Error ? error.message : 'Failed to start conversation';
      showErrorRef.current?.(message);
    }
  }, [practiceId, applyConversationMode, ensureConversation]);

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
  } = useFileUploadWithContext({
    conversationId: activeConversationId ?? undefined,
    ensureConversation: () => ensureConversation(),
  });

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
      if (allowedOrigins.length === 0) {
        console.warn('[Widget] Rejecting parent message: no trusted parent origin');
        return;
      }
      if (!allowedOrigins.includes(event.origin)) return;

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
        // Handle attribution if needed
      }
    };

    window.addEventListener('message', handleParentMessage);
    return () => window.removeEventListener('message', handleParentMessage);
  }, []);


  const closeButton = useMemo(() => (
    <Button
      type="button"
      variant="icon"
      size="icon-sm"
      onClick={requestWidgetClose}
      aria-label="Close widget"
      className="text-input-text/60 hover:text-input-text bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/10 shadow-lg"
    >
      <Icon icon={XMarkIcon} className="h-5 w-5" />
    </Button>
  ), [requestWidgetClose]);

  const navItems = useMemo<NavRailItem[]>(() => [
    {
      id: 'home',
      label: t('nav.home') ?? 'Home',
      icon: HomeIcon,
      href: '#home',
      onClick: () => setView('home'),
    },
    {
      id: 'list',
      label: t('nav.messages') ?? 'Messages',
      icon: ChatBubbleLeftRightIcon,
      href: '#list',
      onClick: () => setView('list')
    }
  ], [t]);
  const widgetBackTarget = hasRealConversations ? 'list' : 'home';
  const showConversationBack = shouldShowWorkspaceDetailBack('widget', Boolean(widgetBackTarget));

  const filteredMessagesForHeader = useMemo(() => {
    const base = messages.filter((message) => message.metadata?.systemMessageKey !== 'ask_question_help');
    const hasNonSystem = base.some((message) => message.role !== 'system');
    return hasNonSystem ? base.filter((message) => message.metadata?.systemMessageKey !== 'intro') : base;
  }, [messages]);

  const conversationHeaderActiveLabel = useMemo(() => {
    if (isSocketReady) return t('workspace.header.activeNow');
    const lastTimestamp = [...filteredMessagesForHeader].reverse().find((message) => typeof message.timestamp === 'number')?.timestamp;
    if (!lastTimestamp) return t('workspace.header.inactive');
    const relative = formatRelativeTime(new Date(lastTimestamp));
    return relative ? t('workspace.header.activeRelative', { time: relative }) : t('workspace.header.inactive');
  }, [filteredMessagesForHeader, isSocketReady, t]);

  const isConsultConversation = useMemo(
    () => conversationMode === 'REQUEST_CONSULTATION'
      || Boolean(resolveConsultationState(conversationMetadata))
      || Boolean(intakeConversationState || intakeStatus || slimContactDraft),
    [conversationMetadata, conversationMode, intakeConversationState, intakeStatus, slimContactDraft]
  );

  const conversationStrengthAction = useMemo(() => {
    if (!isConsultConversation) return null;

    const tier = resolveStrengthTier(intakeConversationState);
    const { percent, ringClass } = resolveStrengthStyle(tier);
    const radius = 9;
    const circumference = 2 * Math.PI * radius;
    const dashOffset = circumference - (percent / 100) * circumference;

    return (
      <Button
        type="button"
        variant="icon"
        size="icon-sm"
        onClick={() => setIsInspectorOpen(true)}
        aria-label="Case strength"
      >
        <span className="relative flex h-6 w-6 items-center justify-center">
          <svg className="-rotate-90 absolute inset-0 h-6 w-6" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r={radius} strokeWidth="2" fill="none" className="text-line-glass/30" stroke="currentColor" />
            <circle
              cx="12" cy="12" r={radius} strokeWidth="2" fill="none" strokeLinecap="round"
              className={`transition-all duration-300 ${ringClass}`} stroke="currentColor"
              strokeDasharray={circumference} strokeDashoffset={dashOffset}
            />
          </svg>
          <Icon icon={InformationCircleIcon} className="relative z-10 h-3.5 w-3.5" aria-hidden="true" />
        </span>
      </Button>
    );
  }, [intakeConversationState, isConsultConversation]);

  const widgetChatHeaderActions = useMemo(() => {
    if (!isEmbedded) return conversationStrengthAction;
    return (
      <>
        {conversationStrengthAction}
        {closeButton}
      </>
    );
  }, [closeButton, conversationStrengthAction, isEmbedded]);
  const showWidgetBottomNav = view !== 'chat';

  useEffect(() => {
    const isDark = true; // Handle dark mode state if needed
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  return (
    <>
      <DragDropOverlay isVisible={isDragging} />
      <div className={`absolute inset-x-0 inset-y-0 h-[100dvh] w-full overflow-hidden flex flex-col supports-[height:100cqh]:h-[100cqh] supports-[height:100svh]:h-[100svh] widget-shell-gradient justify-end`}>
        {hasPersistError ? (
          <div
            className="absolute left-4 right-4 top-4 z-[70] rounded-2xl border border-amber-400/40 bg-amber-500/15 px-4 py-3 text-sm text-[rgb(var(--accent-foreground))] shadow-lg backdrop-blur-md"
            role="alert"
            aria-live="polite"
          >
            {t('widget.persistIntakePathError')}
          </div>
        ) : null}
        {view === 'home' ? (
          <div className="flex h-full flex-col overflow-hidden relative">
             <div className="flex-1 overflow-y-auto">
               <WorkspaceHomeView
                 practiceName={practiceConfig.name}
                 practiceLogo={practiceConfig.profileImage}
                 onSendMessage={() => handleModeSelection('ASK_QUESTION', 'intro_gate')}
                 onRequestConsultation={() => handleModeSelection('REQUEST_CONSULTATION', 'intro_gate')}
                   onOpenRecentMessage={() => {
                     if (recentMessage?.conversationId) {
                       setConversationId(recentMessage.conversationId);
                       setView('chat');
                     } else {
                        handleModeSelection('ASK_QUESTION', 'intro_gate');
                     }
                   }}
                 recentMessage={recentMessage}
               />
             </div>
             {isEmbedded && (
                <div className="absolute right-4 top-4 z-[60]">
                  {closeButton}
                </div>
             )}
          </div>
        ) : view === 'list' ? (
            <div className="flex h-full flex-col overflow-hidden relative">
              <WidgetConversationListView
                conversations={conversations}
                previews={previews}
                practiceName={practiceConfig.name}
                isLoading={isConversationsLoading}
                onSelectConversation={(id) => {
                   setConversationId(id);
                   setView('chat');
                }}
                onSendMessage={() => handleModeSelection('ASK_QUESTION', 'intro_gate')}
              />
            </div>
        ) : (
          <>
            <div className="flex flex-1 min-h-0 overflow-hidden flex-row">
            <ChatContainer
              messages={messages}
              conversationTitle={resolveConversationDisplayTitle(
                conversationMetadata ?? null,
                conversationMetadata?.title ?? ''
              )}
              onSendMessage={sendMessage}
              conversationMode={conversationMode}
              onSelectMode={handleModeSelection}
              onToggleReaction={toggleMessageReaction}
              onRequestReactions={requestMessageReactions}
              composerDisabled={false}
              isPublicWorkspace={true}
              messagesReady={messagesReady}
              headerContent={
                <DetailHeader
                  title={practiceConfig.name ?? ''}
                  subtitle={conversationHeaderActiveLabel}
                  showBack={showConversationBack}
                  onBack={showConversationBack ? () => setView(widgetBackTarget) : undefined}
                  actions={widgetChatHeaderActions}
                  className="workspace-conversation-header"
                />
              }
              heightClassName="h-full"
              useFrame={false}
              layoutMode="widget"
              practiceConfig={{
                ...practiceConfig,
                name: practiceConfig.name ?? '',
                profileImage: practiceConfig.profileImage ?? '',
                description: practiceDetails?.description ?? practiceConfig.description ?? '',
                practiceId
              }}
              onOpenSidebar={() => setIsInspectorOpen(true)}
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
              isRecording={false}
              setIsRecording={() => {}}
              isReadyToUpload={isReadyToUpload}
              isSessionReady={currentUserId !== null}
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
              onFinalizeSubmit={handleFinalizeSubmit}
              onRegisterOpenPayment={(fn) => { openPaymentRef.current = fn; }}
              isAnonymousUser={isAnonymous}
              canChat={canChat}
              hasMoreMessages={hasMoreMessages}
              isLoadingMoreMessages={isLoadingMoreMessages}
              onLoadMoreMessages={loadMoreMessages}
              showAuthPrompt={shouldShowAuthPrompt}
            />

            {isInspectorOpen && activeConversationId && (
                <aside className="hidden w-80 shrink-0 overflow-y-auto border-l border-line-glass/15 bg-surface-nav-secondary shadow-2xl lg:block lg:w-96">
                  <InspectorPanel 
                    entityType="conversation"
                    entityId={activeConversationId}
                    practiceId={practiceId}
                    isClientView={true}
                    practiceName={practiceConfig.name ?? undefined}
                    practiceLogo={practiceConfig.profileImage || undefined}
                    onClose={() => setIsInspectorOpen(false)}
                    intakeConversationState={intakeConversationState}
                    intakeStatus={intakeStatus}
                    onIntakeFieldsChange={applyIntakeFields}
                    practiceDetails={cachedPracticeDetails}
                    intakeSlimContactDraft={slimContactDraft}
                  />
                </aside>
            )}
            </div>

            {isInspectorOpen && activeConversationId && (
              <MobileInspectorOverlay
                isOpen={true}
                onClose={() => setIsInspectorOpen(false)}
              >
                <InspectorPanel 
                  entityType="conversation"
                  entityId={activeConversationId}
                  practiceId={practiceId}
                  isClientView={true}
                  practiceName={practiceConfig.name ?? undefined}
                  practiceLogo={practiceConfig.profileImage || undefined}
                  onClose={() => setIsInspectorOpen(false)}
                  intakeConversationState={intakeConversationState}
                  intakeStatus={intakeStatus}
                  onIntakeFieldsChange={applyIntakeFields}
                  practiceDetails={cachedPracticeDetails}
                  intakeSlimContactDraft={slimContactDraft}
                />
              </MobileInspectorOverlay>
            )}
          </>
        )}
        
        <NavRail
          items={navItems}
          activeHref={view === 'home' ? '#home' : '#list'}
          variant="bottom"
          hidden={!showWidgetBottomNav}
          className="mt-auto"
        />
      </div>
    </>
  );
}
