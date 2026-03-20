import { FunctionComponent } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useTranslation } from '@/shared/i18n/hooks';
import { Button } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { InformationCircleIcon, XMarkIcon } from '@heroicons/react/24/outline';
import ChatContainer from '@/features/chat/components/ChatContainer';
import InspectorPanel from '@/shared/ui/inspector/InspectorPanel';
import WorkspaceConversationHeader from '@/features/chat/components/WorkspaceConversationHeader';
import { WorkspaceHomeView } from '@/features/chat/views/WorkspaceHomeView';
import { useToastContext } from '@/shared/contexts/ToastContext';
import ConversationListView from '@/features/chat/views/ConversationListView';
import { useConversations } from '@/shared/hooks/useConversations';
import { useFileUploadWithContext } from '@/shared/hooks/useFileUpload';
import { useMessageHandling } from '@/shared/hooks/useMessageHandling';
import { useConversationSystemMessages } from '@/shared/hooks/useConversationSystemMessages';
import { postToParentFrame, resolveAllowedParentOrigins } from '@/shared/utils/widgetEvents';
import { setupGlobalKeyboardListeners } from '@/shared/utils/keyboard';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
import { resolveStrengthStyle, resolveStrengthTier } from '@/shared/utils/intakeStrength';
import { usePracticeDetails } from '@/shared/hooks/usePracticeDetails';
import { NavRail, NavRailItem } from '@/shared/ui/nav/NavRail';
import type { ConversationMode } from '@/shared/types/conversation';
import type { UIPracticeConfig } from '@/shared/hooks/usePracticeConfig';
import type { ConversationMetadata } from '@/shared/lib/conversationApi';
import DragDropOverlay from '@/shared/ui/DragDropOverlay';

const MAX_AUTO_CONVERSATION_RETRIES = 3;

interface WidgetAppProps {
  practiceId: string;
  practiceConfig: UIPracticeConfig;
  routeConversationId?: string;
  bootstrapSession?: {
    user: {
      id: string;
      isAnonymous?: boolean;
      is_anonymous?: boolean;
    };
  };
}

