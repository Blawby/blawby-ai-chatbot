import { FunctionComponent, type ComponentChildren } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useTranslation } from '@/shared/i18n/hooks';
import { Button } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { X, Home, MessagesSquare, Info } from 'lucide-preact';

import ChatContainer from '@/features/chat/components/ChatContainer';
import InspectorPanel from '@/shared/ui/inspector/InspectorPanel';
import WorkspaceHomeView from '@/features/chat/views/WorkspaceHomeView';
import { IntakeFirmBar } from '@/features/intake/components/IntakeFirmBar';
import { useToastContext } from '@/shared/contexts/ToastContext';
import WidgetConversationListView from '@/features/chat/views/WidgetConversationListView';
import { useConversations } from '@/shared/hooks/useConversations';
import { useMessageHandling } from '@/shared/hooks/useMessageHandling';
import { useConversationSystemMessages } from '@/shared/hooks/useConversationSystemMessages';
import { ChatActionCard } from '@/features/chat/components/ChatActionCard';
import { createConversation } from '@/shared/lib/conversationApi';
import { postToParentFrame, resolveAllowedParentOrigins } from '@/shared/utils/widgetEvents';
import { setupGlobalKeyboardListeners } from '@/shared/utils/keyboard';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
import { resolveConversationContactName, resolveConversationDisplayTitle } from '@/shared/utils/conversationDisplay';
import { usePracticeDetails } from '@/shared/hooks/usePracticeDetails';
import { practiceDetailsStore } from '@/shared/stores/practiceDetailsStore';
import { useStore } from '@nanostores/preact';
import { LeftRail, type LeftRailItem } from '@/design-system/layout';
import type { ConversationMetadata, ConversationMode } from '@/shared/types/conversation';
import type { UIPracticeConfig } from '@/shared/hooks/usePracticeConfig';
import DragDropOverlay from '@/shared/ui/DragDropOverlay';
import { resolveStrengthStyle, resolveStrengthTier } from '@/shared/utils/intakeStrength';
import { resolveConsultationState } from '@/shared/utils/consultationState';
import { FocusDrawer } from '@/design-system/layout';
import { features } from '@/config/features';
import { IntakeProvider } from '@/shared/contexts/IntakeContext';
import type { FileAttachment } from '../../worker/types';
import type { UploadingFile } from '@/shared/types/upload';
import type { IntakeTemplate } from '@/shared/types/intake';
import type { AuthSessionPayload } from '@/shared/types/user';
import { DEFAULT_INTAKE_TEMPLATE } from '@/shared/constants/intakeTemplates';
import { INTAKE_HARD_ERROR_MESSAGE } from '@/shared/constants/intakeErrors';

// Widget mode never supports file uploads — stable references avoid ChatContainer re-renders.
const EMPTY_FILE_ATTACHMENTS: FileAttachment[] = [];
const EMPTY_UPLOADING_FILES: UploadingFile[] = [];

const safeGetSessionItem = (key: string): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeSetSessionItem = (key: string, value: string): void => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Ignore storage errors in restricted contexts
  }
};

interface WidgetAppProps {
  practiceId: string;
  practiceConfig: UIPracticeConfig;
  routeConversationId?: string;
  bootstrapConversationId?: string | null;
  bootstrapSession?: AuthSessionPayload;
  /** Resolved intake template from bootstrap. Falls back to DEFAULT_INTAKE_TEMPLATE if absent. */
  intakeTemplate?: IntakeTemplate | null;
}

