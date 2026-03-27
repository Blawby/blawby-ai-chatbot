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
import type { ConversationMetadata, ConversationMode } from '@/shared/types/conversation';
import { lazy, Suspense } from 'preact/compat';
const PracticeMattersPage = lazy(() => import('@/features/matters/pages/PracticeMattersPage').then(m => ({ default: m.PracticeMattersPage })));
const PracticeClientsPage = lazy(() => import('@/features/clients/pages/PracticeClientsPage').then(m => ({ default: m.PracticeClientsPage })));
const ClientMattersPage = lazy(() => import('@/features/matters/pages/ClientMattersPage').then(m => ({ default: m.ClientMattersPage })));
const PracticeInvoicesPage = lazy(() => import('@/features/invoices/pages/PracticeInvoicesPage').then(m => ({ default: m.PracticeInvoicesPage })));
const PracticeInvoiceCreatePage = lazy(() => import('@/features/invoices/pages/PracticeInvoiceCreatePage').then(m => ({ default: m.PracticeInvoiceCreatePage })));
const PracticeInvoiceDetailPage = lazy(() => import('@/features/invoices/pages/PracticeInvoiceDetailPage').then(m => ({ default: m.PracticeInvoiceDetailPage })));
const ClientInvoicesPage = lazy(() => import('@/features/invoices/pages/ClientInvoicesPage').then(m => ({ default: m.ClientInvoicesPage })));
const ClientInvoiceDetailPage = lazy(() => import('@/features/invoices/pages/ClientInvoiceDetailPage').then(m => ({ default: m.ClientInvoiceDetailPage })));
const PracticeReportsPage = lazy(() => import('@/features/reports/pages/PracticeReportsPage').then(m => ({ default: m.PracticeReportsPage })));
import { useConversationSystemMessages } from '@/shared/hooks/useConversationSystemMessages';
import { initializeAccentColor } from '@/shared/utils/accentColors';
import { getConversationParticipants, linkConversationToUser } from '@/shared/lib/apiClient';
import { resolveConsultationState } from '@/shared/utils/consultationState';
import {
  peekAnonymousSessionId,
  peekAnonymousUserId,
  peekConversationAnonymousParticipant,
  consumePostAuthConversationContext,
  peekPostAuthConversationContext,
} from '@/shared/utils/anonymousIdentity';
import type { SettingsView } from '@/features/settings/pages/SettingsContent';
import { InformationCircleIcon } from '@heroicons/react/24/outline';
import { PlusIcon } from '@heroicons/react/24/solid';
import { Button } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { shouldShowWorkspaceDetailBack } from '@/shared/utils/workspaceDetailNavigation';
import { resolveConversationDisplayTitle } from '@/shared/utils/conversationDisplay';
import { DetailHeader } from '@/shared/ui/layout/DetailHeader';
import { LoadingBlock } from '@/shared/ui/layout/LoadingBlock';
import { resolveStrengthStyle, resolveStrengthTier } from '@/shared/utils/intakeStrength';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';

// ─── types ────────────────────────────────────────────────────────────────────

