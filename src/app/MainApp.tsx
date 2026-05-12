import { useState, useCallback, useRef, useEffect, useMemo } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { useLocation } from 'preact-iso';
import ChatContainer from '@/features/chat/components/ChatContainer';
import DragDropOverlay from '@/shared/ui/DragDropOverlay';
import { Avatar } from '@/shared/ui/profile/atoms/Avatar';
import WorkspacePage from '@/features/chat/pages/WorkspacePage';
import { useSessionContext, useMemberRoleContext } from '@/shared/contexts/SessionContext';
import { RoutePracticeProvider } from '@/shared/contexts/RoutePracticeContext';
import { IntakeProvider } from '@/shared/contexts/IntakeContext';
import { PresenceProvider } from '@/shared/contexts/PresenceContext';
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
import { Send, Plus, Mail, Phone, Briefcase } from 'lucide-preact';
import { INVOICE_CREATE_SEND_EVENT } from '@/features/invoices/utils/invoicePageConfig';
const PracticeMattersPage = lazy(() => import('@/features/matters/pages/PracticeMattersPage').then(m => ({ default: m.PracticeMattersPage })));
const PracticeContactsPage = lazy(() => import('@/features/clients/pages/PracticeContactsPage').then(m => ({ default: m.PracticeContactsPage })));
const ClientMattersPage = lazy(() => import('@/features/matters/pages/ClientMattersPage').then(m => ({ default: m.ClientMattersPage })));
const PracticeInvoicesPage = lazy(() => import('@/features/invoices/pages/PracticeInvoicesPage').then(m => ({ default: m.PracticeInvoicesPage })));
const PracticeInvoiceDetailPage = lazy(() => import('@/features/invoices/pages/PracticeInvoiceDetailPage').then(m => ({ default: m.PracticeInvoiceDetailPage })));
const ClientInvoicesPage = lazy(() => import('@/features/invoices/pages/ClientInvoicesPage').then(m => ({ default: m.ClientInvoicesPage })));
const ClientInvoiceDetailPage = lazy(() => import('@/features/invoices/pages/ClientInvoiceDetailPage').then(m => ({ default: m.ClientInvoiceDetailPage })));
const PracticeReportsPage = lazy(() => import('@/features/reports/pages/PracticeReportsPage').then(m => ({ default: m.PracticeReportsPage })));
const IntakesPage = lazy(() => import('@/features/intake/pages/IntakesPage').then(m => ({ default: m.IntakesPage })));
const ClientIntakesView = lazy(() => import('@/features/intake/pages/ClientIntakesView').then(m => ({ default: m.ClientIntakesView })));
const EngagementsPage = lazy(() => import('@/features/engagements/pages/EngagementsPage').then(m => ({ default: m.EngagementsPage })));
import { useConversationSystemMessages } from '@/shared/hooks/useConversationSystemMessages';
import { initializeAccentColor } from '@/shared/utils/accentColors';
import { useMentionCandidates } from '@/shared/hooks/useMentionCandidates';
import { isIntakeReadyForSubmission, resolveConsultationState } from '@/shared/utils/consultationState';
import type { SettingsView } from '@/features/settings/pages/SettingsContent';
import { Button } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { shouldShowWorkspaceDetailBack } from '@/shared/utils/workspaceDetailNavigation';
import {
  resolveConversationContactName,
  resolveConversationDisplayTitle,
  resolveConversationPresence,
} from '@/shared/utils/conversationDisplay';
import { DetailHeader } from '@/shared/ui/layout/DetailHeader';
import { LazyRouteBoundary } from '@/shared/ui/layout/LazyRouteBoundary';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
import { features } from '@/config/features';

// ─── types ────────────────────────────────────────────────────────────────────