export const WidgetApp: FunctionComponent<WidgetAppProps> = ({
  practiceId,
  practiceConfig,
  routeConversationId,
  bootstrapSession
}) => {
  const [view, setView] = useState<'home' | 'list' | 'chat'>(routeConversationId ? 'chat' : 'home');
  const [setupConversationId, setConversationId] = useState<string | null>(null);
  const [conversationMode, setConversationMode] = useState<ConversationMode | null>(null);
  const [retryTrigger, setRetryTrigger] = useState(0);
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const autoConversationAttemptedRef = useRef(false);
  const autoConversationRetryCountRef = useRef(0);
  const autoConversationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const widgetVisibleRef = useRef(false);
  const showErrorRef = useRef<((msg: string) => void) | null>(null);
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);

  const { showError: showToastError } = useToastContext();

  useEffect(() => {
    showErrorRef.current = (msg: string) => showToastError('Error', msg);
  }, [showToastError]);

  const currentUserId = bootstrapSession?.user?.id ?? null;
  const isAnonymous = bootstrapSession?.user?.isAnonymous ?? bootstrapSession?.user?.is_anonymous ?? true;
  const sessionIsPending = false; // Bootstrap session is immediate

  const isEmbedded = typeof window !== 'undefined' && window.parent !== window;

  const createConversation = useCallback(async (options?: { forceNew?: boolean }): Promise<string> => {
    setIsCreatingConversation(true);
    try {
      const { createConversation: apiCreateConversation } = await import('@/shared/lib/conversationApi');
      const conversationId = await apiCreateConversation(practiceId, {
        userId: currentUserId ?? undefined,
        forceNew: options?.forceNew
      });
      setConversationId(conversationId);
      return conversationId;
    } finally {
      setIsCreatingConversation(false);
    }
  }, [practiceId, currentUserId, setConversationId]);

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

  const { practiceDetails } = usePracticeDetails({ practiceId });

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

  const recentMessage = useMemo(() => {
    if (!latestConversation) return null;
    return {
      preview: latestConversation.last_message_content || latestConversation.user_info?.title || 'Click to continue your conversation',
      timestampLabel: latestConversation.last_message_at ? formatRelativeTime(latestConversation.last_message_at) : '',
      senderLabel: practiceConfig.name || 'Assistant',
      avatarSrc: practiceConfig.profileImage,
      conversationId: latestConversation.id
    };
  }, [latestConversation, practiceConfig.name, practiceConfig.profileImage]);

  // Previews for ConversationListView
  const previews = useMemo(() => {
    const map: Record<string, { content: string; role: string; createdAt: string }> = {};
    conversations.forEach(c => {
      map[c.id] = {
        content: c.last_message_content || c.user_info?.title || 'No messages yet',
        role: 'assistant',
        createdAt: c.last_message_at || c.updated_at || ''
      };
    });
    return map;
  }, [conversations]);

  useEffect(() => {
    // Cleanup function that always runs on effect cleanup or re-run
    const cleanup = () => {
      if (autoConversationTimeoutRef.current) {
        clearTimeout(autoConversationTimeoutRef.current);
        autoConversationTimeoutRef.current = null;
      }
    };

    // In widget mode, we don't necessarily want to force-create a conversation on mount
    // if the user is on the Home page. But if they switch to chat, they'll need it.
    // However, for anonymous tracking, it's often better to have one ready.
    // We'll keep the creation logic but NOT force the view change here.

    if (routeConversationId || setupConversationId) return cleanup;
    if (sessionIsPending || !currentUserId || !practiceId) return cleanup;
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
  }, [createConversation, currentUserId, practiceId, routeConversationId, sessionIsPending, setupConversationId, retryTrigger]);

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
    conversationId: setupConversationId ?? routeConversationId ?? undefined,
    userId: currentUserId,
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
    loadMoreMessages, isSocketReady, applyIntakeFields,
  } = messageHandling;

  useEffect(() => { clearMessages(); }, [practiceId, clearMessages]);

  // Intake Auth (simplistic for widget, just redirecting or showing prompt if needed)
  const intakeUuid = intakeStatus?.intakeUuid ?? null;
  const intakeAuthTarget = useMemo(() => {
    if (!intakeUuid) return null;
    if (intakeStatus?.paymentRequired && !intakeStatus?.paymentReceived) return null;
    return intakeUuid;
  }, [intakeUuid, intakeStatus?.paymentReceived, intakeStatus?.paymentRequired]);

  const shouldShowAuthPrompt = Boolean(isAnonymous && intakeAuthTarget);

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
    if (!isAnonymous || !intakeUuid || !awaitingInvitePath) return;

    try {
      const currentPendingPath = window.sessionStorage.getItem('intakeAwaitingInvitePath');
      if (currentPendingPath !== awaitingInvitePath) {
        window.sessionStorage.setItem('intakeAwaitingInvitePath', awaitingInvitePath);
      }
    } catch (error) {
       console.warn('[Widget] Failed to persist intake returning path', error);
       throw error;
    }
  }, [isAnonymous, intakeUuid, awaitingInvitePath, shouldShowAuthPrompt]);

  // System Messages
  const activeConversationId = setupConversationId ?? routeConversationId;
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
  const isComposerDisabled = false; // Add recording check if needed

  const handleModeSelection = useCallback(async (mode: ConversationMode, source?: 'intro_gate' | 'composer_footer') => {
    if (!practiceId) return;
    
    let targetId: string | null = null;
    if (source === 'intro_gate' || mode === 'REQUEST_CONSULTATION') {
      targetId = await createConversation({ forceNew: true });
    } else {
      targetId = activeConversationId ?? null;
      if (!targetId) {
        targetId = await createConversation();
      }
    }
    
    if (!targetId) return;
    const success = await applyConversationMode(mode, targetId, source ?? 'intro_gate', mode === 'REQUEST_CONSULTATION');
    if (success) {
      setView('chat');
    }
  }, [practiceId, activeConversationId, applyConversationMode, createConversation]);

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


  const closeButton = (
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
  );

  const headerRightSlot = useMemo(() => {
    const hasConversation = Boolean(activeConversationId);
    let inspectorButtonContent = <Icon icon={InformationCircleIcon} className="h-5 w-5" />;

    if (conversationMode === 'REQUEST_CONSULTATION' && intakeConversationState) {
      const tier = resolveStrengthTier(intakeConversationState);
      const { percent, ringClass } = resolveStrengthStyle(tier);
      const radius = 9;
      const circumference = 2 * Math.PI * radius;
      const dashOffset = circumference - (percent / 100) * circumference;

      inspectorButtonContent = (
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
      );
    }

    const inspectorButton = hasConversation ? (
      <Button
        type="button"
        variant="icon"
        size="icon-sm"
        onClick={() => setIsInspectorOpen(true)}
        aria-label="Open inspector"
      >
        {inspectorButtonContent}
      </Button>
    ) : null;

    return (
      <div className="flex items-center gap-1">
        {inspectorButton}
        {isEmbedded ? closeButton : null}
      </div>
    );
  }, [conversationMode, intakeConversationState, isEmbedded, closeButton, activeConversationId, setIsInspectorOpen]);

  const navItems = useMemo<NavRailItem[]>(() => [
    {
      id: 'home',
      label: t('nav.home'),
      icon: <Icon icon={InformationCircleIcon} className="h-5 w-5" />, // placeholder
      onClick: () => setView('home')
    },
    {
      id: 'list',
      label: t('nav.messages'),
      icon: <Icon icon={InformationCircleIcon} className="h-5 w-5" />, // placeholder
      onClick: async () => {
        if (isCreatingConversation) return;
        try {
          if (!activeConversationId) {
            await createConversation();
          }
          setView('list');
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to start conversation';
          showErrorRef.current?.(message);
        }
      }
    },
    {
      id: 'chat',
      label: t('nav.chat'),
      icon: <Icon icon={InformationCircleIcon} className="h-5 w-5" />, // placeholder
      onClick: async () => {
        if (isCreatingConversation) return;
        try {
          if (!activeConversationId) {
            await createConversation();
          }
          setView('chat');
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to start conversation';
          showErrorRef.current?.(message);
        }
      }
    }
  ], [activeConversationId, t, isCreatingConversation, createConversation]);

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
              <ConversationListView
                conversations={conversations}
                previews={previews}
                practiceName={practiceConfig.name}
                practiceLogo={practiceConfig.profileImage}
                isLoading={isConversationsLoading}
                onSelectConversation={(id) => {
                   setConversationId(id);
                   setView('chat');
                }}
                onSendMessage={() => handleModeSelection('ASK_QUESTION', 'intro_gate')}
                showBackButton={false}
                showTitle={true}
              />
            </div>
        ) : (
          <>
            {/* Floating close button */}
            {isEmbedded && (
               <div className="absolute right-4 top-4 z-[60]">
                 {closeButton}
               </div>
            )}
            <div className="flex flex-1 min-h-0 overflow-hidden flex-row">
            <ChatContainer
              messages={messages}
              onSendMessage={sendMessage}
              conversationMode={conversationMode}
              onSelectMode={handleModeSelection}
              onToggleReaction={toggleMessageReaction}
              onRequestReactions={requestMessageReactions}
              composerDisabled={false}
              isPublicWorkspace={true}
              messagesReady={messagesReady}
              headerContent={<WorkspaceConversationHeader
                  practiceName={practiceConfig.name}
                  activeLabel={t('workspace.header.activeNow')}
                  onBack={hasRealConversations ? () => setView('list') : undefined}
                  rightSlot={headerRightSlot}
                />}
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
              isAnonymousUser={isAnonymous}
              canChat={canChat}
              hasMoreMessages={hasMoreMessages}
              isLoadingMoreMessages={isLoadingMoreMessages}
              onLoadMoreMessages={loadMoreMessages}
              showAuthPrompt={shouldShowAuthPrompt}
            />

            {isInspectorOpen && activeConversationId && (
                <aside className="hidden lg:block w-80 lg:w-96 border-l border-line-glass/15 bg-surface-base shadow-2xl shrink-0 overflow-y-auto">
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
                    practiceDetails={practiceDetails}
                  />
                </aside>
            )}
            </div>

            {isInspectorOpen && activeConversationId && (
              <div className="absolute inset-0 z-[2000] lg:hidden">
                <button 
                  type="button"
                  className="absolute inset-0 bg-black/20 backdrop-blur-sm"
                  onClick={() => setIsInspectorOpen(false)}
                  aria-label="Close inspector"
                />
                <aside className="absolute right-0 top-0 h-dvh w-full max-w-[85vw] sm:max-w-2xl overflow-y-auto border-l border-line-glass/15 bg-surface-base shadow-2xl chat-inspector-slide-in">
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
                    practiceDetails={practiceDetails}
                  />
                </aside>
              </div>
            )}
          </>
        )}
        
        <div className="mt-auto">
          <NavRail
            items={navItems}
            activeHref={view === 'home' ? '/home' : view === 'list' ? '/list' : '/chat'}
            variant="bottom"
          />
        </div>
      </div>
    </>
  );
}
