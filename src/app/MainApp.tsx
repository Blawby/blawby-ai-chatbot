import { useState, useCallback, useRef, useEffect, useMemo } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import ChatContainer from '@/features/chat/components/ChatContainer';
import DragDropOverlay from '@/features/media/components/DragDropOverlay';
import WorkspacePage from '@/features/chat/pages/WorkspacePage';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { RoutePracticeProvider } from '@/shared/contexts/RoutePracticeContext';
import type { UIPracticeConfig } from '@/shared/hooks/usePracticeConfig';
import type { WorkspaceType } from '@/shared/types/workspace';
import { useMessageHandling } from '@/shared/hooks/useMessageHandling';
import { useFileUploadWithContext } from '@/shared/hooks/useFileUpload';
import { useConversationSetup } from '@/shared/hooks/useConversationSetup';
import { useWorkspaceRouting } from '@/shared/hooks/useWorkspaceRouting';
import { setupGlobalKeyboardListeners } from '@/shared/utils/keyboard';
import type { FileAttachment } from '../../worker/types';
import { useNavigation } from '@/shared/utils/navigation';
import WelcomeModal from '@/features/modals/components/WelcomeModal';
import { useWelcomeModal } from '@/features/modals/hooks/useWelcomeModal';
import { getPreferencesCategory, updatePreferencesCategory } from '@/shared/lib/preferencesApi';
import type { OnboardingPreferences } from '@/shared/types/preferences';
import { BusinessWelcomePrompt } from '@/features/onboarding/components/BusinessWelcomePrompt';
import { SessionNotReadyError } from '@/shared/types/errors';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { clearPendingPracticeInviteLink, readPendingPracticeInviteLink } from '@/shared/utils/practiceInvites';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { usePracticeDetails } from '@/shared/hooks/usePracticeDetails';
import { useTranslation } from '@/shared/i18n/hooks';
import type { ConversationMetadata, ConversationMode } from '@/shared/types/conversation';
import { lazy, Suspense } from 'preact/compat';
const PracticeMattersPage = lazy(() => import('@/features/matters/pages/PracticeMattersPage').then(m => ({ default: m.PracticeMattersPage })));
const PracticeClientsPage = lazy(() => import('@/features/clients/pages/PracticeClientsPage').then(m => ({ default: m.PracticeClientsPage })));
const ClientMattersPage = lazy(() => import('@/features/matters/pages/ClientMattersPage').then(m => ({ default: m.ClientMattersPage })));
import { useConversationSystemMessages } from '@/features/chat/hooks/useConversationSystemMessages';
import WorkspaceConversationHeader from '@/features/chat/components/WorkspaceConversationHeader';
import BriefStrengthIndicator from '@/features/chat/components/BriefStrengthIndicator';
import PracticeConversationHeaderMenu from '@/features/chat/components/PracticeConversationHeaderMenu';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
import { initializeAccentColor } from '@/shared/utils/accentColors';

// ─── types ────────────────────────────────────────────────────────────────────

type WorkspaceView = 'home' | 'setup' | 'list' | 'conversation' | 'matters' | 'clients';

/**
 * LayoutMode controls how ChatContainer renders its shell.
 * - 'desktop' – practice dashboard, full chrome
 * - 'mobile'  – authenticated client on phone
 * - 'widget'  – embedded in 3rd-party site via iframe (?v=widget)
 */
export type LayoutMode = 'widget' | 'mobile' | 'desktop';

const WorkspaceSubviewFallback = () => (
  <div className="flex h-full min-h-0 items-center justify-center p-6 text-sm text-input-placeholder">
    Loading...
  </div>
);

// ─── component ────────────────────────────────────────────────────────────────

