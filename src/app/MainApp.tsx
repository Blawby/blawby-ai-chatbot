import { useState, useCallback, useRef, useEffect, useMemo } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import ChatContainer from '@/features/chat/components/ChatContainer';
import DragDropOverlay from '@/shared/ui/DragDropOverlay';
import WorkspacePage from '@/features/chat/pages/WorkspacePage';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { RoutePracticeProvider } from '@/shared/contexts/RoutePracticeContext';
import type { UIPracticeConfig } from '@/shared/hooks/usePracticeConfig';
import type { WorkspaceType } from '@/shared/types/workspace';
import { useMessageHandling } from '@/shared/hooks/useMessageHandling';
import { useConversationSetup } from '@/shared/hooks/useConversationSetup';
import { useWorkspaceRouting } from '@/shared/hooks/useWorkspaceRouting';
import { setupGlobalKeyboardListeners } from '@/shared/utils/keyboard';
import type { FileAttachment } from '../../worker/types';
import type { UploadingFile } from '@/shared/types/upload';
import { useNavigation } from '@/shared/utils/navigation';
import WelcomeDialog from '@/features/modals/components/WelcomeDialog';
import { useWelcomeDialog } from '@/features/modals/hooks/useWelcomeDialog';
import { getPreferencesCategory, updatePreferencesCategory } from '@/shared/lib/preferencesApi';
import type { OnboardingPreferences } from '@/shared/types/preferences';
import { BusinessWelcomePrompt } from '@/features/onboarding/components/BusinessWelcomePrompt';
import { SessionNotReadyError } from '@/shared/types/errors';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { clearPendingPracticeInviteLink, readPendingPracticeInviteLink } from '@/shared/utils/practiceInvites';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { usePracticeDetails } from '@/shared/hooks/usePracticeDetails';
import type { ConversationMetadata, ConversationMode } from '@/shared/types/conversation';
import { lazy, Suspense } from 'preact/compat';
const PracticeMattersPage = lazy(() => import('@/features/matters/pages/PracticeMattersPage').then(m => ({ default: m.PracticeMattersPage })));
const PracticeClientsPage = lazy(() => import('@/features/clients/pages/PracticeClientsPage').then(m => ({ default: m.PracticeClientsPage })));
const ClientMattersPage = lazy(() => import('@/features/matters/pages/ClientMattersPage').then(m => ({ default: m.ClientMattersPage })));
const PracticeInvoicesPage = lazy(() => import('@/features/invoices/pages/PracticeInvoicesPage').then(m => ({ default: m.PracticeInvoicesPage })));
const PracticeInvoiceCreatePage = lazy(() => import('@/features/invoices/pages/PracticeInvoiceCreatePage').then(m => ({ default: m.PracticeInvoiceCreatePage })));
const PracticeInvoiceEditPage = lazy(() => import('@/features/invoices/pages/PracticeInvoiceEditPage').then(m => ({ default: m.PracticeInvoiceEditPage })));
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
import { InformationCircleIcon, PaperAirplaneIcon } from '@heroicons/react/24/outline';
import { PlusIcon } from '@heroicons/react/24/solid';
import { Button } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { shouldShowWorkspaceDetailBack } from '@/shared/utils/workspaceDetailNavigation';
import { resolveConversationDisplayTitle } from '@/shared/utils/conversationDisplay';
import { DetailHeader } from '@/shared/ui/layout/DetailHeader';
import { LoadingBlock } from '@/shared/ui/layout/LoadingBlock';
import { resolveStrengthStyle, resolveStrengthTier } from '@/shared/utils/intakeStrength';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
import { INVOICE_CREATE_SEND_EVENT } from '@/features/invoices/utils/invoicePageConfig';
import { features } from '@/config/features';

// ─── types ────────────────────────────────────────────────────────────────────

type WorkspaceView = 'home' | 'setup' | 'list' | 'conversation' | 'intakes' | 'intakeDetail' | 'engagements' | 'matters' | 'clients' | 'invoices' | 'invoiceCreate' | 'invoiceEdit' | 'invoiceDetail' | 'reports' | 'settings';

/**
 * LayoutMode controls how ChatContainer renders its shell.
 * - 'desktop' – practice dashboard, full chrome
 * - 'mobile'  – authenticated client on phone
 * - 'widget'  – embedded in 3rd-party site via iframe (?v=widget)
 */
export type LayoutMode = 'widget' | 'mobile' | 'desktop';

