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
import { useMessageHandling } from '@/shared/hooks/useMessageHandling';
import { useConversationSystemMessages } from '@/shared/hooks/useConversationSystemMessages';
import { createConversation, fetchLatestConversationMessage } from '@/shared/lib/conversationApi';
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
import { resolveStrengthStyle, resolveStrengthTier } from '@/shared/utils/intakeStrength';
import { DetailHeader } from '@/shared/ui/layout/DetailHeader';
import { resolveConsultationState } from '@/shared/utils/consultationState';
import { MobileInspectorOverlay } from '@/shared/ui/inspector/MobileInspectorOverlay';
import { initializeAccentColor } from '@/shared/utils/accentColors';
import { features } from '@/config/features';
import type { FileAttachment } from '../../worker/types';
import type { UploadingFile } from '@/shared/types/upload';

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
  // Single navigation state (no 'disclaimer' step)
  const [step, setStep] = useState<'home' | 'list' | 'chat'>(routeConversationId ? 'chat' : 'home');
  const [setupConversationId, setConversationId] = useState<string | null>(null);
  const [bootstrapIgnored, setBootstrapIgnored] = useState(false);
  const creatingConversationRef = useRef<Promise<string> | null>(null);
  const [conversationMode, setConversationMode] = useState<ConversationMode | null>(null);
  // Store user's intent from home CTA, but do not advance flow yet
  const [requestedMode, setRequestedMode] = useState<ConversationMode | null>(null);
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [isPaymentAuthPromptOpen, setIsPaymentAuthPromptOpen] = useState(false);
  const widgetVisibleRef = useRef(false);

  // Remove previousViewRef and view tracking
  const showErrorRef = useRef<((msg: string) => void) | null>(null);
  const locallyCreatedConversationIds = useRef(new Set<string>());

  const { showError: showToastError } = useToastContext();

  useEffect(() => {
    showErrorRef.current = (msg: string) => showToastError('Error', msg);
  }, [showToastError]);

  useEffect(() => {
    initializeAccentColor(practiceConfig.accentColor);
  }, [practiceConfig.accentColor]);

  const currentUserId = bootstrapSession?.user?.id ?? null;
  const isAnonymous = bootstrapSession?.user?.isAnonymous ?? bootstrapSession?.user?.is_anonymous ?? true;

  const isEmbedded = typeof window !== 'undefined' && window.parent !== window;

  const effectiveConversationId = routeConversationId ?? setupConversationId ?? (bootstrapIgnored ? null : bootstrapConversationId) ?? null;

  const createConversationIfNeeded = useCallback(async () => {
    if (effectiveConversationId) return effectiveConversationId;
    try {
      // Use ref-based lock to prevent concurrent creation calls during the same tick
      // or while a fetch is already in flight.
      if (creatingConversationRef.current) {
        return creatingConversationRef.current;
      }

      const createPromise = (async () => {
        try {
          const newId = await createConversation(practiceId, { status: 'draft' });
          locallyCreatedConversationIds.current.add(newId);
          setBootstrapIgnored(true);
          setConversationId(newId);
          return newId;
        } catch (error) {
          console.error('Failed to create deferred conversation', error);
          throw error;
        } finally {
          creatingConversationRef.current = null;
        }
      })();

      creatingConversationRef.current = createPromise;
      return createPromise;
    } catch (error) {
      console.error('Failed to create deferred conversation', error);
      throw error;
    }
  }, [effectiveConversationId, practiceId, setConversationId]);

  const { details: practiceDetails } = usePracticeDetails(practiceId, practiceConfig.slug);
  
  // Use reactive practice details from store to ensure re-renders on updates
  const practiceDetailsMap = useStore(practiceDetailsStore);
  const cachedPracticeDetails = practiceDetailsMap[practiceId] || practiceDetails;

  // Fetch conversations to show "Recent Message" on home page and for the list view
  const { conversations, isLoading: isConversationsLoading } = useConversations({
    practiceId,
    list: true,
    enabled: Boolean(practiceId),
    allowAnonymous: true,
    status: 'active',
  });

  const latestConversation = useMemo(() => {
    if (!conversations) return null;
    // Pick the first conversation that actually has a message (not an empty prewarmed draft)
    return conversations.find(c => Boolean(c.last_message_at || c.last_message_content)) || null;
  }, [conversations]);

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
      timestampLabel: formatRelativeTime(latestConversation.updated_at),
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
    if (!practiceId || conversations.length === 0 || step === 'chat') return;
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
  }, [conversations, practiceId, step]);

  // Previews for ConversationListView
  const previews = useMemo(() => {
    const map: Record<string, { content: string; role: string; createdAt: string }> = {};
    conversations.forEach(c => {
      const preview = conversationPreviews[c.id];
      map[c.id] = {
        content: preview?.content || c.last_message_content || c.user_info?.title || 'No messages yet',
        role: preview?.role || 'assistant',
        createdAt: c.updated_at
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



  const messageHandling = useMessageHandling({
    practiceId,
    practiceSlug: practiceConfig.slug ?? undefined,
    conversationId: effectiveConversationId ?? undefined,
    onEnsureConversation: createConversationIfNeeded,
    userId: currentUserId,
    linkAnonymousConversationOnLoad: true,
    mode: conversationMode,
    onConversationMetadataUpdated: handleConversationMetadataUpdated,
    onError: handleMessageError,
    skipInitialFetch: locallyCreatedConversationIds.current.has(effectiveConversationId ?? ''),
  });

  const {
    messages, conversationMetadata, sendMessage, addMessage: _addMessage, clearMessages,
    requestMessageReactions, toggleMessageReaction,
    intakeStatus, intakeConversationState, handleIntakeCtaResponse,
    slimContactDraft, handleSlimFormContinue, handleBuildBrief, handleSubmitNow, handleFinalizeSubmit: _handleFinalizeSubmit,
    startConsultFlow: _startConsultFlow, updateConversationMetadata: _updateConversationMetadata, isConsultFlowActive: _isConsultFlowActive,
    ingestServerMessages, messagesReady, hasMoreMessages, isLoadingMoreMessages,
    loadMoreMessages, isSocketReady, applyIntakeFields,
  } = messageHandling;

  const lastWipedPracticeIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!practiceId) return;
    if (lastWipedPracticeIdRef.current !== null && lastWipedPracticeIdRef.current !== practiceId) {
      clearMessages();
    }
    lastWipedPracticeIdRef.current = practiceId;
  }, [practiceId, clearMessages]);

  const activeConversationId = effectiveConversationId;

  // Optional auth prompt is manual only; intake submission itself stays anonymous.
  const shouldShowAuthPrompt = Boolean(isAnonymous && isPaymentAuthPromptOpen);

  const handlePaymentAuthRequest = useCallback(() => {
    setIsPaymentAuthPromptOpen(true);
  }, []);

  const handleAuthPromptClose = useCallback(() => {
    setIsPaymentAuthPromptOpen(false);
  }, []);

  const handleAuthPromptSuccess = useCallback(() => {
    setIsPaymentAuthPromptOpen(false);
  }, []);

  const handleStrengthenCase = useCallback(async () => {
    try {
      await applyIntakeFields({ enrichmentMode: true });
      await sendMessage('I want to provide more details to strengthen my case.', []);
    } catch (err) {
      console.error('Failed to start strengthen case flow', err);
    }
  }, [applyIntakeFields, sendMessage]);

  // System Messages
  const { persistSystemMessage: _persistSystemMessage } = useConversationSystemMessages({
    conversationId: activeConversationId ?? undefined,
    practiceId,
    ingestServerMessages,
  });

  const widgetIntroMessage = useMemo(() => {
    const source = cachedPracticeDetails?.introMessage ?? practiceConfig.introMessage;
    return typeof source === 'string' ? source.trim() : '';
  }, [cachedPracticeDetails?.introMessage, practiceConfig.introMessage]);

  const widgetLegalDisclaimer = useMemo(() => {
    const source = cachedPracticeDetails?.legalDisclaimer ?? practiceConfig.legalDisclaimer;
    return typeof source === 'string' ? source.trim() : '';
  }, [cachedPracticeDetails?.legalDisclaimer, practiceConfig.legalDisclaimer]);




  // Canonical intro detection: only use metadata.systemMessageKey === 'intro'
  const hasIntro = useMemo(() =>
    messages.some((m) => m.metadata?.systemMessageKey === 'intro'),
    [messages]
  );

  // Conversation is considered started if any non-system message exists or intro exists
  const hasConversationStarted = useMemo(() =>
    messages.some((message) => message.role !== 'system') || hasIntro,
    [messages, hasIntro]
  );


  // Memoized intro injector with messagesReady gate
  const maybeInjectIntro = useCallback(() => {
    if (!messagesReady) return;
    if (!activeConversationId || !widgetIntroMessage || hasConversationStarted) return;
    if (typeof messageHandling.addMessage === 'function' && !hasIntro) {
      messageHandling.addMessage({
        id: 'system-intro-local',
        role: 'assistant',
        content: widgetIntroMessage,
        isUser: false,
        timestamp: 1, // Pin to the very top regardless of local clock
        metadata: { systemMessageKey: 'intro' },
      });
    }
  }, [messagesReady, activeConversationId, widgetIntroMessage, hasConversationStarted, messageHandling, hasIntro]);

  // Inject intro when conversation becomes active and no intro exists, only after messagesReady
  useEffect(() => {
    if (messagesReady) {
      maybeInjectIntro();
    }
  }, [messagesReady, activeConversationId, maybeInjectIntro]);



  // Allow chat container to render if intake/chat flow is active
  const canChat = activeConversationId != null;
  const _isComposerDisabled = false; // Add recording check if needed

  // Mode selection: record user's intent and ensure conversation exists, but do not advance flow yet
  const handleModeSelection = useCallback(async (mode: ConversationMode) => {
    if (!practiceId) return;

    setRequestedMode(mode);

    try {
      await createConversationIfNeeded();
      
      // If we are already past the disclaimer/form stages, commit immediately
      const currentStep = intakeStatus?.step;
      if (currentStep === 'chat' || (mode === 'ASK_QUESTION' && (currentStep as string) === 'chat')) {
        setConversationMode(mode);
        setRequestedMode(null);
      }
    } catch (error) {
      console.error('Failed to create deferred conversation', error);
      const message = error instanceof Error ? error.message : 'Failed to start conversation';
      showErrorRef.current?.(message);
    }
  }, [practiceId, createConversationIfNeeded, intakeStatus?.step]);
  const derivedStep = useMemo(() => {
    if (step === 'chat') return 'chat';
    if (requestedMode && (intakeStatus?.step === 'disclaimer' || intakeStatus?.step === 'contact_form_slim' || (intakeStatus?.step as string) === 'chat')) {
      return 'chat';
    }
    return step;
  }, [step, requestedMode, intakeStatus?.step]);

  // Downstream state machine: purely side-effectful subscriptions or cleanup
  useEffect(() => {
    // Keep this effect only for logic that must run when requestedMode/step changes non-derivatively
  }, [requestedMode, effectiveConversationId, intakeStatus?.step]);

  const attachmentsDisabledMessage = t('chat.attachments.disabled');

  // File Uploads
  const previewFiles = useMemo<FileAttachment[]>(() => [], []);
  const uploadingFiles = useMemo<UploadingFile[]>(() => [], []);
  const isReadyToUpload = features.enableFileAttachments;
  const handleFileSelect = useCallback(async (_files: File[]) => {
    if (!features.enableFileAttachments) {
      showErrorRef.current?.(attachmentsDisabledMessage);
      return [];
    }
    // TODO: Implement file upload logic
    return [];
  }, [attachmentsDisabledMessage]);
  const removePreviewFile = useCallback((_index: number) => {}, []);
  const clearPreviewFiles = useCallback(() => {}, []);
  const isDragging = false;
  const cancelUpload = useCallback((_fileId: string) => {}, []);
  const handleMediaCapture = useCallback((_blob: Blob, _type: 'audio' | 'video') => {
    if (!features.enableFileAttachments) {
      showErrorRef.current?.(attachmentsDisabledMessage);
      return undefined;
    }
    // TODO: Implement media capture logic
    return undefined;
  }, [attachmentsDisabledMessage]);

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
      className="text-input-text/60 hover:text-input-text bg-surface-workspace/40 dark:bg-surface-utility/10 hover:bg-surface-workspace/60 dark:hover:bg-surface-utility/20 backdrop-blur-md border border-line-glass/20 shadow-lg"
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
      onClick: () => {
        setConversationMode(null);
        setRequestedMode(null);
        setStep('home');
      },
    },
    {
      id: 'list',
      label: t('nav.messages') ?? 'Messages',
      icon: ChatBubbleLeftRightIcon,
      href: '#list',
      onClick: () => setStep('list')
    }
  ], [t]);
  
  const showConversationBack = step === 'chat';

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
  // Accept disclaimer: not yet wired to backend action
  const handleAcceptDisclaimer = useCallback(async () => {
    if (!effectiveConversationId) {
      console.warn('[WidgetApp] Cannot accept disclaimer: no effectiveConversationId');
      return;
    }
    try {
      await _updateConversationMetadata({
        disclaimerAcceptedAt: new Date().toISOString(),
      });
      // Mode commitment: advance the local UI state after backend is updated
      if (requestedMode) {
        setConversationMode(requestedMode);
        setRequestedMode(null);
      }
    } catch (err) {
      console.error('[WidgetApp] Failed to accept disclaimer', err);
    }
  }, [effectiveConversationId, _updateConversationMetadata, requestedMode]);

  // Show bottom nav except in chat
  const showWidgetBottomNav = derivedStep !== 'chat';

  useEffect(() => {
    const isDark = true; // Handle dark mode state if needed
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  // Downstream-state-driven disclaimer gating: show disclaimer only at the correct milestone
  const shouldShowDisclaimer = Boolean(
    widgetLegalDisclaimer &&
    effectiveConversationId &&
    (requestedMode === 'REQUEST_CONSULTATION' || requestedMode === 'ASK_QUESTION') &&
    intakeStatus?.step === 'disclaimer'
  );

  return (
    <>
      <DragDropOverlay isVisible={isDragging} />
      <div className={`absolute inset-x-0 inset-y-0 h-[100dvh] w-full overflow-hidden flex flex-col supports-[height:100cqh]:h-[100cqh] supports-[height:100svh]:h-[100svh] widget-shell-gradient justify-end`}>
        {derivedStep === 'home' && (
          <div className="flex h-full flex-col overflow-hidden relative">
            <div className="flex-1 overflow-y-auto">
              <WorkspaceHomeView
                practiceName={practiceConfig.name}
                practiceLogo={practiceConfig.profileImage}
                onSendMessage={() => handleModeSelection('ASK_QUESTION')}
                onRequestConsultation={() => handleModeSelection('REQUEST_CONSULTATION')}
                onOpenRecentMessage={() => {
                  if (recentMessage?.conversationId) {
                    setConversationId(recentMessage.conversationId);
                    setStep('chat');
                  } else {
                    handleModeSelection('ASK_QUESTION');
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
        )}
        {derivedStep === 'list' && (
          <WidgetConversationListView
            conversations={conversations}
            previews={previews}
            practiceName={practiceConfig.name}
            isLoading={isConversationsLoading}
            onSelectConversation={id => {
              setConversationId(id);
              setStep('chat');
            }}
            onSendMessage={() => handleModeSelection('ASK_QUESTION')}
          />
        )}
        {derivedStep === 'chat' && (
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
                disclaimerProps={shouldShowDisclaimer ? {
                  text: widgetLegalDisclaimer,
                  onAccept: handleAcceptDisclaimer,
                  onClose: () => {
                    setRequestedMode(null);
                    setConversationMode(null);
                    setStep('home');
                  },
                } : undefined}
                onToggleReaction={features.enableMessageReactions ? toggleMessageReaction : undefined}
                onRequestReactions={requestMessageReactions}
                composerDisabled={false}
                isPublicWorkspace={true}
                messagesReady={messagesReady}
                headerContent={
                  <DetailHeader
                    title={practiceConfig.name ?? ''}
                    subtitle={conversationHeaderActiveLabel}
                    showBack={showConversationBack}
                    onBack={showConversationBack ? () => setStep('home') : undefined}
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
                  practiceId
                }}
                onOpenSidebar={() => setIsInspectorOpen(true)}
                practiceId={practiceId}
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
                onStrengthenCase={handleStrengthenCase}
                onSubmitNow={handleSubmitNow}

                isAnonymousUser={isAnonymous}
                canChat={canChat}
                hasMoreMessages={hasMoreMessages}
                isLoadingMoreMessages={isLoadingMoreMessages}
                onLoadMoreMessages={loadMoreMessages}
                showAuthPrompt={shouldShowAuthPrompt}
                onAuthPromptRequest={isAnonymous ? handlePaymentAuthRequest : undefined}
                onAuthPromptClose={handleAuthPromptClose}
                onAuthPromptSuccess={handleAuthPromptSuccess}
              />

              {isInspectorOpen && activeConversationId && (
                <aside className="hidden w-80 shrink-0 overflow-y-auto bg-surface-inspector shadow-2xl lg:block lg:w-96">
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
          activeHref={step === 'home' ? '#home' : step === 'list' ? '#list' : undefined}
          variant="bottom"
          hidden={!showWidgetBottomNav}
          className="mt-auto"
        />
      </div>
    </>
  );
}