export function MainApp({
  practiceId,
  practiceConfig,
  isPracticeView,
  workspace,
  chatContent,
  routeConversationId,
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
  publicPracticeSlug?: string;
  workspaceView?: WorkspaceView;
  clientPracticeSlug?: string;
  practiceSlug?: string;
  isWidget?: boolean;
}) {
  // ── UI state ───────────────────────────────────────────────────────────────
  const [clearInputTrigger, setClearInputTrigger] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [showBusinessWelcome, setShowBusinessWelcome] = useState(false);
  const [conversationMode, setConversationMode] = useState<ConversationMode | null>(null);
  const [dismissedIntakeAuthFor, setDismissedIntakeAuthFor] = useState<string | null>(null);
  const [isPaymentAuthPromptOpen, setIsPaymentAuthPromptOpen] = useState(false);

  const { navigate } = useNavigation();
  const { showError, showInfo } = useToastContext();
  const showErrorRef = useRef(showError);
  useEffect(() => { showErrorRef.current = showError; }, [showError]);

  // ── practice data ──────────────────────────────────────────────────────────
  const { currentPractice } = usePracticeManagement({
    autoFetchPractices: workspace !== 'public',
    fetchInvitations: workspace !== 'public',
    practiceSlug: workspace === 'practice'
      ? (practiceSlug ?? null)
      : workspace === 'client'
        ? (clientPracticeSlug ?? null)
        : null,
  });

  // ── workspace routing — single source of truth ────────────────────────────
  const { session, isPending: sessionIsPending, isAnonymous, activeMemberRole, routingClaims } = useSessionContext();

  // ── practice details (accent color, description) ──────────────────────────
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

  const { details: practiceDetails, fetchDetails: fetchPracticeDetails, hasDetails: hasPracticeDetails } = usePracticeDetails(practiceDetailsId, practiceDetailsSlug);

  useEffect(() => {
    if (!practiceDetailsId || hasPracticeDetails) return;
    void fetchPracticeDetails();
  }, [fetchPracticeDetails, hasPracticeDetails, practiceDetailsId]);

  const {
    isPublicWorkspace,
    isPracticeWorkspace,
    isClientWorkspace,
    isAuthenticatedClient,
    effectivePracticeId,
    effectivePracticeSlug,
    resolvedPracticeSlug,
    resolvedPublicPracticeSlug,
    resolvedClientPracticeSlug,
    resolvedPracticeName,
    resolvedPracticeLogo,
    resolvedPracticeDescription: fullDescription,
    resolvedAccentColor: fullAccentColor,
    normalizedRouteConversationId,
    conversationsBasePath,
    conversationBackPath,
    practiceMattersPath,
    conversationResetKey,
    layoutMode,
    canReviewLeads,
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
    routing: routingClaims,
  });

  useEffect(() => {
    initializeAccentColor(fullAccentColor);
  }, [fullAccentColor]);

  // ── reset conversation when practice context changes ───────────────────────
  useEffect(() => {
    setConversationMode(null);
  }, [conversationResetKey]);

  const handleSetupError = useCallback((msg: string) => {
    showErrorRef.current?.(msg);
  }, []);

  // ── conversation setup ─────────────────────────────────────────────────────
  const {
    conversationId: setupConversationId,
    isCreatingConversation,
    createConversation,
    applyConversationMode,
  } = useConversationSetup({
    practiceId,
    workspace,
    routeConversationId: normalizedRouteConversationId,
    session,
    sessionIsPending,
    isPracticeWorkspace,
    isPublicWorkspace,
    onModeChange: setConversationMode,
    onError: handleSetupError,
  });

  const activeConversationId = normalizedRouteConversationId ?? setupConversationId;

  // ── message handling ───────────────────────────────────────────────────────
  const handleMessageError = useCallback((error: string | Error) => {
    const message = typeof error === 'string' ? error : error.message;
    if (message.toLowerCase().includes('chat connection closed')) return;
    console.error('Message handling error:', error);
    showErrorRef.current?.(message || 'We hit a snag sending that message.');
  }, []);

  const handleConversationMetadataUpdated = useCallback((metadata: ConversationMetadata | null) => {
    const persistedMode = metadata?.mode;
    if (
      persistedMode === 'ASK_QUESTION' ||
      persistedMode === 'REQUEST_CONSULTATION' ||
      persistedMode === 'PRACTICE_ONBOARDING'
    ) {
      setConversationMode(persistedMode);
    }
  }, []);

  const messageHandling = useMessageHandling({
    practiceId: effectivePracticeId,
    practiceSlug: resolvedPracticeSlug ?? undefined,
    conversationId: activeConversationId ?? undefined,
    linkAnonymousConversationOnLoad: isPublicWorkspace,
    mode: conversationMode,
    onConversationMetadataUpdated: handleConversationMetadataUpdated,
    onError: handleMessageError,
  });

  const {
    messages, conversationMetadata, sendMessage, addMessage, clearMessages,
    requestMessageReactions, toggleMessageReaction,
    intakeStatus, intakeConversationState, handleIntakeCtaResponse,
    slimContactDraft, handleSlimFormContinue, handleBuildBrief, handleSubmitNow,
    startConsultFlow, updateConversationMetadata: _updateConversationMetadata, isConsultFlowActive,
    ingestServerMessages, messagesReady, hasMoreMessages, isLoadingMoreMessages,
    loadMoreMessages, isSocketReady,
  } = messageHandling;



  useEffect(() => { clearMessages(); }, [practiceId, clearMessages]);

  // ── intake auth prompt ─────────────────────────────────────────────────────
  const intakeUuid = intakeStatus?.intakeUuid ?? null;
  const { t } = useTranslation('common');

  const intakeAuthTarget = useMemo(() => {
    if (!isPublicWorkspace || !intakeUuid) return null;
    if (intakeStatus?.paymentRequired && !intakeStatus?.paymentReceived) return null;
    return intakeUuid;
  }, [intakeUuid, intakeStatus?.paymentReceived, intakeStatus?.paymentRequired, isPublicWorkspace]);

  const shouldShowIntakeAuthPrompt = Boolean(isAnonymous && intakeAuthTarget && dismissedIntakeAuthFor !== intakeAuthTarget);
  const shouldShowAuthPrompt = Boolean(isAnonymous && (shouldShowIntakeAuthPrompt || isPaymentAuthPromptOpen));

  const intakeAuthTitle = t('intake.authTitle');
  const intakeAuthDescription = resolvedPracticeName
    ? t('intake.authDescription', { practice: resolvedPracticeName })
    : t('intake.authDescriptionFallback');

  const awaitingInvitePath = useMemo(() => {
    if (!isPublicWorkspace || !intakeUuid) return null;
    const slug = resolvedPublicPracticeSlug ?? practiceConfig.slug ?? '';
    const params = new URLSearchParams();
    params.set('intakeUuid', intakeUuid);
    if (slug) params.set('practiceSlug', slug);
    if (resolvedPracticeName) params.set('practiceName', resolvedPracticeName);
    if (activeConversationId) params.set('conversationId', activeConversationId);
    return `/auth/awaiting-invite?${params.toString()}`;
  }, [activeConversationId, intakeUuid, isPublicWorkspace, practiceConfig.slug, resolvedPracticeName, resolvedPublicPracticeSlug]);

  const intakePostAuthPath = useMemo(() => {
    if (!isPublicWorkspace) return null;
    if (resolvedPublicPracticeSlug && activeConversationId) {
      return `/public/${encodeURIComponent(resolvedPublicPracticeSlug)}/conversations/${encodeURIComponent(activeConversationId)}`;
    }
    return awaitingInvitePath;
  }, [activeConversationId, awaitingInvitePath, isPublicWorkspace, resolvedPublicPracticeSlug]);

  const handleIntakeAuthSuccess = useCallback(async () => {
    if (!intakePostAuthPath) return;
    if (intakeAuthTarget) setDismissedIntakeAuthFor(intakeAuthTarget);
    navigate(intakePostAuthPath, true);
  }, [intakePostAuthPath, intakeAuthTarget, navigate]);

  const handlePaymentAuthRequest = useCallback(() => { setIsPaymentAuthPromptOpen(true); }, []);

  const handleAuthPromptClose = useCallback(() => {
    if (typeof window !== 'undefined') {
      try { window.sessionStorage.removeItem('intakeAwaitingInvitePath'); } catch { /* noop */ }
    }
    if (isPaymentAuthPromptOpen) setIsPaymentAuthPromptOpen(false);
    if (intakeAuthTarget) setDismissedIntakeAuthFor(intakeAuthTarget);
  }, [intakeAuthTarget, isPaymentAuthPromptOpen]);

  const handleAuthPromptSuccess = useCallback(async () => {
    if (isPaymentAuthPromptOpen) setIsPaymentAuthPromptOpen(false);
    await handleIntakeAuthSuccess();
  }, [handleIntakeAuthSuccess, isPaymentAuthPromptOpen]);

  useEffect(() => {
    if (!intakePostAuthPath || !shouldShowAuthPrompt || typeof window === 'undefined') return;
    try { window.sessionStorage.setItem('intakeAwaitingInvitePath', intakePostAuthPath); } catch { /* noop */ }
  }, [intakePostAuthPath, shouldShowAuthPrompt]);

  // ── conversation mode selection ────────────────────────────────────────────
  const isSelectingRef = useRef(false);

  const handleModeSelection = useCallback(async (
    nextMode: ConversationMode,
    source: 'intro_gate' | 'composer_footer'
  ) => {
    if (isSelectingRef.current) return;
    try {
      isSelectingRef.current = true;
      let currentConversationId = activeConversationId;
      if (!currentConversationId && !isCreatingConversation) currentConversationId = await createConversation();
      if (!currentConversationId || !practiceId) return;
      await applyConversationMode(nextMode, currentConversationId, source, startConsultFlow);
    } catch (error) {
      setConversationMode(null);
      showErrorRef.current?.(error instanceof Error ? error.message : 'Unable to start conversation');
      console.warn('[MainApp] Failed to persist conversation mode selection', error);
    } finally {
      isSelectingRef.current = false;
    }
  }, [applyConversationMode, activeConversationId, createConversation, isCreatingConversation, practiceId, startConsultFlow]);

  const handleSlimFormDismiss = useCallback(async () => {
    if (conversationMode !== 'REQUEST_CONSULTATION') return;
    await handleModeSelection('ASK_QUESTION', 'composer_footer');
  }, [conversationMode, handleModeSelection]);

  const handleStartNewConversation = useCallback(async (
    nextMode: ConversationMode,
    preferredConversationId?: string,
    options?: { forceCreate?: boolean; silentSessionNotReady?: boolean }
  ): Promise<string> => {
    if (isSelectingRef.current) throw new Error('Conversation start already in progress');
    isSelectingRef.current = true;
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
      // createConversation returns null when the session user isn't available yet
      // (anonymous sign-in still in-flight).  Poll briefly so we don't throw an
      // error that leaves the user wondering what happened.
      let newConversationId = await createConversation();
      if (!newConversationId) {
        // Wait up to 3 s in 300 ms increments for the session to settle.
        const deadline = Date.now() + 3000;
        while (!newConversationId && Date.now() < deadline) {
          await new Promise<void>((resolve) => setTimeout(resolve, 300));
          newConversationId = await createConversation();
        }
      }

      if (!newConversationId) {
        // Session still not ready — surface a friendly toast and bail without
        // throwing so the caller can handle gracefully.
        if (!options?.silentSessionNotReady) {
          showErrorRef.current?.('Still setting up your session. Please try again in a moment.');
        }
        return Promise.reject(new SessionNotReadyError());
      }

      await applyConversationMode(nextMode, newConversationId, 'home_cta', startConsultFlow);
      return newConversationId;
    } catch (error) {
      setConversationMode(null);
      console.warn('[MainApp] Failed to start new conversation', error);
      throw error;
    } finally {
      // Always release the lock so subsequent clicks work.
      isSelectingRef.current = false;
    }
  }, [activeConversationId, applyConversationMode, createConversation, practiceId, startConsultFlow]);

  // ── send message ───────────────────────────────────────────────────────────
  const handleSendMessage = useCallback(async (
    message: string,
    attachments: FileAttachment[] = [],
    replyToMessageId?: string | null
  ) => {
    if (!activeConversationId) {
      showErrorRef.current?.('Setting up your conversation. Please try again momentarily.');
      if (!isCreatingConversation) void createConversation();
      return;
    }
    await sendMessage(message, attachments, replyToMessageId ?? null);
  }, [activeConversationId, isCreatingConversation, createConversation, sendMessage]);

  const handleUploadError = useCallback((error: unknown) => {
    console.error('File upload error:', error);
    showErrorRef.current?.(typeof error === 'string' ? error : 'File upload failed. Please try again.');
  }, []);

  // ── file upload ────────────────────────────────────────────────────────────
  const {
    previewFiles, uploadingFiles, isDragging, setIsDragging,
    handleCameraCapture, handleFileSelect, removePreviewFile,
    clearPreviewFiles, cancelUpload, isReadyToUpload,
  } = useFileUploadWithContext({
    conversationId: activeConversationId ?? undefined,
    onError: handleUploadError,
  });

  // ── welcome modals ─────────────────────────────────────────────────────────
  const { shouldShow: shouldShowWelcome, markAsShown: markWelcomeAsShown } = useWelcomeModal({ enabled: workspace !== 'public' });
  const showWelcomeModal = shouldShowWelcome && workspace !== 'public';

  const practiceWelcomeCheckRef = useRef(false);
  useEffect(() => {
    if (workspace !== 'practice') { practiceWelcomeCheckRef.current = false; setShowBusinessWelcome(false); return; }
    if (sessionIsPending || isAnonymous || !session?.user?.id) { setShowBusinessWelcome(false); return; }
    if (practiceWelcomeCheckRef.current) return;
    practiceWelcomeCheckRef.current = true;
    (async () => {
      try {
        const prefs = await getPreferencesCategory<OnboardingPreferences>('onboarding');
        setShowBusinessWelcome(prefs?.completed === true && !prefs?.practice_welcome_shown);
      } catch (err) {
        console.warn('[PRACTICE_WELCOME] Preferences fetch failed:', err);
        practiceWelcomeCheckRef.current = false;
        setShowBusinessWelcome(false);
      }
    })();
  }, [isAnonymous, session?.user?.id, sessionIsPending, workspace]);

  const handleWelcomeComplete = async () => { await markWelcomeAsShown(); };
  const handleWelcomeClose = async () => { await markWelcomeAsShown(); };
  const handleBusinessWelcomeClose = async () => {
    setShowBusinessWelcome(false);
    try { await updatePreferencesCategory('onboarding', { practice_welcome_shown: true }); }
    catch (err) {
      console.warn('[PRACTICE_WELCOME] Failed to update preferences', err);
      showError('Update failed', 'We could not save your preference. You may see this prompt again.');
    }
    if (resolvedPracticeSlug) {
      navigate(`/practice/${encodeURIComponent(resolvedPracticeSlug)}/settings/practice`);
    }
  };

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
  const handleMediaCaptureWrapper = async (blob: Blob, type: 'audio' | 'video') => {
    try {
      const ext = type === 'audio' ? 'webm' : 'mp4';
      const file = new File([blob], `Recording_${new Date().toISOString()}.${ext}`, { type: blob.type });
      const uploadedFiles = await handleFileSelect([file]);
      await handleSendMessage(`I've recorded a ${type} message.`, uploadedFiles);
    } catch (err) {
      console.error('Failed to upload captured media:', err);
      showErrorRef.current?.('Failed to upload recording. Please try again.');
    }
  };

  // ── conversation header ────────────────────────────────────────────────────
  const filteredMessagesForHeader = useMemo(() => {
    const base = messages.filter(m => m.metadata?.systemMessageKey !== 'ask_question_help');
    const hasNonSystem = base.some(m => m.role !== 'system');
    return hasNonSystem ? base.filter(m => m.metadata?.systemMessageKey !== 'intro') : base;
  }, [messages]);

  const headerPresenceStatus = typeof isSocketReady === 'boolean'
    ? (isSocketReady ? 'active' : 'inactive')
    : undefined;

  const headerActiveTimeLabel = useMemo(() => {
    if (headerPresenceStatus === 'active') return 'Active';
    const lastTimestamp = [...filteredMessagesForHeader].reverse().find(m => typeof m.timestamp === 'number')?.timestamp;
    if (!lastTimestamp) return 'Inactive';
    const relative = formatRelativeTime(new Date(lastTimestamp).toISOString());
    return relative ? `Active ${relative}` : 'Inactive';
  }, [filteredMessagesForHeader, headerPresenceStatus]);

  const leadReviewActions = useMemo(() => {
    if (!isPracticeWorkspace || !practiceId || !activeConversationId || !practiceMattersPath) return undefined;
    return {
      practiceId,
      practiceName: resolvedPracticeName,
      conversationId: activeConversationId,
      canReviewLeads,
      mattersBasePath: practiceMattersPath,
      navigateTo: (path: string) => navigate(path),
    };
  }, [isPracticeWorkspace, practiceId, activeConversationId, practiceMattersPath, resolvedPracticeName, canReviewLeads, navigate]);

  const headerRightSlot = useMemo(() => {
    if (isPracticeWorkspace) {
      return <PracticeConversationHeaderMenu practiceId={practiceId} conversationId={activeConversationId ?? undefined} />;
    }
    if (conversationMode === 'REQUEST_CONSULTATION') {
      return <BriefStrengthIndicator intakeConversationState={intakeConversationState} />;
    }
    return undefined;
  }, [isPracticeWorkspace, practiceId, activeConversationId, conversationMode, intakeConversationState]);

  const conversationHeaderContent = useMemo(() => {
    if (!conversationsBasePath || !activeConversationId) return undefined;
    return (
      <WorkspaceConversationHeader
        practiceName={resolvedPracticeName}
        practiceLogo={resolvedPracticeLogo}
        activeLabel={headerActiveTimeLabel}
        presenceStatus={headerPresenceStatus}
        onBack={() => navigate(conversationBackPath)}
        loading={isCreatingConversation || !messagesReady}
        rightSlot={headerRightSlot}
      />
    );
  }, [
    activeConversationId, conversationBackPath, conversationsBasePath,
    headerActiveTimeLabel, headerPresenceStatus, headerRightSlot, isCreatingConversation, messagesReady,
    navigate, resolvedPracticeLogo, resolvedPracticeName,
  ]);

  // ── system messages ────────────────────────────────────────────────────────
  useConversationSystemMessages({
    conversationId: activeConversationId,
    practiceId: effectivePracticeId,
    practiceConfig,
    messagesReady,
    messages,
    conversationMode,
    isConsultFlowActive,
    shouldRequireModeSelection: isPublicWorkspace,
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
            conversationTitle={conversationMetadata?.title ?? null}
            onSendMessage={handleSendMessage}
            onAddMessage={addMessage}
            conversationMode={conversationMode}
            onSelectMode={handleModeSelection}
            onToggleReaction={toggleMessageReaction}
            onRequestReactions={requestMessageReactions}
            composerDisabled={isComposerDisabled}
            isPublicWorkspace={isPublicWorkspace}
            leadReviewActions={leadReviewActions}
            messagesReady={messagesReady}
            headerContent={conversationHeaderContent}
            heightClassName={layoutMode === 'desktop' ? undefined : 'h-full'}
            useFrame={layoutMode === 'desktop'}
            layoutMode={layoutMode}
            practiceConfig={{
              name: resolvedPracticeName,
              profileImage: resolvedPracticeLogo,
              practiceId,
              description: fullDescription,
              slug: resolvedPracticeSlug,
              introMessage: practiceConfig.introMessage,
            }}
            onOpenSidebar={undefined}
            practiceId={practiceId}
            previewFiles={previewFiles}
            uploadingFiles={uploadingFiles}
            removePreviewFile={removePreviewFile}
            clearPreviewFiles={clearPreviewFiles}
            handleCameraCapture={handleCameraCapture}
            handleFileSelect={async (files: File[]) => { await handleFileSelect(files); }}
            cancelUpload={cancelUpload}
            handleMediaCapture={handleMediaCaptureWrapper}
            isRecording={isRecording}
            setIsRecording={setIsRecording}
            clearInput={clearInputTrigger}
            isReadyToUpload={isReadyToUpload}
            isSessionReady={isSessionReady}
            isSocketReady={effectiveIsSocketReady}
            intakeStatus={intakeStatus}
            intakeConversationState={intakeConversationState}
            onIntakeCtaResponse={handleIntakeCtaResponse}
            slimContactDraft={slimContactDraft}
            onSlimFormContinue={handleSlimFormContinue}
            onSlimFormDismiss={handleSlimFormDismiss}
            onBuildBrief={handleBuildBrief}
            onSubmitNow={handleSubmitNow}
            isAnonymousUser={isAnonymous}
            canChat={canChat}
            hasMoreMessages={hasMoreMessages}
            isLoadingMoreMessages={isLoadingMoreMessages}
            onLoadMoreMessages={loadMoreMessages}
            showAuthPrompt={shouldShowAuthPrompt}
            authPromptTitle={intakeAuthTitle}
            authPromptDescription={intakeAuthDescription}
            authPromptCallbackUrl={awaitingInvitePath ?? undefined}
            onAuthPromptRequest={isAnonymous ? handlePaymentAuthRequest : undefined}
            onAuthPromptClose={handleAuthPromptClose}
            onAuthPromptSuccess={handleAuthPromptSuccess}
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
      practiceId={practiceId}
      practiceSlug={
        isPracticeWorkspace
          ? effectivePracticeSlug
          : isClientWorkspace
            ? (clientPracticeSlug ?? resolvedClientPracticeSlug)
            : resolvedPublicPracticeSlug
      }
      practiceName={resolvedPracticeName}
      practiceLogo={resolvedPracticeLogo}
      messages={messages}
      layoutMode={layoutMode}
      showClientTabs={isClientWorkspace ? true : isAuthenticatedClient}
      showPracticeTabs={isPracticeWorkspace}
      workspace={workspace}
      onStartNewConversation={handleStartNewConversation}
      chatView={chatPanel}
      mattersView={
        isPracticeWorkspace
          ? (practiceMattersPath ? (
            <Suspense fallback={<WorkspaceSubviewFallback />}>
              <PracticeMattersPage basePath={practiceMattersPath} practiceId={effectivePracticeId ?? null} />
            </Suspense>
          ) : null)
          : isClientWorkspace
            ? (
              <Suspense fallback={<WorkspaceSubviewFallback />}>
                <ClientMattersPage />
              </Suspense>
            )
            : undefined
      }
      clientsView={isPracticeWorkspace ? (
        <Suspense fallback={<WorkspaceSubviewFallback />}>
          <PracticeClientsPage practiceId={effectivePracticeId ?? null} />
        </Suspense>
      ) : undefined}
    />
  );

  // ── render ─────────────────────────────────────────────────────────────────
  const rootClassName = isWidget ? 'h-full w-full overflow-hidden' : 'min-h-dvh w-full';

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
      {!isWidget && <DragDropOverlay isVisible={isDragging} onClose={() => setIsDragging(false)} />}
      <div className={rootClassName} {...(isWidget ? { 'data-widget': 'true' } : {})}>
        <RoutePracticeProvider value={routePracticeContextValue}>
          {workspacePage}
        </RoutePracticeProvider>
      </div>
      {!isWidget && (
        <>
          <WelcomeModal
            isOpen={showWelcomeModal}
            onClose={handleWelcomeClose}
            onComplete={handleWelcomeComplete}
            workspace={isPracticeWorkspace ? 'practice' : 'client'}
          />
          {showBusinessWelcome && (
            <BusinessWelcomePrompt isOpen={showBusinessWelcome} onClose={handleBusinessWelcomeClose} />
          )}
        </>
      )}
    </>
  );
}