const WorkspaceSubviewFallback = () => <LoadingBlock className="p-6" />;
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
  const [isRecording, setIsRecording] = useState(false);
  const [showBusinessWelcome, setShowBusinessWelcome] = useState(false);
  const [conversationMode, setConversationMode] = useState<ConversationMode | null>(null);
  const [isPaymentAuthPromptOpen, setIsPaymentAuthPromptOpen] = useState(false);

  const { navigate } = useNavigation();
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
    resolvedPracticeDescription: fullDescription,
    resolvedAccentColor: fullAccentColor,
    normalizedRouteConversationId,
    conversationsBasePath,
    conversationBackPath,
    practiceMattersPath,
    practiceClientsPath,
    conversationResetKey,
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
    routing: routingClaims,
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
    onModeChange: setConversationMode,
    onError: handleSetupError,
  });

  const activeConversationId = normalizedRouteConversationId ?? setupConversationId;
  const shouldEnableConversationTransport = workspaceView !== 'settings';
  const liveConversationId = shouldEnableConversationTransport ? activeConversationId : null;

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
    enabled: shouldEnableConversationTransport,
    practiceId: effectivePracticeId,
    practiceSlug: resolvedPracticeSlug ?? undefined,
    conversationId: liveConversationId ?? undefined,
    onEnsureConversation: () => ensureConversation(),
    linkAnonymousConversationOnLoad: isPublicWorkspace,
    mode: conversationMode,
    onConversationMetadataUpdated: handleConversationMetadataUpdated,
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
      await applyIntakeFields({ enrichmentMode: true });
      await sendMessage('I want to provide more details to strengthen my case.', []);
    } catch (err) {
      console.error('Failed to start strengthen case flow', err);
    }
  }, [applyIntakeFields, sendMessage]);

  // ── conversation mode selection ────────────────────────────────────────────
  const isSelectingRef = useRef(false);

  const handleModeSelection = useCallback(async (
    nextMode: ConversationMode, 
    source: 'intro_gate' | 'composer_footer' | 'home_cta' | 'chat_intro' | 'slim_form_dismiss' | 'chat_selector' = 'home_cta'
  ) => {
    if (isSelectingRef.current) return;
    try {
      isSelectingRef.current = true;
      const currentConversationId = activeConversationId ?? (isCreatingConversation ? null : await ensureConversation());
      if (!currentConversationId || !practiceId) return;
      await applyConversationMode(nextMode, currentConversationId, source, startConsultFlow);
    } catch (error) {
      setConversationMode(null);
      showErrorRef.current?.(error instanceof Error ? error.message : 'Unable to start conversation');
      console.warn('[MainApp] Failed to persist conversation mode selection', error);
    } finally {
      isSelectingRef.current = false;
    }
  }, [activeConversationId, applyConversationMode, ensureConversation, isCreatingConversation, practiceId, startConsultFlow]);


  const handleSlimFormDismiss = useCallback(async () => {
    if (conversationMode !== 'REQUEST_CONSULTATION') return;
    await handleModeSelection('ASK_QUESTION', 'slim_form_dismiss');
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
      setConversationMode(null);
      console.warn('[MainApp] Failed to start new conversation', error);
      throw error;
    } finally {
      // Always release the lock so subsequent clicks work.
      isSelectingRef.current = false;
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

  const handleUploadError = useCallback((error: unknown) => {
    console.error('File upload error:', error);
    showErrorRef.current?.(typeof error === 'string' ? error : 'File upload failed. Please try again.');
  }, []);

  // ── file upload ────────────────────────────────────────────────────────────
  const previewFiles = useMemo<FileAttachment[]>(() => (features.enableFileAttachments ? [] : []), []);
  const uploadingFiles = useMemo<UploadingFile[]>(() => (features.enableFileAttachments ? [] : []), []);
  const isDragging = features.enableFileAttachments ? false : false;
  const handleCameraCapture = useCallback(async (_file: File) => {
    if (!features.enableFileAttachments) {
      handleUploadError('Chat attachments are currently disabled.');
      return;
    }
    // TODO: Implement real camera/media capture logic
  }, [handleUploadError]);
  const handleFileSelect = useCallback(async (_files: File[]) => {
    if (!features.enableFileAttachments) {
      handleUploadError('Chat attachments are currently disabled.');
      return [];
    }
    // TODO: Implement real file selection and upload logic
    return [];
  }, [handleUploadError]);
  const removePreviewFile = useCallback((_index: number) => {
    if (!features.enableFileAttachments) return;
    // TODO: Implement real preview file removal logic
  }, []);
  const clearPreviewFiles = useCallback(() => {
    if (!features.enableFileAttachments) return;
    // TODO: Implement real preview files clearing logic
  }, []);
  const cancelUpload = useCallback((_fileId: string) => {
    if (!features.enableFileAttachments) return;
    // TODO: Implement real upload cancellation logic
  }, []);
  const isReadyToUpload = features.enableFileAttachments;

  // ── welcome modals ─────────────────────────────────────────────────────────
  const { shouldShow: shouldShowWelcome, markAsShown: markWelcomeAsShown } = useWelcomeDialog({ enabled: workspace !== 'public' });
  const showWelcomeDialog = shouldShowWelcome && workspace !== 'public';

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
      await handleFileSelect([file]);
    } catch (err) {
      console.error('Failed to upload captured media:', err);
      showErrorRef.current?.('Failed to upload recording. Please try again.');
    }
  };

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
        title={resolvedPracticeName}
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
    conversationHeaderActiveLabel, conversationStrengthAction,
    layoutMode, navigate, resolvedPracticeName,
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
            viewerContext={isPracticeWorkspace ? 'practice' : isClientWorkspace ? 'client' : 'public'}
            onSendMessage={handleSendMessage}
            conversationMode={conversationMode}
            onSelectMode={(mode, source) => { void handleModeSelection(mode, source); }}
            onToggleReaction={features.enableMessageReactions ? toggleMessageReaction : undefined}
            onRequestReactions={requestMessageReactions}
            composerDisabled={isComposerDisabled}
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
              description: fullDescription,
              slug: resolvedPracticeSlug,
            }}
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
      onIntakeFieldsChange={applyIntakeFields}
      practiceDetails={practiceDetails}
      chatView={chatPanel}
      mattersView={
        isPracticeWorkspace
          ? (practiceMattersPath
            ? (statusFilter, prefetchData, onDetailInspector, detailInspectorOpen, detailHeaderLeadingAction) => (
              <Suspense fallback={<WorkspaceSubviewFallback />}>
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
              </Suspense>
            )
            : null)
          : isClientWorkspace
            ? (clientMattersPath
              ? (statusFilter, prefetchData, onDetailInspector, detailInspectorOpen) => (
                <Suspense fallback={<WorkspaceSubviewFallback />}>
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
                </Suspense>
              )
              : null)
            : undefined
      }
      mattersListContent={
        isPracticeWorkspace && layoutMode === 'desktop' && practiceMattersPath
          ? (statusFilter, prefetchData) => (
            <Suspense fallback={<WorkspaceSubviewFallback />}>
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
            </Suspense>
          )
          : isClientWorkspace && layoutMode === 'desktop' && clientMattersPath
            ? (statusFilter, prefetchData) => (
              <Suspense fallback={<WorkspaceSubviewFallback />}>
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
              </Suspense>
            )
          : undefined
      }
      clientsView={isPracticeWorkspace && practiceClientsPath != null
        ? (statusFilter, prefetchData, onDetailInspector, detailInspectorOpen, detailHeaderLeadingAction) => (
          <Suspense fallback={<WorkspaceSubviewFallback />}>
            <PracticeClientsPage
              practiceId={effectivePracticeId ?? practiceId}
              basePath={practiceClientsPath}
              renderMode={layoutMode === 'desktop' ? 'detailOnly' : 'full'}
              statusFilter={statusFilter}
              prefetchedItems={prefetchData?.clientsData?.items}
              prefetchedLoading={prefetchData?.clientsData?.isLoading}
              prefetchedError={prefetchData?.clientsData?.error}
              onRefetchList={prefetchData?.clientsData?.refetch}
              onDetailInspector={onDetailInspector}
              detailInspectorOpen={detailInspectorOpen}
              detailHeaderLeadingAction={detailHeaderLeadingAction}
              showDetailBackButton={showWorkspaceDetailBack}
            />
          </Suspense>
        )
        : undefined}
      clientsListContent={isPracticeWorkspace && layoutMode === 'desktop' && practiceClientsPath != null
        ? (statusFilter, prefetchData) => (
          <Suspense fallback={<WorkspaceSubviewFallback />}>
            <PracticeClientsPage
              practiceId={effectivePracticeId ?? practiceId}
              basePath={practiceClientsPath}
              renderMode="listOnly"
              statusFilter={statusFilter}
              prefetchedItems={prefetchData?.clientsData?.items}
              prefetchedLoading={prefetchData?.clientsData?.isLoading}
              prefetchedError={prefetchData?.clientsData?.error}
              onRefetchList={prefetchData?.clientsData?.refetch}
              showDetailBackButton={showWorkspaceDetailBack}
            />
          </Suspense>
        )
        : undefined}
      invoicesView={
        isPracticeWorkspace
          ? (statusFilter, onDetailInspector, detailInspectorOpen, detailHeaderLeadingAction) => (
            <Suspense fallback={<WorkspaceSubviewFallback />}>
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
              ) : resolvedWorkspaceView === 'invoiceEdit' ? (
                <PracticeInvoiceEditPage
                  practiceId={effectivePracticeId ?? practiceId}
                  practiceSlug={resolvedPracticeSlug ?? null}
                  invoiceId={routeInvoiceId ?? null}
                />
              ) : resolvedWorkspaceView === 'invoiceCreate' ? (
                <PracticeInvoiceCreatePage
                  practiceId={effectivePracticeId ?? practiceId}
                  practiceSlug={resolvedPracticeSlug ?? null}
                />
              ) : (
                <PracticeInvoicesPage
                  practiceId={effectivePracticeId ?? practiceId}
                  practiceSlug={resolvedPracticeSlug ?? null}
                  statusFilter={statusFilter}
                  renderMode="full"
                  onCreateInvoice={practiceInvoicesPath ? () => navigate(`${practiceInvoicesPath}/new`) : undefined}
                />
              )}
            </Suspense>
          )
          : isClientWorkspace
            ? (statusFilter, onDetailInspector, detailInspectorOpen) => (
              <Suspense fallback={<WorkspaceSubviewFallback />}>
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
              </Suspense>
            )
            : undefined
      }
      invoicesListContent={
        (isPracticeWorkspace || isClientWorkspace) && layoutMode === 'desktop' && resolvedWorkspaceView === 'invoiceDetail'
          ? (statusFilter) => (
            <Suspense fallback={<WorkspaceSubviewFallback />}>
              {isPracticeWorkspace ? (
                <PracticeInvoicesPage
                  practiceId={effectivePracticeId ?? practiceId}
                  practiceSlug={resolvedPracticeSlug ?? null}
                  statusFilter={statusFilter}
                  renderMode="listOnly"
                  onCreateInvoice={practiceInvoicesPath ? () => navigate(`${practiceInvoicesPath}/new`) : undefined}
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
            </Suspense>
          )
          : undefined
      }
      reportsView={
        isPracticeWorkspace
          ? (reportTitle) => (
            <Suspense fallback={<WorkspaceSubviewFallback />}>
              <PracticeReportsPage title={reportTitle} />
            </Suspense>
          )
          : undefined
      }
      intakesView={
        isPracticeWorkspace
          ? (activeFilter) => (
            <Suspense fallback={<WorkspaceSubviewFallback />}>
              <IntakesPage
                practiceId={effectivePracticeId ?? practiceId}
                activeTriageFilter={activeFilter}
                basePath={practiceIntakesPath ?? '/practice/intakes'}
                conversationsBasePath={conversationsBasePath}
                practiceName={resolvedPracticeName}
                practiceLogo={resolvedPracticeLogo}
              />
            </Suspense>
          )
          : undefined
      }
      engagementsView={
        isPracticeWorkspace
          ? () => (
            <Suspense fallback={<WorkspaceSubviewFallback />}>
              <EngagementsPage
                practiceId={effectivePracticeId ?? practiceId}
                basePath={practiceEngagementsPath ?? '/practice/engagements'}
                conversationsBasePath={conversationsBasePath}
                practiceName={resolvedPracticeName}
                practiceLogo={resolvedPracticeLogo}
              />
            </Suspense>
          )
          : undefined
      }
      primaryCreateAction={
        resolvedWorkspaceView === 'matters' && isPracticeWorkspace && practiceMattersPath
          ? {
              label: 'New Matter',
              onClick: () => navigate(`${practiceMattersPath}/new`),
              icon: PlusIcon,
            }
          : (resolvedWorkspaceView === 'invoiceCreate' || resolvedWorkspaceView === 'invoiceEdit') && isPracticeWorkspace
            ? {
                label: 'Send Invoice',
                onClick: () => window.dispatchEvent(new CustomEvent(INVOICE_CREATE_SEND_EVENT)),
                icon: PaperAirplaneIcon,
              }
          : resolvedWorkspaceView === 'invoices' && isPracticeWorkspace && practiceInvoicesPath
            ? {
                label: 'New Invoice',
                onClick: () => navigate(`${practiceInvoicesPath}/new`),
                icon: PlusIcon,
              }
          : resolvedWorkspaceView === 'clients' && isPracticeWorkspace && practiceClientsPath
            ? {
                label: 'New Person',
                onClick: () => navigate(`${practiceClientsPath}?create=1`),
                icon: PlusIcon,
              }
            : null
      }
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
      {!isWidget && <DragDropOverlay isVisible={isDragging} onClose={() => {}} />}
      <div className={rootClassName}>
        <RoutePracticeProvider value={routePracticeContextValue}>
          {workspacePage}
        </RoutePracticeProvider>
      </div>
      {!isWidget && (
        <>
          <WelcomeDialog
            isOpen={showWelcomeDialog}
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