import type { WorkspaceView } from '@/shared/utils/workspaceShell';
export type { WorkspaceView };

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
  routeIntakeId,
  routeSettingsView,
  routeSettingsAppId,
  routeSettingsIntakeTemplateSlug,
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
  routeSettingsIntakeTemplateSlug?: string;
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
  const clientIntakesPath = useMemo(() => {
    if (!isClientWorkspace) return null;
    const slug = clientPracticeSlug ?? resolvedClientPracticeSlug;
    if (!slug) return null;
    return `/client/${encodeURIComponent(slug)}/intakes`;
  }, [clientPracticeSlug, isClientWorkspace, resolvedClientPracticeSlug]);

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
    createConversation,
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
    slimContactDraft, handleSlimFormContinue, handleBuildBrief, handleConfirmSubmit, handleFinalizeSubmit: _handleFinalizeSubmit,
    startConsultFlow, updateConversationMetadata: _updateConversationMetadata,
    ingestServerMessages, messagesReady, hasMoreMessages, isLoadingMoreMessages,
    loadMoreMessages, isSocketReady, applyIntakeFields,
    typingUserIds, readReceiptsByUser, sendTypingState,
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
    options?: {
      forceCreate?: boolean;
      silentSessionNotReady?: boolean;
      additionalParticipantUserIds?: string[];
      additionalMetadata?: Record<string, unknown>;
    }
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
      // forceCreate must skip ensureConversation (which short-circuits to the
      // current active id) and call createConversation directly. The
      // allowPracticeWorkspace flag opts out of the staff-auto-create guard so
      // the explicit "New conversation" affordance works for practice users too.
      const newConversationId = options?.forceCreate
        ? await createConversation({
            allowPracticeWorkspace: true,
            additionalParticipantUserIds: options.additionalParticipantUserIds,
            additionalMetadata: options.additionalMetadata,
          })
        : await ensureConversation();

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
  }, [activeConversationId, applyConversationMode, createConversation, ensureConversation, practiceId, startConsultFlow]);

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
    intakeUuid: resolveConsultationState(conversationMetadata)?.submission?.intakeUuid ?? null,
  });

  // Page-level drop handler. Tracks real drag state via window listeners
  // (matters pattern: depth ref to debounce nested enter/leave from children)
  // and drives the page-wide DragDropOverlay's visibility.
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const dragDepthRef = useRef(0);
  useEffect(() => {
    if (!features.enableFileAttachments || !isAuthenticatedWorkspace || isWidget) return;
    const hasDraggedFiles = (event: DragEvent) => {
      const types = event.dataTransfer?.types;
      return Boolean(types && Array.from(types).includes('Files'));
    };
    const onDragEnter = (event: DragEvent) => {
      if (!hasDraggedFiles(event)) return;
      event.preventDefault();
      dragDepthRef.current += 1;
      setIsDraggingFiles(true);
    };
    const onDragOver = (event: DragEvent) => {
      if (!hasDraggedFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      setIsDraggingFiles(true);
    };
    const onDragLeave = (event: DragEvent) => {
      if (!hasDraggedFiles(event)) return;
      event.preventDefault();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) setIsDraggingFiles(false);
    };
    const onDrop = (event: DragEvent) => {
      if (!hasDraggedFiles(event)) return;
      event.preventDefault();
      dragDepthRef.current = 0;
      setIsDraggingFiles(false);
      const dropped = event.dataTransfer?.files ? Array.from(event.dataTransfer.files) : [];
      if (dropped.length > 0) void handleFileSelect(dropped);
    };
    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [features.enableFileAttachments, isAuthenticatedWorkspace, isWidget, handleFileSelect]);

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

  // Resolve presence (active | offline) for the conversation header. We can't
  // read PresenceContext from this scope (MainApp renders the provider, so
  // hooks here resolve outside it) — the list view does that. Fall back to
  // the timestamp proxy + socket-ready as a "this thread is live" hint.
  const conversationHeaderPresence = useMemo(() => {
    const lastTimestamp = [...filteredMessagesForHeader].reverse()
      .find((message) => typeof message.timestamp === 'number')?.timestamp;
    return resolveConversationPresence(lastTimestamp ?? null, isSocketReady);
  }, [filteredMessagesForHeader, isSocketReady]);
  const conversationHeaderActiveLabel = conversationHeaderPresence.label;
  const conversationContactName = useMemo(() => (
    resolveConversationContactName(conversationMetadata ?? null)
  ), [conversationMetadata]);
  // Conversation header always shows the contact name (the person being
  // chatted with). No fallback to metadata.title or the practice name —
  // those leak case-internal labels into the header. If the contact is
  // unknown, render a generic placeholder rather than a misleading fallback.
  const conversationCaseTitle = useMemo(() => (
    conversationContactName?.trim() || 'Conversation'
  ), [conversationContactName]);

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

  // On desktop practice/client surfaces the inspector panel is open by default,
  // so the 3-dot inspector toggle in the conversation header would be redundant
  // chrome. Mobile keeps it (the inspector is a drawer there) and the public
  // widget is left untouched.
  const hideInspectorChrome = layoutMode === 'desktop' && isAuthenticatedWorkspace;

  // Pencil rxzde detail header: practice viewers see a primary "Create
  // Engagement" CTA. The CTA jumps to the engagements page where the existing
  // creation flow lives. Hidden on non-desktop layouts (Pencil d08Mpc keeps the
  // mobile detail header spartan — only back + title + overflow menu).
  const createEngagementAction = useMemo(() => {
    if (!isPracticeWorkspace) return null;
    if (!practiceEngagementsPath) return null;
    if (layoutMode !== 'desktop') return null;
    return (
      <Button
        type="button"
        variant="primary"
        size="sm"
        onClick={() => navigate(practiceEngagementsPath)}
        icon={Plus}
        iconClassName="h-4 w-4"
        iconPosition="left"
      >
        Create Engagement
      </Button>
    );
  }, [isPracticeWorkspace, layoutMode, practiceEngagementsPath, navigate]);

  const conversationHeaderActions = useMemo(() => {
    if (!createEngagementAction) return null;
    return (
      <div className="flex items-center gap-2">
        {createEngagementAction}
      </div>
    );
  }, [createEngagementAction]);

  // Pencil rxzde header strip: email + phone + linked-matter chip rendered as a
  // second row below the main header. Email/phone come from the same intake
  // sources used by ConversationContextPanel — keep both surfaces aligned so a
  // value visible in the right panel is also visible up here.
  const conversationHeaderEmail = useMemo(() => {
    const intake = (intakeConversationState ?? null) as Record<string, unknown> | null;
    if (typeof intake?.email === 'string' && intake.email.trim()) return intake.email.trim();
    if (typeof slimContactDraft?.email === 'string' && slimContactDraft.email.trim()) return slimContactDraft.email.trim();
    return '';
  }, [intakeConversationState, slimContactDraft]);
  const conversationHeaderPhone = useMemo(() => {
    const intake = (intakeConversationState ?? null) as Record<string, unknown> | null;
    if (typeof intake?.phone === 'string' && intake.phone.trim()) return intake.phone.trim();
    if (typeof slimContactDraft?.phone === 'string' && slimContactDraft.phone.trim()) return slimContactDraft.phone.trim();
    return '';
  }, [intakeConversationState, slimContactDraft]);
  const conversationHeaderMatterLabel = useMemo(() => {
    const meta = conversationMetadata as Record<string, unknown> | null | undefined;
    const candidates = [
      meta?.matter_title,
      meta?.matterTitle,
      meta?.matter_name,
      meta?.matterName,
    ];
    for (const value of candidates) {
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
  }, [conversationMetadata]);

  const conversationHeaderSecondaryRow = useMemo(() => {
    if (!isPracticeWorkspace) return undefined;
    if (layoutMode !== 'desktop') return undefined;
    if (!conversationHeaderEmail && !conversationHeaderPhone && !conversationHeaderMatterLabel) return undefined;
    return (
      <>
        {conversationHeaderEmail ? (
          <a
            href={`mailto:${conversationHeaderEmail}`}
            className="inline-flex min-w-0 items-center gap-1.5 truncate hover:text-input-text"
          >
            <Icon icon={Mail} className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{conversationHeaderEmail}</span>
          </a>
        ) : null}
        {conversationHeaderPhone ? (
          <a
            href={`tel:${conversationHeaderPhone.replace(/[^0-9+]/g, '')}`}
            className="inline-flex min-w-0 items-center gap-1.5 truncate hover:text-input-text"
          >
            <Icon icon={Phone} className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{conversationHeaderPhone}</span>
          </a>
        ) : null}
        {conversationHeaderMatterLabel ? (
          <span className="inline-flex min-w-0 items-center gap-1.5 truncate rounded-full bg-accent-500/10 px-2 py-0.5 text-accent-utility">
            <Icon icon={Briefcase} className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{conversationHeaderMatterLabel}</span>
          </span>
        ) : null}
      </>
    );
  }, [
    conversationHeaderEmail, conversationHeaderMatterLabel, conversationHeaderPhone,
    isPracticeWorkspace, layoutMode,
  ]);

  // Pencil rxzde inline "• Unread" pill next to the title — only shown when the
  // active conversation hasn't been read yet (socket marks it read once messages
  // are loaded, so this is mostly a transient state on initial open).
  const conversationHeaderUnreadBadge = useMemo(() => {
    if (!isPracticeWorkspace) return undefined;
    if (isSocketReady) return undefined;
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-accent-500/15 px-2 py-0.5 text-[11px] font-semibold text-accent-utility">
        <span className="h-1.5 w-1.5 rounded-full bg-accent-500" aria-hidden="true" />
        Unread
      </span>
    );
  }, [isPracticeWorkspace, isSocketReady]);

  const conversationHeaderContent = useMemo(() => {
    if (!conversationsBasePath || !activeConversationId) return undefined;
    const showConversationBack = shouldShowWorkspaceDetailBack(layoutMode, Boolean(conversationBackPath));
    const headerAvatar = (
      <Avatar
        src={null}
        name={conversationCaseTitle}
        size="sm"
        className="ring-1 ring-line-glass/10"
        status={conversationHeaderPresence.status}
      />
    );
    return (
      <DetailHeader
        title={conversationCaseTitle}
        subtitle={conversationHeaderActiveLabel}
        showBack={showConversationBack}
        onBack={showConversationBack ? () => navigate(conversationBackPath) : undefined}
        leadingAction={headerAvatar}
        actions={conversationHeaderActions}
        titleBadge={conversationHeaderUnreadBadge}
        secondaryRow={conversationHeaderSecondaryRow}
        onInspector={hideInspectorChrome ? undefined : () => {
          if (typeof window === 'undefined') return;
          window.dispatchEvent(new CustomEvent('workspace:open-inspector'));
        }}
        className="workspace-conversation-header"
      />
    );
  }, [
    activeConversationId, conversationBackPath, conversationsBasePath,
    conversationCaseTitle, conversationHeaderActiveLabel, conversationHeaderActions,
    conversationHeaderPresence, conversationHeaderSecondaryRow, conversationHeaderUnreadBadge,
    hideInspectorChrome, layoutMode, navigate,
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
            typingUserIds={typingUserIds}
            readReceiptsByUser={readReceiptsByUser}
            currentUserId={session?.user?.id ?? null}
            sendTypingState={sendTypingState}
            conversationId={liveConversationId ?? null}
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
      settingsIntakeTemplateSlug={routeSettingsIntakeTemplateSlug}
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
      fileUploadProps={{
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
      }}
      mattersView={
        isPracticeWorkspace
          ? (practiceMattersPath
            ? (statusFilter, prefetchData) => (
              <LazyRouteBoundary>
                <PracticeMattersPage
                  basePath={practiceMattersPath}
                  practiceId={effectivePracticeId ?? practiceId}
                  renderMode="full"
                  statusFilter={statusFilter}
                  prefetchedItems={prefetchData?.mattersData?.items}
                  prefetchedLoading={prefetchData?.mattersData?.isLoading}
                  prefetchedError={prefetchData?.mattersData?.error}
                  onRefetchList={prefetchData?.mattersData?.refetch}
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
        isClientWorkspace && layoutMode === 'desktop' && clientMattersPath
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
          : isClientWorkspace
            ? () => (
              <LazyRouteBoundary>
                <ClientIntakesView
                  basePath={clientIntakesPath ?? '/client/intakes'}
                  practiceName={resolvedPracticeName}
                />
              </LazyRouteBoundary>
            )
            : undefined
      }
      engagementsView={
        isPracticeWorkspace
          ? (activeFilter) => (
            <LazyRouteBoundary>
              <EngagementsPage
                practiceId={effectivePracticeId ?? practiceId}
                basePath={practiceEngagementsPath ?? '/practice/engagements'}
                conversationsBasePath={conversationsBasePath}
                practiceName={resolvedPracticeName}
                practiceLogo={resolvedPracticeLogo}
                activeStatusFilter={activeFilter}
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
              icon: Plus,
            }
          : (resolvedWorkspaceView === 'invoiceCreate' || resolvedWorkspaceView === 'invoiceEdit') && isPracticeWorkspace
            ? {
                label: 'Review Invoice',
                onClick: () => window.dispatchEvent(new CustomEvent(INVOICE_CREATE_SEND_EVENT)),
                icon: Send,
              }
          : resolvedWorkspaceView === 'invoices' && isPracticeWorkspace && practiceInvoicesPath
            ? {
                label: 'New Invoice',
                onClick: () => navigate(`${practiceInvoicesPath}/new?returnTo=${encodeURIComponent(returnToPath)}`),
                icon: Plus,
              }
          : resolvedWorkspaceView === 'contacts' && isPracticeWorkspace && practiceContactsPath
            ? {
                label: 'Invite Contact',
                onClick: () => navigate(`${practiceContactsPath}?create=1`),
                icon: Plus,
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
    onSubmitNow: handleConfirmSubmit,
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
      {!isWidget && <DragDropOverlay isVisible={isDraggingFiles} />}
      <IntakeProvider value={intakeProviderValue}>
        <PresenceProvider
          practiceId={effectivePracticeId ?? practiceId ?? null}
          userId={session?.user?.id ?? null}
          enabled={!isWidget && !isAnonymous}
        >
          <div className={rootClassName}>
            <RoutePracticeProvider value={routePracticeContextValue}>
              {workspacePage}
            </RoutePracticeProvider>
          </div>
        </PresenceProvider>
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