export const WidgetApp: FunctionComponent<WidgetAppProps> = ({
  practiceId,
  practiceConfig,
  routeConversationId,
  bootstrapConversationId,
  bootstrapSession,
  intakeTemplate: intakeTemplateProp,
}) => {
  // Chat-first public intake: the public widget opens straight into the
  // conversation surface (Intake.html / Mobile.html intake variant) instead
  // of the card-grid home — the home view remains reachable via the
  // bottom-rail Home button and via the chat header back button.
  // routeConversationId still wins when present so deep-linked
  // conversations behave as before. On mobile this also means the very
  // first thing a visitor sees is the AI intro bubble, not a card grid.
  //
  // TODO(mobile-keyboard): soft-keyboard handling is wired downstream in
  // ChatContainer via window.visualViewport (it shifts the sticky composer
  // above the keyboard via `keyboardInsetPx`). Long-tail iOS Safari quirks
  // around scroll-into-view of the last message on focus are non-trivial
  // without a real device test pass — leaving in-situ until QA can verify
  // on hardware. If issues surface, the fix lives in ChatContainer, not
  // this file.
  const [view, setView] = useState<'home' | 'list' | 'chat'>('chat');
  const [setupConversationId, setConversationId] = useState<string | null>(null);
  const [bootstrapIgnored, setBootstrapIgnored] = useState(false);
  const creatingConversationRef = useRef<Promise<string> | null>(null);
  // Default to REQUEST_CONSULTATION so the chat surface mounts immediately
  // (`canChat` requires either a conversation or a mode) and the AI starts the
  // canonical intake flow on first turn.
  const [conversationMode, setConversationMode] = useState<ConversationMode | null>('REQUEST_CONSULTATION');
  
  // Disclaimer & Mode tracking
  const [pendingMode, setPendingMode] = useState<ConversationMode | null>(null);
  const [isDisclaimerAccepted, setIsDisclaimerAccepted] = useState(() => 
    safeGetSessionItem(`blawby-widget-disclaimer-accepted:${practiceId}`) === 'true'
  );
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

  const currentUserId = bootstrapSession?.user?.id ?? null;
  // If there's no bootstrap user, default to anonymous=true. If a user exists,
  // prefer the explicit backend field (coerced to boolean) so a missing
  // `is_anonymous` does not incorrectly mark an authenticated user anonymous.
  const isAnonymous = bootstrapSession?.user ? Boolean(bootstrapSession.user.is_anonymous) : true;

  const isEmbedded = typeof window !== 'undefined' && window.parent !== window;

  const effectiveConversationId = routeConversationId ?? setupConversationId ?? (bootstrapIgnored ? null : bootstrapConversationId) ?? null;

  // Derive active template from prop on every render so updates propagate
  const activeIntakeTemplate = intakeTemplateProp ?? DEFAULT_INTAKE_TEMPLATE;

  const createConversationIfNeeded = useCallback(async () => {
    if (effectiveConversationId) return effectiveConversationId;
    // Use ref-based lock to prevent concurrent creation calls during the same tick
    // or while a fetch is already in flight.
    if (creatingConversationRef.current) {
      return creatingConversationRef.current;
    }

    const createPromise = (async () => {
      try {
        const newId = await createConversation(practiceId, {
          status: 'draft',
          // Embed the resolved template so the worker can read it back on
          // every subsequent AI turn without a separate lookup.
          extraMetadata: { intakeTemplate: activeIntakeTemplate },
        });
        locallyCreatedConversationIds.current.add(newId);
        setBootstrapIgnored(true);
        setConversationId(newId);
        return newId;
      } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('Failed to create deferred conversation', error);
        }
        throw error;
      } finally {
        creatingConversationRef.current = null;
      }
    })();

    creatingConversationRef.current = createPromise;
    return createPromise;
  }, [effectiveConversationId, practiceId, setConversationId, activeIntakeTemplate]);

  const { details: practiceDetails } = usePracticeDetails(practiceId, practiceConfig.slug);
  
  // Use reactive practice details from store to ensure re-renders on updates
  const practiceDetailsMap = useStore(practiceDetailsStore);
  const cachedPracticeDetails = practiceDetailsMap[practiceId] || practiceDetails;

  // Fetch conversations to show "Recent Message" on home page and for the list view.
  // include=latest_message hands us the preview text on the list response so we
  // don't fan out per-conversation /messages?source=preview calls.
  const { conversations, isLoading: isConversationsLoading } = useConversations({
    practiceId,
    list: true,
    enabled: Boolean(practiceId),
    allowAnonymous: true,
    status: 'active',
    includeLatestMessage: true,
  });

  const visibleConversations = useMemo(
    () => conversations.filter((conversation) => conversation.user_info?.mode !== 'PRACTICE_ASSISTANT'),
    [conversations],
  );

  const latestConversation = useMemo(() => {
    if (!visibleConversations) return null;
    // Pick the first conversation that actually has a message (not an empty prewarmed draft)
    return visibleConversations.find(c => Boolean(c.last_message_at || c.last_message_content || c.latest_message?.content)) || null;
  }, [visibleConversations]);

  const recentMessage = useMemo(() => {
    if (!latestConversation) return null;
    const conversationLabel = resolveConversationDisplayTitle(latestConversation, practiceConfig.name || 'Assistant');
    const previewContent = latestConversation.latest_message?.content
      ?? latestConversation.last_message_content
      ?? latestConversation.user_info?.title
      ?? 'Click to continue your conversation';
    return {
      preview: previewContent,
      timestampLabel: formatRelativeTime(latestConversation.updated_at),
      senderLabel: conversationLabel,
      avatarSrc: practiceConfig.profileImage,
      conversationId: latestConversation.id
    };
  }, [latestConversation, practiceConfig.name, practiceConfig.profileImage]);

  // Previews for ConversationListView — read latest_message off each row.
  const previews = useMemo(() => {
    const map: Record<string, { content: string; role: string; createdAt: string }> = {};
    visibleConversations.forEach(c => {
      map[c.id] = {
        content: c.latest_message?.content || c.last_message_content || c.user_info?.title || 'No messages yet',
        role: c.latest_message?.role || 'assistant',
        createdAt: c.latest_message?.created_at || c.updated_at,
      };
    });
    return map;
  }, [visibleConversations]);

  const { t } = useTranslation('common');

  // U8: hard-error state for intake AI failure. Tagged with the conversationId
  // it belongs to so we never need a useEffect to "reset on conversation
  // change" — the render-time conversationId comparison below produces the
  // same behavior without crossing the "when X changes set Y" rule from
  // AGENTS.md. setSseError is called from handleMessageError; nothing else
  // mutates the state, and stale entries from prior conversations are simply
  // ignored at render time.
  const [sseError, setSseError] = useState<{
    conversationId: string | null;
    message: string;
    failureReason: string | null;
  } | null>(null);
  const [clearInputCounter, setClearInputCounter] = useState(0);

  const handleMessageError = useCallback((error: unknown, context?: Record<string, unknown>) => {
    let message: string;
    if (typeof error === 'string') {
      message = error;
    } else if (error instanceof Error) {
      message = error.message;
    } else {
      message = t('weHitASnag.sendingMessage');
    }
    if (message.toLowerCase().includes('chat connection closed')) return;

    if (context?.isHardError === true) {
      // End-of-conversation marker, not a toast. Composer renders disabled
      // + inline error. We capture the conversationId here so a subsequent
      // navigation away renders the error gone without a reset effect.
      const failureReason = typeof context.failureReason === 'string' ? context.failureReason : null;
      const conversationId = typeof context.conversationId === 'string'
        ? context.conversationId
        : effectiveConversationId ?? null;
      setSseError({ conversationId, message, failureReason });
      setClearInputCounter((c) => c + 1);
      return;
    }

    showErrorRef.current?.(message || t('weHitASnag.sendingMessage'));
  }, [t, effectiveConversationId]);

  // Derive the hard-error signal at render time from two sources:
  //   1. SSE-triggered state from this session (only used when the
  //      conversationId still matches the active conversation; otherwise the
  //      sseError is from a prior conversation and renders as null).
  //   2. The current conversation's `ai_failed_at` from the envelope, for
  //      page-reload restoration where the SSE event is long gone.
  // SSE wins when both are set — it's the more recent signal and may carry a
  // richer failureReason than the timestamp-only envelope marker.
  const activeConversationRecord = useMemo(
    () => conversations.find((c) => c.id === effectiveConversationId) ?? null,
    [conversations, effectiveConversationId],
  );

  const hardErrorFromSse =
    sseError && sseError.conversationId === effectiveConversationId
      ? { message: sseError.message, failureReason: sseError.failureReason }
      : null;

  const hardErrorFromConversation = useMemo(
    () =>
      activeConversationRecord?.ai_failed_at
        ? { message: INTAKE_HARD_ERROR_MESSAGE, failureReason: null }
        : null,
    [activeConversationRecord?.ai_failed_at],
  );

  const hardError = hardErrorFromSse ?? hardErrorFromConversation;

  const handleConversationMetadataUpdated = useCallback((metadata: ConversationMetadata | null) => {
    if (metadata?.mode) setConversationMode(metadata.mode);
  }, []);



  const messageHandling = useMessageHandling({
    practiceId,
    practiceSlug: practiceConfig.slug ?? undefined,
    conversationId: effectiveConversationId ?? undefined,
    onEnsureConversation: createConversationIfNeeded,
    userId: currentUserId,
    isAnonymous,
    linkAnonymousConversationOnLoad: true,
    mode: conversationMode,
    onConversationMetadataUpdated: handleConversationMetadataUpdated,
    onError: handleMessageError,
    skipInitialFetch: locallyCreatedConversationIds.current.has(effectiveConversationId ?? ''),
  });

  const {
    messages, conversationMetadata, sendMessage, addMessage: _addMessage, clearMessages,
    requestMessageReactions, toggleMessageReaction,
    intakeStatus, intakeConversationState, handleIntakeCtaResponse: _handleIntakeCtaResponse,
    slimContactDraft, handleSlimFormContinue: _handleSlimFormContinue, handleBuildBrief: _handleBuildBrief, handleConfirmSubmit: _handleConfirmSubmit, handleFinalizeSubmit: _handleFinalizeSubmit,
    startConsultFlow: _startConsultFlow, updateConversationMetadata: _updateConversationMetadata, isConsultFlowActive: _isConsultFlowActive,
    ingestServerMessages, messagesReady, hasMoreMessages, isLoadingMoreMessages,
    loadMoreMessages, isSocketReady, applyIntakeFields,
    typingUserIds, readReceiptsByUser, sendTypingState,
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

  const _handleStrengthenCase = useCallback(async () => {
    try {
      // Clear ctaShown so the submit button disappears during enrichment.
      // Without this, ctaShown: true persists from the required-fields-complete
      // state and the UI keeps showing submit even while collecting optional fields.
      await applyIntakeFields({ enrichmentMode: true, ctaShown: false });
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
    const source = activeIntakeTemplate?.introMessage ?? cachedPracticeDetails?.introMessage ?? practiceConfig.introMessage;
    return typeof source === 'string' ? source.trim() : '';
  }, [activeIntakeTemplate, cachedPracticeDetails?.introMessage, practiceConfig.introMessage]);

  const widgetLegalDisclaimer = useMemo(() => {
    const source = activeIntakeTemplate?.legalDisclaimer ?? cachedPracticeDetails?.legalDisclaimer ?? practiceConfig.legalDisclaimer;
    return typeof source === 'string' ? source.trim() : '';
  }, [activeIntakeTemplate, cachedPracticeDetails?.legalDisclaimer, practiceConfig.legalDisclaimer]);




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
    if (!widgetIntroMessage || hasConversationStarted) return;
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
  }, [messagesReady, widgetIntroMessage, hasConversationStarted, messageHandling, hasIntro]);

  // Inject intro when conversation becomes active and no intro exists, only after messagesReady
  useEffect(() => {
    if (messagesReady) {
      maybeInjectIntro();
    }
  }, [messagesReady, activeConversationId, maybeInjectIntro]);

  // Allow chat container to render if intake/chat flow is active or mode selection is pending
  const canChat = activeConversationId != null || conversationMode != null;
  const _isComposerDisabled = false; // Add recording check if needed

  // Mode selection: record user's intent. If disclaimer is needed, gate it here.
  const handleModeSelection = useCallback(async (mode: ConversationMode) => {
    if (!practiceId) return;

    if (widgetLegalDisclaimer && !isDisclaimerAccepted) {
      setPendingMode(mode);
      return; // Stop here — show disclaimer on home view
    }

    // When switching to a new mode, reset conversation state for a clean intake flow
    setConversationMode(mode);
    setConversationId(null); // Force new conversation for new mode
    setBootstrapIgnored(true); // Ignore bootstrap conversation
    clearMessages(); // Clear any previous messages so intro/system prompt is injected
    setView('chat');
  }, [practiceId, widgetLegalDisclaimer, isDisclaimerAccepted, clearMessages]);

  const handleAcceptDisclaimer = useCallback(async () => {
    // Batch state updates to guarantee disclaimer card unmounts immediately
    setIsDisclaimerAccepted(true);
    setPendingMode(null);
    safeSetSessionItem(`blawby-widget-disclaimer-accepted:${practiceId}`, 'true');
    // Always transition to chat view and reset conversation state for a clean compose state
    if (pendingMode) {
      setConversationMode(pendingMode);
      setConversationId(null); // Reset conversation so a new one is created if needed
      setBootstrapIgnored(true); // Ignore bootstrap conversation after disclaimer
      clearMessages(); // Clear any previous messages so intro/system prompt is injected (matches handleModeSelection)
      setView('chat');
    } else {
      // Defensive: if no pendingMode, still go to chat
      setView('chat');
    }
  }, [practiceId, pendingMode, clearMessages]);

  const attachmentsDisabledMessage = t('chat.attachments.disabled');

  // File Uploads
  const previewFiles = EMPTY_FILE_ATTACHMENTS;
  const uploadingFiles = EMPTY_UPLOADING_FILES;
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
      className="text-ink/60 hover:text-ink card backdrop-blur-md border border-line-subtle shadow-lg"
    >
      <Icon icon={X} className="h-5 w-5" />
    </Button>
  ), [requestWidgetClose]);

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

  // Compose the firm-bar sub-line per Intake.html — practice area, jurisdiction,
  // bar number (when available). Falls back gracefully when fields are absent;
  // returns an empty string only when nothing useful is set, which IntakeFirmBar
  // treats as "hide the line entirely".
  const firmBarSubtitle = useMemo(() => {
    const segments: string[] = [];
    const servicesRaw = cachedPracticeDetails?.services;
    if (Array.isArray(servicesRaw) && servicesRaw.length > 0) {
      const names = servicesRaw
        .map((s) => {
          if (!s || typeof s !== 'object') return null;
          const name = (s as Record<string, unknown>).name;
          return typeof name === 'string' && name.trim() ? name.trim() : null;
        })
        .filter((n): n is string => Boolean(n));
      if (names.length > 0) {
        segments.push(names.length <= 2 ? names.join(', ') : `${names.slice(0, 2).join(', ')} +${names.length - 2}`);
      }
    }
    const city = cachedPracticeDetails?.city?.trim();
    const stateAbbr = cachedPracticeDetails?.state?.trim();
    if (city || stateAbbr) {
      segments.push([city, stateAbbr].filter(Boolean).join(', '));
    }
    const metadata = cachedPracticeDetails?.metadata;
    const barRaw = metadata && typeof metadata === 'object'
      ? (metadata as Record<string, unknown>).barNumber ?? (metadata as Record<string, unknown>).bar_number
      : undefined;
    const bar = typeof barRaw === 'string' && barRaw.trim() ? barRaw.trim() : null;
    if (bar && stateAbbr) {
      segments.push(`${stateAbbr} Bar #${bar}`);
    } else if (bar) {
      segments.push(`Bar #${bar}`);
    }
    return segments.join(' · ');
  }, [cachedPracticeDetails]);

  const isReady = useMemo(() => currentUserId !== null && isSocketReady && messagesReady, [currentUserId, isSocketReady, messagesReady]);


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
          <Icon icon={Info} className="relative z-10 h-3.5 w-3.5" aria-hidden="true" />
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

  useEffect(() => {
    // Widget shell is always rendered with the midnight (dark) theme.
    document.documentElement.setAttribute('data-theme', 'midnight');
  }, []);

  const intakeProviderValue = useMemo(() => ({
    intakeStatus,
    intakeConversationState,
    onIntakeCtaResponse: _handleIntakeCtaResponse,
    onSubmitNow: _handleConfirmSubmit,
    onBuildBrief: _handleBuildBrief,
    onStrengthenCase: _handleStrengthenCase,
    slimContactDraft,
    onSlimFormContinue: _handleSlimFormContinue,
    onSlimFormDismiss: undefined,
    isPublicWorkspace: true,
  }), [
    intakeStatus,
    intakeConversationState,
    _handleIntakeCtaResponse,
    _handleConfirmSubmit,
    _handleBuildBrief,
    _handleStrengthenCase,
    slimContactDraft,
    _handleSlimFormContinue
  ]);
  const withIntakeProvider = (content: ComponentChildren) => (
    <IntakeProvider value={intakeProviderValue}>
      {content}
    </IntakeProvider>
  );

  return (
    <>
      <DragDropOverlay isVisible={isDragging} />
      {withIntakeProvider(
        <div className={`absolute inset-x-0 inset-y-0 h-[100dvh] w-full overflow-hidden flex flex-col supports-[height:100cqh]:h-[100cqh] supports-[height:100svh]:h-[100svh] widget-shell-gradient justify-end`}>
        {view === 'home' && (
          <div className="flex h-full flex-col overflow-hidden relative">
            <div className="flex-1 overflow-y-auto">
              <WorkspaceHomeView
                practiceName={practiceConfig.name || ''}
                practiceLogo={practiceConfig.profileImage}
                recentMessage={latestConversation ? {
                  conversationId: latestConversation.id,
                  preview: recentMessage?.preview || '',
                  timestampLabel: recentMessage?.timestampLabel || '',
                  senderLabel: recentMessage?.senderLabel || ''
                } : null}
                onOpenRecentMessage={() => {
                  if (latestConversation?.id) {
                    setConversationId(latestConversation.id);
                    setView('chat');
                  }
                }}
                onSendMessage={() => handleModeSelection('ASK_QUESTION')}
                onRequestConsultation={() => handleModeSelection('REQUEST_CONSULTATION')}
              />
            </div>
            
            {widgetLegalDisclaimer && pendingMode && !isDisclaimerAccepted && (
              <ChatActionCard
                type="disclaimer"
                isOpen={true}
                onClose={() => setPendingMode(null)}
                disclaimerProps={{
                  text: widgetLegalDisclaimer,
                  onAccept: handleAcceptDisclaimer,
                  isSubmitting: false
                }}
              />
            )}
          </div>
        )}
        {view === 'list' && (
          <WidgetConversationListView
            conversations={visibleConversations}
            previews={previews}
            practiceName={practiceConfig.name}
            isLoading={isConversationsLoading}
            onSelectConversation={id => {
              setConversationId(id);
              setView('chat');
            }}
            onSendMessage={() => handleModeSelection('ASK_QUESTION')}
          />
        )}
        {view === 'chat' && (
          <>
            {/* Debug: log readiness and bootstrap session user id to help diagnose disabled composer */}
            {typeof window !== 'undefined' && process.env.NODE_ENV !== 'production' &&
              console.debug('[WidgetApp isReady]', {
                currentUserId,
                isSocketReady,
                messagesReady,
                bootstrapSessionUser: bootstrapSession?.user?.id,
                effectiveConversationId
              })}

            <div className="flex flex-1 min-h-0 overflow-hidden flex-row">
              <ChatContainer
                messages={messages}
                conversationTitle={resolveConversationDisplayTitle(
                  conversationMetadata ?? null,
                  conversationMetadata?.title ?? ''
                )}
                conversationContactName={resolveConversationContactName(conversationMetadata ?? null)}
                conversationId={activeConversationId}
                onSendMessage={sendMessage}
                isReady={isReady}
                conversationMode={conversationMode}
                onToggleReaction={features.enableMessageReactions ? toggleMessageReaction : undefined}
                onRequestReactions={requestMessageReactions}
                isPublicWorkspace={true}
                messagesReady={messagesReady}
                disclaimerProps={
                  widgetLegalDisclaimer && !isDisclaimerAccepted
                    ? {
                        text: widgetLegalDisclaimer,
                        onAccept: handleAcceptDisclaimer,
                        onClose: () => {
                          // Session-only dismiss — the user can re-open by reloading.
                          setIsDisclaimerAccepted(true);
                          safeSetSessionItem(`blawby-widget-disclaimer-accepted:${practiceId}`, 'true');
                        },
                      }
                    : undefined
                }
                headerContent={
                  <IntakeFirmBar
                    practiceName={practiceConfig.name ?? ''}
                    practiceLogo={practiceConfig.profileImage ?? null}
                    subtitle={firmBarSubtitle || conversationHeaderActiveLabel}
                    leadingAction={
                      <Button
                        type="button"
                        variant="icon"
                        size="icon-sm"
                        onClick={() => {
                          setConversationMode(null);
                          setView('home');
                        }}
                        aria-label="Back to home"
                      >
                        <Icon icon={Home} className="h-5 w-5" />
                      </Button>
                    }
                    actions={widgetChatHeaderActions}
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
                handleFileSelect={handleFileSelect}
                handleMediaCapture={handleMediaCapture}
                cancelUpload={cancelUpload}
                isRecording={false}
                setIsRecording={() => {}}
                isReadyToUpload={isReadyToUpload}

                isAnonymousUser={isAnonymous}
                canChat={canChat}
                hasMoreMessages={hasMoreMessages}
                isLoadingMoreMessages={isLoadingMoreMessages}
                onLoadMoreMessages={loadMoreMessages}
                showAuthPrompt={shouldShowAuthPrompt}
                onAuthPromptRequest={isAnonymous ? handlePaymentAuthRequest : undefined}
                onAuthPromptClose={handleAuthPromptClose}
                onAuthPromptSuccess={handleAuthPromptSuccess}
                typingUserIds={typingUserIds}
                readReceiptsByUser={readReceiptsByUser}
                currentUserId={bootstrapSession?.user?.id ?? null}
                sendTypingState={sendTypingState}
                hardError={hardError}
                clearInput={clearInputCounter}
              />

              {isInspectorOpen && activeConversationId && (
                <aside className="hidden w-80 shrink-0 lg:block lg:w-96 panel overflow-visible shadow-glass ring-1 ring-line-subtle">
                  <div className="h-full overflow-y-auto">
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
                      onIntakeFieldsChange={(patch, options) => {
                        // Remove all null values for IntakeFieldsPayload compatibility
                        const payload: Record<string, unknown> = {};
                        Object.entries(patch).forEach(([key, value]) => {
                          if (value !== null) payload[key] = value;
                        });
                        return applyIntakeFields(payload, options);
                      }}
                      practiceDetails={cachedPracticeDetails}
                    />
                  </div>
                </aside>
              )}
            </div>

            {isInspectorOpen && activeConversationId && (
              <FocusDrawer
                isOpen={true}
                onClose={() => setIsInspectorOpen(false)}
                showCloseButton={false}
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
                  onIntakeFieldsChange={(patch, options) => {
                    const payload: Record<string, unknown> = {};
                    Object.entries(patch).forEach(([key, value]) => {
                      if (value !== null) payload[key] = value;
                    });
                    return applyIntakeFields(payload, options);
                  }}
                  practiceDetails={cachedPracticeDetails}
                />
              </FocusDrawer>
            )}
          </>
        )}

        {view !== 'chat' && (
          <LeftRail
            variant="mobile"
            items={[
              {
                id: 'home',
                label: t('nav.home'),
                icon: Home,
                href: '#home',
                isAction: true,
                isActive: view === 'home',
                onClick: () => {
                  setConversationMode(null);
                  setView('home');
                }
              },
              {
                id: 'list',
                label: t('nav.messages'),
                icon: MessagesSquare,
                href: '#list',
                isAction: true,
                isActive: view === 'list',
                onClick: () => setView('list')
              }
            ] as LeftRailItem[]}
          />
        )}
      </div>
      )}
    </>
  );
};
