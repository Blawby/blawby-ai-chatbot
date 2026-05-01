import { useState, useCallback, useRef, useEffect, useMemo } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { useLocation } from 'preact-iso';
import ChatContainer from '@/features/chat/components/ChatContainer';
import DragDropOverlay from '@/shared/ui/DragDropOverlay';
import WorkspacePage from '@/features/chat/pages/WorkspacePage';
import { useSessionContext, useMemberRoleContext } from '@/shared/contexts/SessionContext';
import { RoutePracticeProvider } from '@/shared/contexts/RoutePracticeContext';
import { IntakeProvider } from '@/shared/contexts/IntakeContext';
import type { UIPracticeConfig } from '@/shared/hooks/usePracticeConfig';
import type { WorkspaceType } from '@/shared/types/workspace';
import { useMessageHandling } from '@/shared/hooks/useMessageHandling';
import { useConversationSetup } from '@/shared/hooks/useConversationSetup';
import { useWorkspaceRouting } from '@/shared/hooks/useWorkspaceRouting';
import { useFileUpload } from '@/shared/hooks/useFileUpload';
import { setupGlobalKeyboardListeners } from '@/shared/utils/keyboard';
import type { FileAttachment } from '../../worker/types';
import { useNavigation } from '@/shared/utils/navigation';
import WelcomeDialog from '@/features/modals/components/WelcomeDialog';
import { useWelcomeDialog } from '@/features/modals/hooks/useWelcomeDialog';
import { SessionNotReadyError } from '@/shared/types/errors';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { clearPendingPracticeInviteLink, readPendingPracticeInviteLink } from '@/shared/utils/practiceInvites';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { usePracticeDetails } from '@/shared/hooks/usePracticeDetails';
import type { ConversationMode } from '@/shared/types/conversation';
import { lazy } from 'preact/compat';
const PracticeMattersPage = lazy(() => import('@/features/matters/pages/PracticeMattersPage').then(m => ({ default: m.PracticeMattersPage })));
const PracticeContactsPage = lazy(() => import('@/features/clients/pages/PracticeContactsPage').then(m => ({ default: m.PracticeContactsPage })));
const ClientMattersPage = lazy(() => import('@/features/matters/pages/ClientMattersPage').then(m => ({ default: m.ClientMattersPage })));
const PracticeInvoicesPage = lazy(() => import('@/features/invoices/pages/PracticeInvoicesPage').then(m => ({ default: m.PracticeInvoicesPage })));
const PracticeInvoiceDetailPage = lazy(() => import('@/features/invoices/pages/PracticeInvoiceDetailPage').then(m => ({ default: m.PracticeInvoiceDetailPage })));
const ClientInvoicesPage = lazy(() => import('@/features/invoices/pages/ClientInvoicesPage').then(m => ({ default: m.ClientInvoicesPage })));
const ClientInvoiceDetailPage = lazy(() => import('@/features/invoices/pages/ClientInvoiceDetailPage').then(m => ({ default: m.ClientInvoiceDetailPage })));
const PracticeReportsPage = lazy(() => import('@/features/reports/pages/PracticeReportsPage').then(m => ({ default: m.PracticeReportsPage })));
const IntakesPage = lazy(() => import('@/features/intake/pages/IntakesPage').then(m => ({ default: m.IntakesPage })));
const EngagementsPage = lazy(() => import('@/features/engagements/pages/EngagementsPage').then(m => ({ default: m.EngagementsPage })));
import { useConversationSystemMessages } from '@/shared/hooks/useConversationSystemMessages';
import { initializeAccentColor } from '@/shared/utils/accentColors';
import { useMentionCandidates } from '@/shared/hooks/useMentionCandidates';
import { isIntakeReadyForSubmission, resolveConsultationState } from '@/shared/utils/consultationState';
import type { SettingsView } from '@/features/settings/pages/SettingsContent';
import { InformationCircleIcon } from '@heroicons/react/24/outline';
import { PlusIcon } from '@heroicons/react/24/solid';
import { Button } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { shouldShowWorkspaceDetailBack } from '@/shared/utils/workspaceDetailNavigation';
import {
  resolveConversationCaseTitle,
  resolveConversationContactName,
  resolveConversationDisplayTitle,
} from '@/shared/utils/conversationDisplay';
import { DetailHeader } from '@/shared/ui/layout/DetailHeader';
import { LazyRouteBoundary } from '@/shared/ui/layout/LazyRouteBoundary';
import { resolveStrengthStyle, resolveStrengthTier } from '@/shared/utils/intakeStrength';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
import { features } from '@/config/features';

// ─── types ────────────────────────────────────────────────────────────────────

export type WorkspaceView = 'home' | 'setup' | 'list' | 'conversation' | 'intakes' | 'intakeDetail' | 'engagements' | 'matters' | 'contacts' | 'invoices' | 'invoiceCreate' | 'invoiceEdit' | 'invoiceDetail' | 'reports' | 'settings';

/**
 * LayoutMode controls how ChatContainer renders its shell.
 * - 'desktop' – practice dashboard, full chrome
 * - 'mobile'  – authenticated client on phone
 * - 'widget'  – embedded in 3rd-party site via iframe (?v=widget)
 */
export type LayoutMode = 'widget' | 'mobile' | 'desktop';

// ─── component ────────────────────────────────────────────────────────────────