type WorkspaceView = 'home' | 'setup' | 'list' | 'conversation' | 'matters' | 'clients' | 'invoices' | 'invoiceCreate' | 'invoiceDetail' | 'reports' | 'settings';

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
  const [dismissedIntakeAuthFor, setDismissedIntakeAuthFor] = useState<string | null>(null);
  const [isPaymentAuthPromptOpen, setIsPaymentAuthPromptOpen] = useState(false);
  const preAuthUserIdRef = useRef<string | null>(null);

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
    setConversationId,
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

  useEffect(() => {
    if (sessionIsPending) return;
    if (!session?.user || isAnonymous) return;
    const pending = peekPostAuthConversationContext();
    if (!pending) return;
    if (pending.practiceId) {
      const matchesPractice =
        pending.practiceId === practiceId ||
        pending.practiceId === effectivePracticeId;
      if (!matchesPractice) return;
    }

    const consumedPending = consumePostAuthConversationContext();
    if (!consumedPending) return;

    if (consumedPending.workspace === 'public' && consumedPending.practiceSlug) {
      const slug = consumedPending.practiceSlug;
      navigate(`/public/${encodeURIComponent(slug)}/conversations/${encodeURIComponent(consumedPending.conversationId)}`, true);
      return;
    }

    setConversationId(consumedPending.conversationId);
  }, [
    effectivePracticeId,
    isAnonymous,
    navigate,
    practiceId,
    session?.user,
    sessionIsPending,
    setConversationId,
  ]);

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

  // Bridge for payment gate: useIntakeFlow calls onOpenPayment imperatively;
  // ChatContainer registers its handleOpenPayment here on mount.
  const openPaymentRef = useRef<((req: import('@/shared/utils/intakePayments').IntakePaymentRequest) => void) | null>(null);
  const handleOpenPaymentBridge = useCallback(
    (req: import('@/shared/utils/intakePayments').IntakePaymentRequest) => openPaymentRef.current?.(req),
    []
  );

  const messageHandling = useMessageHandling({
    practiceId: effectivePracticeId,
    practiceSlug: resolvedPracticeSlug ?? undefined,
    conversationId: activeConversationId ?? undefined,
    ensureConversation: () => ensureConversation({ waitForSessionReadyMs: 3000 }),
    linkAnonymousConversationOnLoad: isPublicWorkspace,
    mode: conversationMode,
    onConversationMetadataUpdated: handleConversationMetadataUpdated,
    onError: handleMessageError,
    onOpenPayment: handleOpenPaymentBridge,
  });

  const {
    messages, conversationMetadata, sendMessage, addMessage, clearMessages,
    requestMessageReactions, toggleMessageReaction,
    intakeStatus, intakeConversationState, handleIntakeCtaResponse,
    slimContactDraft, handleSlimFormContinue, handleBuildBrief, handleSubmitNow, handleFinalizeSubmit,
    startConsultFlow, updateConversationMetadata: _updateConversationMetadata,
    ingestServerMessages, messagesReady, hasMoreMessages, isLoadingMoreMessages,
    loadMoreMessages, isSocketReady, applyIntakeFields,
  } = messageHandling;



  useEffect(() => { clearMessages(); }, [practiceId, clearMessages]);

  // ── intake auth prompt ─────────────────────────────────────────────────────
  const intakeUuid = intakeStatus?.intakeUuid ?? null;

  const intakeAuthTarget = useMemo(() => {
    if (!isPublicWorkspace || !intakeUuid) return null;
    if (intakeStatus?.paymentRequired && !intakeStatus?.paymentReceived) return null;
    return intakeUuid;
  }, [intakeUuid, intakeStatus?.paymentReceived, intakeStatus?.paymentRequired, isPublicWorkspace]);

  const shouldShowIntakeAuthPrompt = Boolean(isAnonymous && intakeAuthTarget && dismissedIntakeAuthFor !== intakeAuthTarget);
  const shouldShowAuthPrompt = Boolean(isAnonymous && (shouldShowIntakeAuthPrompt || isPaymentAuthPromptOpen));

  const intakePostAuthPath = useMemo(() => {
    if (!isPublicWorkspace) return null;
    if (!resolvedPublicPracticeSlug || !activeConversationId) return null;
    return `/public/${encodeURIComponent(resolvedPublicPracticeSlug)}/conversations/${encodeURIComponent(activeConversationId)}`;
  }, [activeConversationId, isPublicWorkspace, resolvedPublicPracticeSlug]);

  const handleIntakeAuthSuccess = useCallback(async () => {
    if (!intakePostAuthPath) return;
    if (intakeAuthTarget) setDismissedIntakeAuthFor(intakeAuthTarget);
    navigate(intakePostAuthPath, true);
  }, [intakePostAuthPath, intakeAuthTarget, navigate]);

  const capturePreAuthUserId = useCallback(() => {
    if (preAuthUserIdRef.current) return;
    preAuthUserIdRef.current = session?.user?.id ?? null;
  }, [session?.user?.id]);
  const handlePaymentAuthRequest = useCallback(() => {
    capturePreAuthUserId();
    setIsPaymentAuthPromptOpen(true);
  }, [capturePreAuthUserId]);

  const handleAuthPromptClose = useCallback(() => {
    if (typeof window !== 'undefined') {
      try { window.sessionStorage.removeItem('intakeAwaitingInvitePath'); } catch { /* noop */ }
    }
    if (isPaymentAuthPromptOpen) setIsPaymentAuthPromptOpen(false);
    if (intakeAuthTarget) setDismissedIntakeAuthFor(intakeAuthTarget);
    preAuthUserIdRef.current = null;
  }, [intakeAuthTarget, isPaymentAuthPromptOpen]);

  const handleAuthPromptSuccess = useCallback(async () => {
    const hadPreAuthIdentity = Boolean(preAuthUserIdRef.current);
    const linkPracticeId = effectivePracticeId ?? practiceId;
    if (activeConversationId && linkPracticeId && hadPreAuthIdentity) {
      try {
        const previousParticipantId =
          peekConversationAnonymousParticipant(activeConversationId) ??
          peekAnonymousUserId();
        const anonymousSessionId = peekAnonymousSessionId();
        await linkConversationToUser(
          activeConversationId,
          linkPracticeId,
          undefined,
          {
            previousParticipantId: previousParticipantId ?? undefined,
            anonymousSessionId: anonymousSessionId ?? undefined,
          }
        );
        preAuthUserIdRef.current = null;
      } catch (error) {
        console.warn('[MainApp] Conversation link after auth failed', error);
      }
    }
    if (isPaymentAuthPromptOpen) setIsPaymentAuthPromptOpen(false);
    if (isWidget) {
      if (intakeAuthTarget) setDismissedIntakeAuthFor(intakeAuthTarget);
      return;
    }
    await handleIntakeAuthSuccess();
  }, [activeConversationId, effectivePracticeId, handleIntakeAuthSuccess, intakeAuthTarget, isPaymentAuthPromptOpen, isWidget, practiceId]);

  useEffect(() => {
    if (!intakePostAuthPath || !shouldShowAuthPrompt || typeof window === 'undefined') return;
    try { window.sessionStorage.setItem('intakeAwaitingInvitePath', intakePostAuthPath); } catch { /* noop */ }
  }, [intakePostAuthPath, shouldShowAuthPrompt]);

  useEffect(() => {
    if (!shouldShowAuthPrompt) return;
    capturePreAuthUserId();
  }, [capturePreAuthUserId, shouldShowAuthPrompt]);

  // ── conversation mode selection ────────────────────────────────────────────
  const isSelectingRef = useRef(false);

  const handleModeSelection = useCallback(async (
    nextMode: ConversationMode,
    source: 'intro_gate' | 'composer_footer'
  ) => {
    if (isSelectingRef.current) return;
    try {
      isSelectingRef.current = true;
      const currentConversationId = activeConversationId ?? (isCreatingConversation ? null : await ensureConversation({ waitForSessionReadyMs: 3000 }));
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
      // Poll briefly so we don't fail while auth/session state is still settling.
      const newConversationId = await ensureConversation({ waitForSessionReadyMs: 3000 });

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

  const [mentionCandidates, setMentionCandidates] = useState<Array<{ userId: string; name: string }>>([]);
  useEffect(() => {
    if (!isPracticeWorkspace || !practiceId || !activeConversationId) {
      setMentionCandidates([]);
      return;
    }

    const looksLikeEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    const controller = new AbortController();

    (async () => {
      try {
        const participants = await getConversationParticipants(activeConversationId, practiceId, { signal: controller.signal });
        const nextMentionCandidates = participants
          .filter((participant) => participant.role !== 'client')
          .map((participant) => ({
            userId: participant.userId,
            name: (participant.name ?? '').trim(),
          }))
          .filter((participant) => (
            participant.userId.trim().length > 0
            && participant.name.length > 0
            && !looksLikeEmail(participant.name)
          ));
        setMentionCandidates(nextMentionCandidates);
      } catch (error) {
        if ((error as DOMException)?.name === 'AbortError') return;
        console.warn('[MainApp] Failed to load conversation participants for mentions', error);
        setMentionCandidates([]);
      }
    })();

    return () => controller.abort();
  }, [activeConversationId, isPracticeWorkspace, practiceId]);

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
    ensureConversation: () => ensureConversation({ waitForSessionReadyMs: 3000 }),
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
        || intakeConversationState?.turnCount
        || intakeConversationState?.ctaShown
        || intakeConversationState?.intakeReady
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
    conversationId: activeConversationId,
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
            conversationId={activeConversationId ?? null}
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
            onFinalizeSubmit={handleFinalizeSubmit}
            onRegisterOpenPayment={(fn) => { openPaymentRef.current = fn; }}
            isAnonymousUser={isAnonymous}
            canChat={canChat}
            hasMoreMessages={hasMoreMessages}
            isLoadingMoreMessages={isLoadingMoreMessages}
            onLoadMoreMessages={loadMoreMessages}
            showAuthPrompt={shouldShowAuthPrompt}
            authPromptCallbackUrl={intakePostAuthPath ?? undefined}
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
                  renderMode={layoutMode === 'desktop' ? 'detailOnly' : 'full'}
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
                    key={`${effectivePracticeId}-${layoutMode === 'desktop' ? 'detailOnly' : 'full'}-${JSON.stringify(statusFilter)}`}
                    practiceId={effectivePracticeId ?? practiceId}
                    practiceSlug={(clientPracticeSlug ?? resolvedClientPracticeSlug) ?? null}
                    statusFilter={statusFilter}
                    renderMode={layoutMode === 'desktop' ? 'detailOnly' : 'full'}
                  />
                )}
              </Suspense>
            )
            : undefined
      }
      invoicesListContent={
        (isPracticeWorkspace || isClientWorkspace) && layoutMode === 'desktop'
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
      primaryCreateAction={
        resolvedWorkspaceView === 'matters' && isPracticeWorkspace && practiceMattersPath
          ? {
              label: 'New Matter',
              onClick: () => navigate(`${practiceMattersPath}/new`),
              icon: PlusIcon,
            }
          : (resolvedWorkspaceView === 'invoices' || resolvedWorkspaceView === 'invoiceDetail') && isPracticeWorkspace && practiceInvoicesPath
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
      {!isWidget && <DragDropOverlay isVisible={isDragging} onClose={() => setIsDragging(false)} />}
      <div className={rootClassName}>
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