export function MainApp({
  practiceId,
  practiceConfig,
  isPracticeView,
  workspace,
  chatContent,
  routeConversationId,
  routeInvoiceId,
  routeIntakeId: _routeIntakeId,
  routeSettingsView,
  routeSettingsAppId,
  publicPracticeSlug,
  workspaceView,
  clientPracticeSlug,
  practiceSlug,
  isWidget = false,
}: {
  practiceId: string;
  practiceConfig: UIPracticeConfig;
  isPracticeView: boolean;
  workspace: WorkspaceType;
  chatContent?: ComponentChildren;
  routeConversationId?: string;
  routeInvoiceId?: string;
  routeIntakeId?: string;
  routeSettingsView?: SettingsView;
  routeSettingsAppId?: string;
  publicPracticeSlug?: string;
  workspaceView?: WorkspaceView;
  clientPracticeSlug?: string;
  practiceSlug?: string;
  isWidget?: boolean;
}) {
  // ── UI state ───────────────────────────────────────────────────────────────
  const [clearInputTrigger, setClearInputTrigger] = useState(0);
  const [isPaymentAuthPromptOpen, setIsPaymentAuthPromptOpen] = useState(false);

  const { navigate } = useNavigation();
  const location = useLocation();
  const { showError, showInfo } = useToastContext();
  const showErrorRef = useRef(showError);
  useEffect(() => { showErrorRef.current = showError; }, [showError]);

  // ── practice data ──────────────────────────────────────────────────────────
  const { currentPractice } = usePracticeManagement({
    autoFetchPractices: workspace !== 'public',
    practiceSlug: workspace === 'practice'
      ? (practiceSlug ?? null)
      : workspace === 'client'
        ? (clientPracticeSlug ?? null)
        : null,
  });

  // ── workspace routing — single source of truth ────────────────────────────
  const { session, isPending: sessionIsPending, isAnonymous } = useSessionContext();
  const { activeMemberRole } = useMemberRoleContext();

  // ── practice details (accent color) ───────────────────────────────────────
  // For the public workspace, prefer practiceConfig.id (UUID) as the store key.
  // usePracticeConfig already seeds practiceDetailsStore under both the slug AND
  // the UUID (see usePracticeConfig lines 151-155), so using the UUID here gives
  // usePracticeDetails an instant cache hit and eliminates the second network
  // request on widget load.
  //
  // Fall-back chain: UUID from config → raw slug prop → config slug → practiceId.
  // For client/practice workspaces the UUID practiceId is already correct.
  const practiceDetailsId = (workspace === 'public')
    ? (practiceConfig.id ?? publicPracticeSlug ?? practiceConfig.slug ?? practiceId ?? null)
    : (practiceConfig.id ?? practiceId);

  // Slug hint is still forwarded so usePracticeDetails can use the public
  // endpoint as a fallback when the store has no entry for this key.
  const practiceDetailsSlug = (workspace === 'public')
    ? (publicPracticeSlug ?? practiceConfig.slug ?? null)
    : (workspace === 'client')
      ? clientPracticeSlug
      : (currentPractice?.slug ?? practiceConfig.slug ?? null);

  const allowPublicPracticeDetails = workspace === 'public' || workspace === 'client';
  const {
    details: practiceDetails,
    fetchDetails: fetchPracticeDetails,
    hasDetails: hasPracticeDetails
  } = usePracticeDetails(practiceDetailsId, practiceDetailsSlug, allowPublicPracticeDetails);

  useEffect(() => {
    if (!practiceDetailsId || hasPracticeDetails) return;
    void fetchPracticeDetails();
  }, [fetchPracticeDetails, hasPracticeDetails, practiceDetailsId]);

  const {
    isPublicWorkspace,
    isPracticeWorkspace,
    isClientWorkspace,
    effectivePracticeId,
    resolvedPracticeSlug,
    resolvedPublicPracticeSlug,
    resolvedClientPracticeSlug,
    resolvedPracticeName,
    resolvedPracticeLogo,
    resolvedAccentColor: fullAccentColor,
    normalizedRouteConversationId,
    conversationsBasePath,
    conversationBackPath,
    practiceMattersPath,
    practiceContactsPath,
    layoutMode,
  } = useWorkspaceRouting({
    practiceId,
    practiceConfig,
    workspace,
    publicPracticeSlug,
    clientPracticeSlug,
    practiceSlug,
    routeConversationId,
    isWidget,
    currentPractice,
    practiceDetails,
    activeMemberRole,
    session,
  });
  const clientMattersPath = useMemo(() => {
    if (!isClientWorkspace) return null;
    const slug = clientPracticeSlug ?? resolvedClientPracticeSlug;
    if (!slug) return null;
    return `/client/${encodeURIComponent(slug)}/matters`;
  }, [clientPracticeSlug, isClientWorkspace, resolvedClientPracticeSlug]);
  const practiceInvoicesPath = useMemo(() => {
    if (!isPracticeWorkspace) return null;
    const slug = resolvedPracticeSlug;
    if (!slug) return null;
    return `/practice/${encodeURIComponent(slug)}/invoices`;
  }, [isPracticeWorkspace, resolvedPracticeSlug]);
  const practiceIntakesPath = useMemo(() => {
    if (!isPracticeWorkspace) return null;
    const slug = resolvedPracticeSlug;
    if (!slug) return null;
    return `/practice/${encodeURIComponent(slug)}/intakes`;
  }, [isPracticeWorkspace, resolvedPracticeSlug]);

  const practiceEngagementsPath = useMemo(() => {
    if (!isPracticeWorkspace) return null;
    const slug = resolvedPracticeSlug;
    if (!slug) return null;
    return `/practice/${encodeURIComponent(slug)}/engagements`;
  }, [isPracticeWorkspace, resolvedPracticeSlug]);

  const isAuthenticatedWorkspace = isPracticeWorkspace || isClientWorkspace;
  const returnToPath = location.url.startsWith('/') ? location.url : `/${location.url.replace(/^\/+/, '')}`;

  useEffect(() => {
    initializeAccentColor(fullAccentColor);
  }, [fullAccentColor]);

  const handleSetupError = useCallback((msg: string) => {
    showErrorRef.current?.(msg);
  }, []);

  // ── conversation setup ─────────────────────────────────────────────────────
  const {
    conversationId: setupConversationId,
    setConversationId: _setConversationId,
    isCreatingConversation,
    ensureConversation,
    applyConversationMode,
  } = useConversationSetup({
    practiceId,
    workspace,
    routeConversationId: normalizedRouteConversationId,
    session,
    sessionIsPending,
    isPracticeWorkspace,
    isPublicWorkspace,
    onModeChange: () => {},
    onError: handleSetupError,
  });

  const activeConversationId = normalizedRouteConversationId ?? setupConversationId;
  const shouldEnableConversationTransport = workspace === 'public'
    || workspaceView === 'conversation'
    || workspaceView === 'list'
    || workspaceView === 'home';
  const liveConversationId = shouldEnableConversationTransport ? activeConversationId : null;

  // ── message handling ───────────────────────────────────────────────────────
  const handleMessageError = useCallback((error: unknown, _context?: Record<string, unknown>) => {
    let message: string;
    if (typeof error === 'string') {
      message = error;
    } else if (error instanceof Error) {
      message = error.message;
    } else {
      message = 'We hit a snag sending that message.';
    }
    if (message.toLowerCase().includes('chat connection closed')) return;
    console.error('Message handling error:', error);
    showErrorRef.current?.(message || 'We hit a snag sending that message.');
  }, []);



  const messageHandling = useMessageHandling({
    enabled: shouldEnableConversationTransport,
    practiceId: effectivePracticeId,
    practiceSlug: resolvedPracticeSlug ?? undefined,
    conversationId: liveConversationId ?? undefined,
    onEnsureConversation: () => ensureConversation(),
    linkAnonymousConversationOnLoad: isPublicWorkspace,
    onError: handleMessageError,
  });

  const {
    messages, conversationMetadata, sendMessage, addMessage: _addMessage, clearMessages,
    requestMessageReactions, toggleMessageReaction,
    intakeStatus, intakeConversationState, handleIntakeCtaResponse,
    slimContactDraft, handleSlimFormContinue, handleBuildBrief, handleSubmitNow, handleFinalizeSubmit: _handleFinalizeSubmit,
    startConsultFlow, updateConversationMetadata: _updateConversationMetadata,
    ingestServerMessages, messagesReady, hasMoreMessages, isLoadingMoreMessages,
    loadMoreMessages, isSocketReady, applyIntakeFields,
  } = messageHandling;

  const conversationMode = conversationMetadata?.mode ?? null;



  useEffect(() => { clearMessages(); }, [practiceId, clearMessages]);

  // ── optional auth prompt ───────────────────────────────────────────────────
  const shouldShowAuthPrompt = Boolean(isAnonymous && isPaymentAuthPromptOpen);
  const handlePaymentAuthRequest = useCallback(() => {
    setIsPaymentAuthPromptOpen(true);
  }, []);

  const handleAuthPromptClose = useCallback(() => {
    if (isPaymentAuthPromptOpen) setIsPaymentAuthPromptOpen(false);
  }, [isPaymentAuthPromptOpen]);

  const handleAuthPromptSuccess = useCallback(async () => {
    if (isPaymentAuthPromptOpen) setIsPaymentAuthPromptOpen(false);
  }, [isPaymentAuthPromptOpen]);

  const handleStrengthenCase = useCallback(async () => {
    try {
      // Clear ctaShown so the submit button disappears during enrichment.
      await applyIntakeFields({ enrichmentMode: true, ctaShown: false });
      await sendMessage('I want to provide more details to strengthen my case.', []);
    } catch (err) {
      console.error('Failed to start strengthen case flow', err);
    }
  }, [applyIntakeFields, sendMessage]);

  // ── conversation mode selection ────────────────────────────────────────────
  const handleModeSelection = useCallback(async (
    nextMode: ConversationMode,
    source: string = 'home_cta'
  ) => {
    const currentConversationId = activeConversationId ?? await ensureConversation();
    if (!currentConversationId || !practiceId) return;
    await applyConversationMode(nextMode, currentConversationId, source as 'intro_gate' | 'composer_footer' | 'home_cta' | 'chat_intro' | 'slim_form_dismiss' | 'chat_selector', startConsultFlow);
  }, [activeConversationId, applyConversationMode, ensureConversation, practiceId, startConsultFlow]);


  const handleSlimFormDismiss = useCallback(async () => {
    if (conversationMode !== 'REQUEST_CONSULTATION') return;
    await handleModeSelection('ASK_QUESTION', 'slim_form_dismiss');
  }, [conversationMode, handleModeSelection]);

  const handleStartNewConversation = useCallback(async (
    nextMode: ConversationMode,
    preferredConversationId?: string,
    options?: { forceCreate?: boolean; silentSessionNotReady?: boolean }
  ): Promise<string> => {
    try {
      if (!practiceId) throw new Error('Practice context is required');

      // ── Reuse logic ────────────────────────────────────────────────────────
      // Both ASK_QUESTION and REQUEST_CONSULTATION reuse a provided conversation
      // when one exists.  forceCreate=true is only passed when the caller
      // explicitly wants a fresh thread (e.g. "New conversation" button).
      if (!options?.forceCreate) {
        const reusableConversationId = preferredConversationId ?? activeConversationId ?? null;
        if (reusableConversationId) {
          await applyConversationMode(nextMode, reusableConversationId, 'home_cta', startConsultFlow);
          return reusableConversationId;
        }
      }

      // ── Create new conversation ─────────────────────────────────────────────
      // ensureConversation waits for the session to settle before creating.
      const newConversationId = await ensureConversation();

      if (!newConversationId) {
        // Practice workspace or other condition where creation is not applicable.
        if (!options?.silentSessionNotReady) {
          showErrorRef.current?.('Unable to start a conversation. Please try again in a moment.');
        }
        return Promise.reject(new SessionNotReadyError());
      }

      await applyConversationMode(nextMode, newConversationId, 'home_cta', startConsultFlow);
      return newConversationId;
    } catch (error) {
      console.warn('[MainApp] Failed to start new conversation', error);
      throw error;
    }
  }, [activeConversationId, applyConversationMode, ensureConversation, practiceId, startConsultFlow]);

  // ── send message ───────────────────────────────────────────────────────────
  const handleSendMessage = useCallback(async (
    message: string,
    attachments: FileAttachment[] = [],
    replyToMessageId?: string | null,
    options?: { mentionedUserIds?: string[] }
  ) => {
    await sendMessage(message, attachments, replyToMessageId ?? null, {
      mentionedUserIds: options?.mentionedUserIds,
      suppressAi: isPracticeWorkspace,
    });
  }, [sendMessage, isPracticeWorkspace]);

  const { mentionCandidates } = useMentionCandidates(practiceId, liveConversationId);

  // ── file upload ────────────────────────────────────────────────────────────
  const {
    previewFiles,
    uploadingFiles,
    isReadyToUpload,
    handleFileSelect,
    handleCameraCapture,
    removePreviewFile,
    clearPreviewFiles,
    cancelUpload,
    handleMediaCapture,
    isRecording,
    setIsRecording,
  } = useFileUpload({
    practiceId: effectivePracticeId ?? practiceId,
    conversationId: activeConversationId ?? undefined,
    enabled: features.enableFileAttachments && isAuthenticatedWorkspace,
  });
  const isDragging = features.enableFileAttachments && isAuthenticatedWorkspace
    ? uploadingFiles.length > 0 || previewFiles.length > 0
    : false;

  // ── welcome modals ─────────────────────────────────────────────────────────
  const { shouldShow: shouldShowWelcome, markAsShown: markWelcomeAsShown } = useWelcomeDialog({ enabled: workspace !== 'public' });
  const showWelcomeDialog = shouldShowWelcome && workspace !== 'public';

  const handleWelcomeComplete = async () => { await markWelcomeAsShown(); };
  const handleWelcomeClose = async () => { await markWelcomeAsShown(); };

  // ── invite link handling ───────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const inviteLink = readPendingPracticeInviteLink();
    if (!inviteLink) return;
    try {
      const resolved = new URL(inviteLink, window.location.origin);
      if (resolved.origin === window.location.origin) {
        navigate(`${resolved.pathname}${resolved.search}${resolved.hash}`);
        clearPendingPracticeInviteLink();
        return;
      }
      const opened = window.open(resolved.toString(), '_blank', 'noopener');
      if (opened) { clearPendingPracticeInviteLink(); return; }
    } catch (err) { console.warn('[Invite] Failed to navigate to invite link', err); }
    showInfo('Join your practice', 'Open your invite link to finish joining the practice.');
  }, [navigate, showInfo]);

  // ── keyboard & scroll ──────────────────────────────────────────────────────
  const handleEscape = useCallback(() => {
    if (previewFiles.length > 0) { clearPreviewFiles(); setClearInputTrigger(prev => prev + 1); }
  }, [previewFiles.length, clearPreviewFiles]);

  const handleFocusInput = useCallback(() => {
    (document.querySelector('.message-input') as HTMLTextAreaElement | null)?.focus();
  }, []);

  useEffect(() => {
    const cleanup = setupGlobalKeyboardListeners({ onEscape: handleEscape, onSubmit: () => {}, onFocusInput: handleFocusInput });
    return () => { cleanup?.(); };
  }, [handleEscape, handleFocusInput]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const messageList = document.querySelector('.message-list');
    if (!messageList) return;
    let scrollTimer: number | null = null;
    const handleScroll = () => {
      messageList.classList.add('scrolling');
      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => { messageList.classList.remove('scrolling'); }, 1000);
    };
    messageList.addEventListener('scroll', handleScroll);
    return () => { messageList.removeEventListener('scroll', handleScroll); if (scrollTimer) clearTimeout(scrollTimer); };
  }, []);

  // ── media capture ──────────────────────────────────────────────────────────
  // ── conversation header ────────────────────────────────────────────────────

  const filteredMessagesForHeader = useMemo(() => {
    const base = messages.filter((message) => message.metadata?.systemMessageKey !== 'ask_question_help');
    const hasNonSystem = base.some((message) => message.role !== 'system');
    return hasNonSystem ? base.filter((message) => message.metadata?.systemMessageKey !== 'intro') : base;
  }, [messages]);

  const conversationHeaderActiveLabel = useMemo(() => {
    if (isSocketReady) return 'Active';
    const lastTimestamp = [...filteredMessagesForHeader].reverse().find((message) => typeof message.timestamp === 'number')?.timestamp;
    if (!lastTimestamp) return 'Inactive';
    const relative = formatRelativeTime(new Date(lastTimestamp));
    return relative ? `Active ${relative}` : 'Inactive';
  }, [filteredMessagesForHeader, isSocketReady]);
  const conversationCaseTitle = useMemo(() => (
    resolveConversationCaseTitle(
      conversationMetadata ?? null,
      resolveConversationDisplayTitle(conversationMetadata ?? null, resolvedPracticeName)
    )
  ), [conversationMetadata, resolvedPracticeName]);
  const conversationContactName = useMemo(() => (
    resolveConversationContactName(conversationMetadata ?? null)
  ), [conversationMetadata]);

  const isConsultConversation = useMemo(
    () => conversationMode === 'REQUEST_CONSULTATION'
      || Boolean(resolveConsultationState(conversationMetadata))
      || Boolean(
        slimContactDraft?.name
        || slimContactDraft?.email
        || slimContactDraft?.phone
        || intakeStatus?.intakeUuid
        || intakeStatus?.step !== 'contact_form_slim'
        || intakeConversationState?.ctaShown
        || isIntakeReadyForSubmission(intakeConversationState)
        || intakeConversationState?.description
        || intakeConversationState?.opposingParty
        || intakeConversationState?.city
        || intakeConversationState?.state
        || intakeConversationState?.desiredOutcome
      ),
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
        onClick={() => {
          if (typeof window === 'undefined') return;
          window.dispatchEvent(new CustomEvent('workspace:open-inspector'));
        }}
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

  const conversationHeaderContent = useMemo(() => {
    if (!conversationsBasePath || !activeConversationId) return undefined;
    const showConversationBack = shouldShowWorkspaceDetailBack(layoutMode, Boolean(conversationBackPath));
    return (
      <DetailHeader
        title={conversationCaseTitle}
        subtitle={conversationHeaderActiveLabel}
        showBack={showConversationBack}
        onBack={showConversationBack ? () => navigate(conversationBackPath) : undefined}
        actions={conversationStrengthAction}
        onInspector={() => {
          if (typeof window === 'undefined') return;
          window.dispatchEvent(new CustomEvent('workspace:open-inspector'));
        }}
        className="workspace-conversation-header"
      />
    );
  }, [
    activeConversationId, conversationBackPath, conversationsBasePath,
    conversationCaseTitle, conversationHeaderActiveLabel, conversationStrengthAction,
    layoutMode, navigate,
  ]);
  const showWorkspaceDetailBack = useMemo(
    () => shouldShowWorkspaceDetailBack(layoutMode),
    [layoutMode]
  );
  const showPracticeInvoiceDetailBack = useMemo(
    () => shouldShowWorkspaceDetailBack(layoutMode, Boolean(resolvedPracticeSlug)),
    [layoutMode, resolvedPracticeSlug]
  );
  const showClientInvoiceDetailBack = useMemo(
    () => shouldShowWorkspaceDetailBack(layoutMode, Boolean((clientPracticeSlug ?? resolvedClientPracticeSlug) ?? null)),
    [clientPracticeSlug, layoutMode, resolvedClientPracticeSlug]
  );

  // ── system messages ────────────────────────────────────────────────────────
  useConversationSystemMessages({
    conversationId: liveConversationId,
    practiceId: effectivePracticeId,
    ingestServerMessages,
  });

  // ── derived layout flags ───────────────────────────────────────────────────
  const isConversationReady = Boolean(activeConversationId && !isCreatingConversation);
  const hasAnonymousPublicChatContext = Boolean(
    isPublicWorkspace && activeConversationId && effectivePracticeId && !sessionIsPending
  );
  const isAuthReady = !sessionIsPending && (Boolean(session?.user) || hasAnonymousPublicChatContext);
  const isSessionReady = isConversationReady && isAuthReady;
  const effectiveIsSocketReady = isConversationReady && isAuthReady ? isSocketReady : false;
  const isComposerDisabled = isPublicWorkspace && !conversationMode;
  const isChatReady = isSessionReady && effectiveIsSocketReady && !isComposerDisabled;
  const canChat = Boolean(practiceId) && (!isPracticeWorkspace ? Boolean(isPracticeView) : Boolean(activeConversationId));
  const shouldShowChatPlaceholder = workspace !== 'public' && !activeConversationId;

  // ── chat panel ─────────────────────────────────────────────────────────────
  const chatPanel = chatContent ?? (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {shouldShowChatPlaceholder ? (
        <div className="flex-1 flex items-center justify-center text-sm text-input-placeholder">
          {isPracticeWorkspace
            ? 'Select a conversation to view the thread.'
            : 'Open a practice link to start chatting.'}
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          <ChatContainer
            messages={messages}
            conversationTitle={resolveConversationDisplayTitle(
              conversationMetadata ?? null,
              conversationMetadata?.title ?? ''
            )}
            conversationContactName={conversationContactName}
            viewerContext={isPracticeWorkspace ? 'practice' : isClientWorkspace ? 'client' : 'public'}
            onSendMessage={handleSendMessage}
            conversationMode={conversationMode}
            onSelectMode={(mode, source) => { void handleModeSelection(mode, source); }}
            onToggleReaction={features.enableMessageReactions ? toggleMessageReaction : undefined}
            onRequestReactions={requestMessageReactions}
            isPublicWorkspace={isPublicWorkspace}
            messagesReady={messagesReady}
            headerContent={conversationHeaderContent}
            onOpenSidebar={() => {
              if (typeof window === 'undefined') return;
              window.dispatchEvent(new CustomEvent('workspace:open-inspector'));
            }}
            heightClassName={layoutMode === 'desktop' ? undefined : 'h-full'}
            useFrame={layoutMode === 'desktop'}
            layoutMode={layoutMode}
            practiceConfig={{
              name: resolvedPracticeName,
              profileImage: resolvedPracticeLogo,
              practiceId,
              slug: resolvedPracticeSlug,
            }}
            practiceId={practiceId}
            previewFiles={previewFiles}
            uploadingFiles={uploadingFiles}
            removePreviewFile={removePreviewFile}
            clearPreviewFiles={clearPreviewFiles}
            handleCameraCapture={handleCameraCapture}
            handleFileSelect={handleFileSelect}
            cancelUpload={cancelUpload}
            handleMediaCapture={handleMediaCapture}
            isRecording={isRecording}
            setIsRecording={setIsRecording}
            clearInput={clearInputTrigger}
            isReadyToUpload={isReadyToUpload}
            isReady={isChatReady}

            isAnonymousUser={isAnonymous}
            canChat={canChat}
            hasMoreMessages={hasMoreMessages}
            isLoadingMoreMessages={isLoadingMoreMessages}
            onLoadMoreMessages={loadMoreMessages}
            showAuthPrompt={shouldShowAuthPrompt}
            onAuthPromptRequest={isAnonymous ? handlePaymentAuthRequest : undefined}
            onAuthPromptClose={handleAuthPromptClose}
            onAuthPromptSuccess={handleAuthPromptSuccess}
            mentionCandidates={mentionCandidates}
          />
        </div>
      )}
    </div>
  );

  // ── workspace view (route-driven) ─────────────────────────────────────────
  const resolvedWorkspaceView = useMemo<WorkspaceView>(() => {
    const requested = workspaceView ?? (isPublicWorkspace ? 'conversation' : 'home');
    if ((isClientWorkspace || isPracticeWorkspace) && requested === 'conversation' && !activeConversationId) {
      return 'list';
    }
    return requested;
  }, [activeConversationId, isClientWorkspace, isPracticeWorkspace, isPublicWorkspace, workspaceView]);



  const workspacePage = (
    <WorkspacePage
      view={resolvedWorkspaceView}
      practiceId={effectivePracticeId ?? practiceId}
      practiceSlug={
        isPracticeWorkspace
          ? (resolvedPracticeSlug ?? null)
          : isClientWorkspace
            ? (clientPracticeSlug ?? resolvedClientPracticeSlug)
            : resolvedPublicPracticeSlug
      }
      routeInvoiceId={routeInvoiceId ?? null}
      practiceName={resolvedPracticeName}
      practiceLogo={resolvedPracticeLogo}
      messages={messages}
      layoutMode={layoutMode}
      workspace={workspace}
      settingsView={routeSettingsView}
      settingsAppId={routeSettingsAppId}
      onStartNewConversation={handleStartNewConversation}
      activeConversationId={activeConversationId}
      intakeConversationState={intakeConversationState}
      intakeStatus={intakeStatus}
      onIntakeFieldsChange={(patch, options) => {
        const payload: Record<string, unknown> = {};
        Object.entries(patch).forEach(([key, value]) => {
          if (value !== null) payload[key] = value;
        });
        return applyIntakeFields(payload, options);
      }}
      practiceDetails={practiceDetails}
      chatView={chatPanel}
      mattersView={
        isPracticeWorkspace
          ? (practiceMattersPath
            ? (statusFilter, prefetchData, onDetailInspector, detailInspectorOpen, detailHeaderLeadingAction) => (
              <LazyRouteBoundary>
                <PracticeMattersPage
                  basePath={practiceMattersPath}
                  practiceId={effectivePracticeId ?? practiceId}
                  renderMode={layoutMode === 'desktop' ? 'detailOnly' : 'full'}
                  statusFilter={statusFilter}
                  prefetchedItems={prefetchData?.mattersData?.items}
                  prefetchedLoading={prefetchData?.mattersData?.isLoading}
                  prefetchedError={prefetchData?.mattersData?.error}
                  onRefetchList={prefetchData?.mattersData?.refetch}
                  onDetailInspector={onDetailInspector}
                  detailInspectorOpen={detailInspectorOpen}
                  detailHeaderLeadingAction={detailHeaderLeadingAction}
                  showDetailBackButton={showWorkspaceDetailBack}
                />
              </LazyRouteBoundary>
            )
            : null)
          : isClientWorkspace
            ? (clientMattersPath
              ? (statusFilter, prefetchData, onDetailInspector, detailInspectorOpen) => (
                <LazyRouteBoundary>
                  <ClientMattersPage
                    basePath={clientMattersPath}
                    practiceId={effectivePracticeId ?? practiceId}
                    renderMode={layoutMode === 'desktop' ? 'detailOnly' : 'full'}
                    statusFilter={statusFilter}
                    prefetchedItems={prefetchData?.mattersData?.items}
                    prefetchedLoading={prefetchData?.mattersData?.isLoading}
                    prefetchedError={prefetchData?.mattersData?.error}
                    onRefetchList={prefetchData?.mattersData?.refetch}
                    onDetailInspector={onDetailInspector}
                    detailInspectorOpen={detailInspectorOpen}
                    showDetailBackButton={showWorkspaceDetailBack}
                  />
                </LazyRouteBoundary>
              )
              : null)
            : undefined
      }
      mattersListContent={
        isPracticeWorkspace && layoutMode === 'desktop' && practiceMattersPath
          ? (statusFilter, prefetchData) => (
            <LazyRouteBoundary>
              <PracticeMattersPage
                basePath={practiceMattersPath}
                practiceId={effectivePracticeId ?? practiceId}
                renderMode="listOnly"
                statusFilter={statusFilter}
                prefetchedItems={prefetchData?.mattersData?.items}
                prefetchedLoading={prefetchData?.mattersData?.isLoading}
                prefetchedError={prefetchData?.mattersData?.error}
                onRefetchList={prefetchData?.mattersData?.refetch}
                showDetailBackButton={showWorkspaceDetailBack}
              />
            </LazyRouteBoundary>
          )
          : isClientWorkspace && layoutMode === 'desktop' && clientMattersPath
            ? (statusFilter, prefetchData) => (
              <LazyRouteBoundary>
                <ClientMattersPage
                  basePath={clientMattersPath}
                  practiceId={effectivePracticeId ?? practiceId}
                  renderMode="listOnly"
                  statusFilter={statusFilter}
                  prefetchedItems={prefetchData?.mattersData?.items}
                  prefetchedLoading={prefetchData?.mattersData?.isLoading}
                  prefetchedError={prefetchData?.mattersData?.error}
                  onRefetchList={prefetchData?.mattersData?.refetch}
                  showDetailBackButton={showWorkspaceDetailBack}
                />
              </LazyRouteBoundary>
            )
          : undefined
      }
      contactsView={isPracticeWorkspace && practiceContactsPath != null
        ? (statusFilter, prefetchData, onDetailInspector, detailInspectorOpen, detailHeaderLeadingAction) => (
          <LazyRouteBoundary>
            <PracticeContactsPage
              practiceId={effectivePracticeId ?? practiceId}
              basePath={practiceContactsPath}
              renderMode={layoutMode === 'desktop' ? 'detailOnly' : 'full'}
              statusFilter={statusFilter}
              prefetchedItems={prefetchData?.contactsData?.items}
              prefetchedLoading={prefetchData?.contactsData?.isLoading}
              prefetchedError={prefetchData?.contactsData?.error}
              onRefetchList={prefetchData?.contactsData?.refetch}

              detailHeaderLeadingAction={detailHeaderLeadingAction}
              showDetailBackButton={showWorkspaceDetailBack}
            />
          </LazyRouteBoundary>
        )
        : undefined}
      contactsListContent={isPracticeWorkspace && layoutMode === 'desktop' && practiceContactsPath != null
        ? (statusFilter, prefetchData) => (
          <LazyRouteBoundary>
            <PracticeContactsPage
              practiceId={effectivePracticeId ?? practiceId}
              basePath={practiceContactsPath}
              renderMode="listOnly"
              statusFilter={statusFilter}
              prefetchedItems={prefetchData?.contactsData?.items}
              prefetchedLoading={prefetchData?.contactsData?.isLoading}
              prefetchedError={prefetchData?.contactsData?.error}
              onRefetchList={prefetchData?.contactsData?.refetch}
              showDetailBackButton={showWorkspaceDetailBack}
            />
          </LazyRouteBoundary>
        )
        : undefined}
      invoicesView={
        isPracticeWorkspace
          ? (statusFilter, onDetailInspector, detailInspectorOpen, detailHeaderLeadingAction) => (
            <LazyRouteBoundary>
              {resolvedWorkspaceView === 'invoiceDetail' ? (
                <PracticeInvoiceDetailPage
                  practiceId={effectivePracticeId ?? practiceId}
                  practiceSlug={resolvedPracticeSlug ?? null}
                  invoiceId={routeInvoiceId ?? null}
                  leadingAction={detailHeaderLeadingAction}
                  onInspector={onDetailInspector}
                  inspectorOpen={detailInspectorOpen}
                  showBack={showPracticeInvoiceDetailBack}
                />
              ) : (
                <PracticeInvoicesPage
                  practiceId={effectivePracticeId ?? practiceId}
                  practiceSlug={resolvedPracticeSlug ?? null}
                  statusFilter={statusFilter}
                  renderMode="full"
                  onCreateInvoice={practiceInvoicesPath ? () => navigate(`${practiceInvoicesPath}/new?returnTo=${encodeURIComponent(returnToPath)}`) : undefined}
                />
              )}
            </LazyRouteBoundary>
          )
          : isClientWorkspace
            ? (statusFilter, onDetailInspector, detailInspectorOpen) => (
              <LazyRouteBoundary>
                {resolvedWorkspaceView === 'invoiceDetail' ? (
                <ClientInvoiceDetailPage
                    practiceId={effectivePracticeId ?? practiceId}
                    practiceSlug={(clientPracticeSlug ?? resolvedClientPracticeSlug) ?? null}
                    invoiceId={routeInvoiceId ?? null}
                    onInspector={onDetailInspector}
                    inspectorOpen={detailInspectorOpen}
                    showBack={showClientInvoiceDetailBack}
                  />
                ) : (
                  <ClientInvoicesPage
                    key={`${effectivePracticeId}-full-${JSON.stringify(statusFilter)}`}
                    practiceId={effectivePracticeId ?? practiceId}
                    practiceSlug={(clientPracticeSlug ?? resolvedClientPracticeSlug) ?? null}
                    statusFilter={statusFilter}
                    renderMode="full"
                  />
                )}
              </LazyRouteBoundary>
            )
            : undefined
      }
      invoicesListContent={
        (isPracticeWorkspace || isClientWorkspace) && layoutMode === 'desktop' && resolvedWorkspaceView === 'invoiceDetail'
          ? (statusFilter) => (
            <LazyRouteBoundary>
              {isPracticeWorkspace ? (
                <PracticeInvoicesPage
                  practiceId={effectivePracticeId ?? practiceId}
                  practiceSlug={resolvedPracticeSlug ?? null}
                  statusFilter={statusFilter}
                  renderMode="listOnly"
                  onCreateInvoice={practiceInvoicesPath ? () => navigate(`${practiceInvoicesPath}/new?returnTo=${encodeURIComponent(returnToPath)}`) : undefined}
                />
              ) : (
                <ClientInvoicesPage
                  key={`${effectivePracticeId}-listOnly-${JSON.stringify(statusFilter)}`}
                  practiceId={effectivePracticeId ?? practiceId}
                  practiceSlug={(clientPracticeSlug ?? resolvedClientPracticeSlug) ?? null}
                  statusFilter={statusFilter}
                  renderMode="listOnly"
                />
              )}
            </LazyRouteBoundary>
          )
          : undefined
      }
      reportsView={
        isPracticeWorkspace
          ? (reportTitle) => (
            <LazyRouteBoundary>
              <PracticeReportsPage title={reportTitle} />
            </LazyRouteBoundary>
          )
          : undefined
      }
      intakesView={
        isPracticeWorkspace
          ? (activeFilter) => (
            <LazyRouteBoundary>
              <IntakesPage
                practiceId={effectivePracticeId ?? practiceId}
                activeTriageFilter={activeFilter}
                basePath={practiceIntakesPath ?? '/practice/intakes'}
                conversationsBasePath={conversationsBasePath}
                practiceName={resolvedPracticeName}
                practiceLogo={resolvedPracticeLogo}
              />
            </LazyRouteBoundary>
          )
          : undefined
      }
      engagementsView={
        isPracticeWorkspace
          ? () => (
            <LazyRouteBoundary>
              <EngagementsPage
                practiceId={effectivePracticeId ?? practiceId}
                basePath={practiceEngagementsPath ?? '/practice/engagements'}
                conversationsBasePath={conversationsBasePath}
                practiceName={resolvedPracticeName}
                practiceLogo={resolvedPracticeLogo}
              />
            </LazyRouteBoundary>
          )
          : undefined
      }
      primaryCreateAction={
        resolvedWorkspaceView === 'matters' && isPracticeWorkspace && practiceMattersPath
          ? {
              label: 'New Matter',
              onClick: () => navigate(`${practiceMattersPath}/new?returnTo=${encodeURIComponent(returnToPath)}`),
              icon: PlusIcon,
            }
          : resolvedWorkspaceView === 'invoices' && isPracticeWorkspace && practiceInvoicesPath
            ? {
              label: 'New Invoice',
              onClick: () => navigate(`${practiceInvoicesPath}/new?returnTo=${encodeURIComponent(returnToPath)}`),
              icon: PlusIcon,
            }
          : resolvedWorkspaceView === 'contacts' && isPracticeWorkspace && practiceContactsPath
            ? {
                label: 'New Contact',
                onClick: () => navigate(`${practiceContactsPath}/new?returnTo=${encodeURIComponent(returnToPath)}`),
                icon: PlusIcon,
              }
            : null
      }
    />
  );

  // ── render ─────────────────────────────────────────────────────────────────
  const rootClassName = isWidget ? 'h-full w-full overflow-hidden' : 'min-h-dvh w-full';
  const intakeProviderValue = {
    intakeStatus,
    intakeConversationState,
    onIntakeCtaResponse: handleIntakeCtaResponse,
    onSubmitNow: handleSubmitNow,
    onBuildBrief: handleBuildBrief,
    onStrengthenCase: handleStrengthenCase,
    slimContactDraft,
    onSlimFormContinue: handleSlimFormContinue,
    onSlimFormDismiss: handleSlimFormDismiss,
    isPublicWorkspace,
  };

  const routePracticeContextValue = {
    practiceId: effectivePracticeId ?? null,
    practiceSlug: workspace === 'practice'
      ? (practiceSlug ?? null)
      : workspace === 'client'
        ? (clientPracticeSlug ?? null)
        : (resolvedPublicPracticeSlug ?? null),
    workspace,
  } as const;

  return (
    <>
      {!isWidget && <DragDropOverlay isVisible={isDragging} onClose={() => {}} />}
      <IntakeProvider value={intakeProviderValue}>
        <div className={rootClassName}>
          <RoutePracticeProvider value={routePracticeContextValue}>
            {workspacePage}
          </RoutePracticeProvider>
        </div>
      </IntakeProvider>
      {!isWidget && (
        <>
          <WelcomeDialog
            isOpen={showWelcomeDialog}
            onClose={handleWelcomeClose}
            onComplete={handleWelcomeComplete}
            workspace={isPracticeWorkspace ? 'practice' : 'client'}
          />
        </>
      )}
    </>
  );
}
