import { useState, useEffect, useCallback, useRef, useMemo } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { useLocation } from 'preact-iso';
import ChatContainer from '@/features/chat/components/ChatContainer';
import DragDropOverlay from '@/features/media/components/DragDropOverlay';
import AppLayout from './AppLayout';
import { ConversationHeader } from '@/features/chat/components/ConversationHeader';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import type { SubscriptionTier } from '@/shared/types/user';
import { resolvePracticeKind } from '@/shared/utils/subscription';
import type { UIPracticeConfig } from '@/shared/hooks/usePracticeConfig';
import type { WorkspaceType } from '@/shared/types/workspace';
import { useMessageHandling } from '@/shared/hooks/useMessageHandling';
import { useFileUploadWithContext } from '@/shared/hooks/useFileUpload';
import { setupGlobalKeyboardListeners } from '@/shared/utils/keyboard';
import type { FileAttachment } from '../../worker/types';
import { getConversationEndpoint, getConversationsEndpoint } from '@/config/api';
import { linkConversationToUser } from '@/shared/lib/apiClient';
import { useNavigation } from '@/shared/utils/navigation';
import {
  BanknotesIcon,
  ChatBubbleLeftRightIcon,
  ClipboardDocumentListIcon,
  CreditCardIcon,
  HomeIcon,
  InboxIcon,
  Squares2X2Icon,
  UsersIcon
} from '@heroicons/react/24/outline';
import PricingModal from '@/features/modals/components/PricingModal';
import WelcomeModal from '@/features/modals/components/WelcomeModal';
import { useWelcomeModal } from '@/features/modals/hooks/useWelcomeModal';
import { getPreferencesCategory, updatePreferencesCategory } from '@/shared/lib/preferencesApi';
import type { OnboardingPreferences } from '@/shared/types/preferences';
import { BusinessWelcomePrompt } from '@/features/onboarding/components/BusinessWelcomePrompt';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { clearPendingPracticeInviteLink, readPendingPracticeInviteLink } from '@/shared/utils/practiceInvites';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { usePracticeDetails } from '@/shared/hooks/usePracticeDetails';
import { ConversationSidebar } from '@/features/chats/components/ConversationSidebar';
import type { ConversationMetadata, ConversationMode } from '@/shared/types/conversation';
import { logConversationEvent } from '@/shared/lib/conversationApi';
import { LeadsPage } from '@/features/leads/pages/LeadsPage';
import { hasLeadReviewPermission } from '@/shared/utils/leadPermissions';
import { PracticeHomePage } from '@/features/home/pages/PracticeHomePage';
import { PracticePaymentsPage } from '@/features/payments/pages/PracticePaymentsPage';
import { PracticePayoutsPage } from '@/features/payouts/pages/PracticePayoutsPage';
import { PracticePricingPage } from '@/features/pricing/pages/PracticePricingPage';
import { PracticeClientsPage } from '@/features/clients/pages/PracticeClientsPage';
import { PracticeMattersPage } from '@/features/matters/pages/PracticeMattersPage';
import { ClientPaymentsPage } from '@/features/payments/pages/ClientPaymentsPage';
import { ClientMattersPage } from '@/features/matters/pages/ClientMattersPage';
import type { SidebarNavItem } from '@/shared/ui/sidebar/organisms/SidebarContent';
import { useConversationSystemMessages } from '@/features/chat/hooks/useConversationSystemMessages';

type RouteKey =
  | 'home'
  | 'payments'
  | 'payouts'
  | 'pricing'
  | 'clients'
  | 'leads'
  | 'matters'
  | 'conversations';

// Main application component (non-auth pages)
export function MainApp({
  practiceId,
  practiceConfig,
  practiceNotFound,
  handleRetryPracticeConfig,
  isPracticeView,
  workspace,
  settingsOverlayOpen,
  chatContent,
  activeRoute,
  routeConversationId,
  publicPracticeSlug
}: {
  practiceId: string;
  practiceConfig: UIPracticeConfig;
  practiceNotFound: boolean;
  handleRetryPracticeConfig: () => void;
  isPracticeView: boolean;
  workspace: WorkspaceType;
  settingsOverlayOpen?: boolean;
  chatContent?: ComponentChildren;
  activeRoute: RouteKey;
  routeConversationId?: string;
  publicPracticeSlug?: string;
}) {
  // Core state
  const [clearInputTrigger, setClearInputTrigger] = useState(0);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const location = useLocation();
  const { navigate } = useNavigation();
  const isSettingsRouteNow = settingsOverlayOpen ?? location.path.startsWith('/settings');
  const [showBusinessWelcome, setShowBusinessWelcome] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);
  const [conversationMode, setConversationMode] = useState<ConversationMode | null>(null);
  const postAuthLinkHandledRef = useRef(false);
  const conversationRestoreAttemptedRef = useRef(false);
  const isPublicWorkspace = workspace === 'public';
  const resolvedPublicPracticeSlug = useMemo(() => {
    if (!isPublicWorkspace) return null;
    return publicPracticeSlug ?? practiceConfig.slug ?? practiceId ?? null;
  }, [isPublicWorkspace, practiceConfig.slug, practiceId, publicPracticeSlug]);
  const publicConversationsBasePath = useMemo(() => {
    if (!resolvedPublicPracticeSlug) return null;
    return `/embed/${encodeURIComponent(resolvedPublicPracticeSlug)}/conversations`;
  }, [resolvedPublicPracticeSlug]);
  const conversationResetKey = useMemo(() => {
    if (isPublicWorkspace) return resolvedPublicPracticeSlug ?? '';
    return practiceId;
  }, [isPublicWorkspace, practiceId, resolvedPublicPracticeSlug]);

  useEffect(() => {
    setConversationId(null);
    setConversationMode(null);
    conversationRestoreAttemptedRef.current = false;
  }, [conversationResetKey]);

  const basePath = useMemo(() => {
    if (workspace === 'practice') return '/practice';
    if (workspace === 'client') return '/client';
    return null;
  }, [workspace]);
  const conversationsBasePath = useMemo(() => (basePath ? `${basePath}/conversations` : null), [basePath]);
  const resolvedConversationsBasePath = useMemo(
    () => conversationsBasePath ?? publicConversationsBasePath,
    [conversationsBasePath, publicConversationsBasePath]
  );
  const routeKey = activeRoute;

  const practiceNavItems = useMemo<SidebarNavItem[]>(() => ([
    {
      id: 'home',
      label: 'Home',
      icon: <HomeIcon />,
      isActive: routeKey === 'home',
      onClick: () => navigate('/practice/home')
    },
    {
      id: 'payments',
      label: 'Payments',
      icon: <CreditCardIcon />,
      isActive: routeKey === 'payments',
      onClick: () => navigate('/practice/payments')
    },
    {
      id: 'payouts',
      label: 'Payouts',
      icon: <BanknotesIcon />,
      isActive: routeKey === 'payouts',
      onClick: () => navigate('/practice/payouts')
    },
    {
      id: 'pricing',
      label: 'Pricing',
      icon: <Squares2X2Icon />,
      isActive: routeKey === 'pricing',
      onClick: () => navigate('/practice/pricing')
    },
    {
      id: 'clients',
      label: 'Clients',
      icon: <UsersIcon />,
      isActive: routeKey === 'clients',
      onClick: () => navigate('/practice/clients')
    },
    {
      id: 'leads',
      label: 'Leads',
      icon: <InboxIcon />,
      isActive: routeKey === 'leads',
      onClick: () => navigate('/practice/leads')
    },
    {
      id: 'matters',
      label: 'Matters',
      icon: <ClipboardDocumentListIcon />,
      isActive: routeKey === 'matters',
      onClick: () => navigate('/practice/matters')
    }
  ]), [navigate, routeKey]);

  const clientNavItems = useMemo<SidebarNavItem[]>(() => ([
    {
      id: 'conversations',
      label: 'Conversations',
      icon: <ChatBubbleLeftRightIcon />,
      isActive: routeKey === 'conversations',
      onClick: () => navigate('/client/conversations')
    },
    {
      id: 'payments',
      label: 'Payments',
      icon: <CreditCardIcon />,
      isActive: routeKey === 'payments',
      onClick: () => navigate('/client/payments')
    },
    {
      id: 'matters',
      label: 'Matters',
      icon: <ClipboardDocumentListIcon />,
      isActive: routeKey === 'matters',
      onClick: () => navigate('/client/matters')
    }
  ]), [navigate, routeKey]);

  const navItems = workspace === 'practice'
    ? practiceNavItems
    : (workspace === 'client' ? clientNavItems : []);

  const normalizedRouteConversationId = useMemo(() => {
    if (!routeConversationId) return null;
    try {
      return decodeURIComponent(routeConversationId);
    } catch (error) {
      console.warn('[MainApp] Failed to decode conversation id from route params', {
        id: routeConversationId,
        error
      });
      return routeConversationId;
    }
  }, [routeConversationId]);

  useEffect(() => {
    if (!normalizedRouteConversationId) return;
    if (normalizedRouteConversationId === conversationId) return;
    setConversationId(normalizedRouteConversationId);
    setConversationMode(null);
  }, [conversationId, normalizedRouteConversationId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (postAuthLinkHandledRef.current) return;

    const url = new URL(window.location.href);
    const conversationIdParam = url.searchParams.get('conversationId');
    const practiceIdParam = url.searchParams.get('practiceId');
    if (!conversationIdParam || !practiceIdParam) return;

    postAuthLinkHandledRef.current = true;
    const postAuthRedirectKey = 'post-auth-redirect';
    const postAuthRedirect = sessionStorage.getItem(postAuthRedirectKey);
    const isSafeRedirect = (path: string) => {
      try {
        const parsed = new URL(path, window.location.origin);
        return parsed.origin === window.location.origin;
      } catch {
        return path.startsWith('/') && !path.match(/^\/[\\/]/);
      }
    };

    const cleanupUrl = () => {
      url.searchParams.delete('conversationId');
      url.searchParams.delete('practiceId');
      const cleaned = `${url.pathname}${url.search}${url.hash}`;
      window.history.replaceState({}, '', cleaned);
    };

    (async () => {
      try {
        await linkConversationToUser(conversationIdParam, practiceIdParam);
      } catch (error) {
        console.error('[MainApp] Failed to link conversation from auth redirect', error);
      }

      if (postAuthRedirect) {
        sessionStorage.removeItem(postAuthRedirectKey);
        if (isSafeRedirect(postAuthRedirect)) {
          navigate(postAuthRedirect);
          return;
        }
      }

      cleanupUrl();
    })();
  }, [navigate]);

  useEffect(() => {
    if (isPublicWorkspace) return;
    if (!resolvedConversationsBasePath) return;
    if (routeKey !== 'conversations') return;
    if (!conversationId) return;
    if (normalizedRouteConversationId === conversationId) return;
    const targetPath = `${resolvedConversationsBasePath}/${encodeURIComponent(conversationId)}`;
    navigate(targetPath, true);
  }, [isPublicWorkspace, normalizedRouteConversationId, resolvedConversationsBasePath, conversationId, routeKey, navigate]);

  // Use session from Better Auth
  const { session, isPending: sessionIsPending, isAnonymous, activeMemberRole } = useSessionContext();
  const isAnonymousUser = isAnonymous;
  const isPracticeWorkspace = workspace === 'practice';
  const conversationCacheKey = useMemo(() => {
    if (isPublicWorkspace) {
      return null;
    }
    if (!practiceId || !session?.user?.id) {
      return null;
    }
    return `chat:lastConversation:${workspace}:${practiceId}:${session.user.id}`;
  }, [isPublicWorkspace, practiceId, session?.user?.id, workspace]);
  const effectivePracticeId = useMemo(() => {
    if (isPublicWorkspace) {
      if (
        practiceConfig.id &&
        resolvedPublicPracticeSlug &&
        practiceConfig.slug === resolvedPublicPracticeSlug
      ) {
        return practiceConfig.id;
      }
      return practiceId || undefined;
    }
    return practiceId || undefined;
  }, [isPublicWorkspace, practiceConfig.id, practiceConfig.slug, practiceId, resolvedPublicPracticeSlug]);

  // Practice data is now passed as props

  // Using our custom practice system instead of Better Auth's organization plugin
  // Removed unused submitUpgrade
  const { showError, showInfo } = useToastContext();
  const showErrorRef = useRef(showError);
  const practiceWelcomeCheckRef = useRef(false);
  const isSelectingRef = useRef(false);
  useEffect(() => {
    showErrorRef.current = showError;
  }, [showError]);
  const {
    currentPractice,
    acceptMatter,
    rejectMatter,
    updateMatterStatus
  } = usePracticeManagement({
    autoFetchPractices: workspace !== 'public',
    fetchInvitations: workspace !== 'public'
  });
  const practiceDetailsId = workspace === 'public'
    ? (resolvedPublicPracticeSlug ?? practiceConfig.slug ?? practiceId ?? null)
    : practiceId;
  const {
    details: practiceDetails,
    fetchDetails: fetchPracticeDetails,
    hasDetails: hasPracticeDetails
  } = usePracticeDetails(practiceDetailsId);

  useEffect(() => {
    if (!practiceDetailsId || hasPracticeDetails) return;
    void fetchPracticeDetails();
  }, [fetchPracticeDetails, hasPracticeDetails, practiceDetailsId]);



  const handleMessageError = useCallback((error: string | Error) => {
    const message = typeof error === 'string' ? error : error.message;
    const normalized = message.toLowerCase();
    if (normalized.includes('chat connection closed')) {
      return;
    }
    console.error('Message handling error:', error);
    showErrorRef.current?.(message || 'We hit a snag sending that message.');
  }, []);

  const handleConversationMetadataUpdated = useCallback((metadata: ConversationMetadata | null) => {
    if (metadata?.mode) {
      setConversationMode(metadata.mode);
    }
  }, []);

  const realMessageHandling = useMessageHandling({
    practiceId: effectivePracticeId,
    practiceSlug: practiceConfig.slug ?? undefined,
    conversationId: conversationId ?? undefined,
    mode: conversationMode,
    onConversationMetadataUpdated: handleConversationMetadataUpdated,
    onError: handleMessageError
  });

  const messages = realMessageHandling.messages;
  const addMessage = realMessageHandling.addMessage;
  const clearMessages = realMessageHandling.clearMessages;
  const requestMessageReactions = realMessageHandling.requestMessageReactions;
  const toggleMessageReaction = realMessageHandling.toggleMessageReaction;
  const conversationMetadata = realMessageHandling.conversationMetadata;
  const intakeStatus = realMessageHandling.intakeStatus;
  const startConsultFlow = realMessageHandling.startConsultFlow;
  const updateConversationMetadata = realMessageHandling.updateConversationMetadata;
  const isConsultFlowActive = realMessageHandling.isConsultFlowActive;
  const messagesReady = realMessageHandling.messagesReady;
  const hasMoreMessages = realMessageHandling.hasMoreMessages;
  const isLoadingMoreMessages = realMessageHandling.isLoadingMoreMessages;
  const loadMoreMessages = realMessageHandling.loadMoreMessages;

  useEffect(() => {
    clearMessages();
  }, [practiceId, clearMessages]);

  const createConversation = useCallback(async () => {
    if (isPracticeWorkspace) return null;
    if (!practiceId || !session?.user || isCreatingConversation) return null;

    try {
      setIsCreatingConversation(true);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      const params = new URLSearchParams({ practiceId });
      const url = `${getConversationsEndpoint()}?${params.toString()}`;

      const response = await fetch(url, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          participantUserIds: [session.user.id],
          metadata: { source: 'chat' },
          practiceId
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json() as { success: boolean; error?: string; data?: { id: string } };
      if (!data.success || !data.data?.id) {
        throw new Error(data.error || 'Failed to start conversation');
      }

      setConversationId(data.data.id);
      return data.data.id;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start conversation';
      showErrorRef.current?.(message);
      return null;
    } finally {
      setIsCreatingConversation(false);
    }
  }, [isPracticeWorkspace, practiceId, session?.user, isCreatingConversation]);

  const restoreConversationFromCache = useCallback(async () => {
    if (typeof window === 'undefined') {
      return null;
    }
    if (!conversationCacheKey || !practiceId || !session?.user) {
      return null;
    }
    const cached = window.localStorage.getItem(conversationCacheKey);
    if (!cached) {
      return null;
    }
    if (conversationId === cached) {
      return cached;
    }

    try {
      const params = new URLSearchParams({ practiceId });
      const response = await fetch(
        `${getConversationEndpoint(cached)}?${params.toString()}`,
        {
          method: 'GET',
          credentials: 'include'
        }
      );
      if (!response.ok) {
        window.localStorage.removeItem(conversationCacheKey);
        return null;
      }
      setConversationId(cached);
      return cached;
    } catch (error) {
      console.warn('[MainApp] Failed to restore cached conversation', error);
      return null;
    }
  }, [
    conversationCacheKey,
    conversationId,
    practiceId,
    session?.user
  ]);

  const applyConversationMode = useCallback(async (
    nextMode: ConversationMode,
    activeConversationId: string,
    source: 'intro_gate' | 'composer_footer' | 'home_cta'
  ) => {
    if (!practiceId) return;
    await updateConversationMetadata({
      mode: nextMode
    }, activeConversationId);
    setConversationMode(nextMode);
    void logConversationEvent(activeConversationId, practiceId, 'mode_selected', { mode: nextMode, source });
    if (nextMode === 'REQUEST_CONSULTATION') {
      startConsultFlow(activeConversationId);
      void logConversationEvent(activeConversationId, practiceId, 'consult_flow_started', { source });
    }
  }, [
    practiceId,
    startConsultFlow,
    updateConversationMetadata
  ]);

  const handleModeSelection = useCallback(async (
    nextMode: ConversationMode,
    source: 'intro_gate' | 'composer_footer'
  ) => {
    try {
      if (isSelectingRef.current) {
        return;
      }
      isSelectingRef.current = true;

      let activeConversationId = conversationId;
      if (!activeConversationId && !isCreatingConversation) {
        activeConversationId = await createConversation();
      }
      if (!activeConversationId || !practiceId) {
        return;
      }

      await applyConversationMode(nextMode, activeConversationId, source);
    } catch (error) {
      setConversationMode(null);
      console.warn('[MainApp] Failed to persist conversation mode selection', error);
    } finally {
      isSelectingRef.current = false;
    }
  }, [
    applyConversationMode,
    conversationId,
    createConversation,
    isCreatingConversation,
    practiceId
  ]);

  const handleStartNewConversation = useCallback(async (nextMode: ConversationMode) => {
    try {
      if (isSelectingRef.current) {
        return;
      }
      isSelectingRef.current = true;
      if (!practiceId) {
        return;
      }
      const newConversationId = await createConversation();
      if (!newConversationId) {
        return;
      }
      await applyConversationMode(nextMode, newConversationId, 'home_cta');
    } catch (error) {
      setConversationMode(null);
      console.warn('[MainApp] Failed to start new conversation', error);
    } finally {
      isSelectingRef.current = false;
    }
  }, [applyConversationMode, createConversation, practiceId]);

  const handleSendMessage = useCallback(async (
    message: string,
    attachments: FileAttachment[] = [],
    replyToMessageId?: string | null
  ) => {
    if (!conversationId) {
      showErrorRef.current?.('Setting up your conversation. Please try again momentarily.');
      if (!isCreatingConversation) {
        void createConversation();
      }
      return;
    }

    await realMessageHandling.sendMessage(message, attachments, replyToMessageId ?? null);
  }, [conversationId, isCreatingConversation, createConversation, realMessageHandling]);
  const handleContactFormSubmit = realMessageHandling.handleContactFormSubmit;

  const {
    previewFiles,
    uploadingFiles,
    isDragging,
    setIsDragging,
    handleCameraCapture,
    handleFileSelect,
    removePreviewFile,
    clearPreviewFiles,
    cancelUpload,
    isReadyToUpload
  } = useFileUploadWithContext({
    conversationId: conversationId ?? undefined,
    onError: (error) => {
      // Handle file upload error

      console.error('File upload error:', error);
      showErrorRef.current?.(typeof error === 'string' ? error : 'File upload failed. Please try again.');
    }
  });

  // Session error handling removed - no longer using sessions

  // Welcome modal state via server-truth + session debounce
  const { shouldShow: shouldShowWelcome, markAsShown: markWelcomeAsShown } = useWelcomeModal({
    enabled: workspace !== 'public'
  });
  const showWelcomeModal = shouldShowWelcome && workspace !== 'public';

  // Note: Auto-practice creation removed - clients don't need practices.
  // Practice members (lawyers) will create practices through onboarding/upgrade flow.
  // Clients chat with practices via widget (practiceId from URL), not their own practice.




  // Check if we should show practice welcome modal
  useEffect(() => {
    if (workspace !== 'practice') {
      practiceWelcomeCheckRef.current = false;
      setShowBusinessWelcome(false);
      return;
    }
    if (sessionIsPending || isAnonymous || !session?.user?.id) {
      setShowBusinessWelcome(false);
      return;
    }
    if (practiceWelcomeCheckRef.current) return;
    practiceWelcomeCheckRef.current = true;

    const checkPracticeWelcome = async () => {
      try {
        const prefs = await getPreferencesCategory<OnboardingPreferences>('onboarding');
        const hasCompletedOnboarding = prefs?.completed === true;
        const shouldShow = hasCompletedOnboarding && !prefs?.practice_welcome_shown;

        if (import.meta.env.DEV) {
          console.debug('[PRACTICE_WELCOME][CHECK] preferences', {
            completed: prefs?.completed ?? null,
            practice_welcome_shown: prefs?.practice_welcome_shown ?? null
          });
        }

        setShowBusinessWelcome(shouldShow);
      } catch (error) {
        console.warn('[PRACTICE_WELCOME][CHECK] preferences fetch failed:', error);
        practiceWelcomeCheckRef.current = false;
        setShowBusinessWelcome(false);
      }
    };

    void checkPracticeWelcome();
  }, [isAnonymous, session?.user?.id, sessionIsPending, workspace]);

  // Handle hash-based routing for pricing modal
  const [showPricingModal, setShowPricingModal] = useState(false);

  // Derive current user tier from practice config (our custom system)
  // Note: subscriptionTier is on Practice
  const resolvedKindForTier = resolvePracticeKind(currentPractice?.kind, currentPractice?.isPersonal ?? null);

  // Whitelist of valid SubscriptionTier values
  const VALID_SUBSCRIPTION_TIERS: SubscriptionTier[] = ['free', 'plus', 'business', 'enterprise'];

  // Normalize and validate subscriptionTier
  const normalizedTier = currentPractice?.subscriptionTier
    ? currentPractice.subscriptionTier.trim().toLowerCase()
    : null;

  // Find matching tier from whitelist (case-insensitive) to avoid unsafe casts
  const validatedTier = normalizedTier
    ? VALID_SUBSCRIPTION_TIERS.find(tier => tier.toLowerCase() === normalizedTier)
    : null;

  const currentUserTier: SubscriptionTier = validatedTier
    ? validatedTier
    : resolvedKindForTier === 'business'
      ? 'business'
      : 'free';

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      setShowPricingModal(hash === '#pricing');
    };

    // Check initial hash
    handleHashChange();

    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange);

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  // User tier is now derived directly from practice - no need for custom event listeners

  const shouldRequireModeSelection = workspace === 'public';
  const isConversationReady = Boolean(conversationId && !isCreatingConversation);
  const isAuthReady = Boolean(session?.user) && !sessionIsPending;
  const isSessionReady = isConversationReady && isAuthReady;
  const isSocketReady = isConversationReady && isAuthReady ? realMessageHandling.isSocketReady : false;
  const isComposerDisabled = (shouldRequireModeSelection && !conversationMode) || isConsultFlowActive;
  const canChat = Boolean(practiceId) && (!isPracticeWorkspace ? Boolean(isPracticeView) : Boolean(conversationId));
  const showMatterControls = currentPractice?.id === practiceId && workspace !== 'client';

  useEffect(() => {
    if (isPublicWorkspace) return;
    if (!isAuthReady) return;
    if (!practiceId) return;
    if (conversationId) return;
    if (isCreatingConversation) return;
    if (conversationRestoreAttemptedRef.current) return;
    conversationRestoreAttemptedRef.current = true;

    (async () => {
      try {
        const restored = await restoreConversationFromCache();
        if (restored) {
          return;
        }
      } catch {
        conversationRestoreAttemptedRef.current = false;
      }
    })();
  }, [
    conversationId,
    isAuthReady,
    isCreatingConversation,
    isPublicWorkspace,
    practiceId,
    restoreConversationFromCache,
    session?.user?.id
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const inviteLink = readPendingPracticeInviteLink();
    if (!inviteLink) {
      return;
    }

    try {
      const resolved = new URL(inviteLink, window.location.origin);
      const sameOrigin = resolved.origin === window.location.origin;
      if (sameOrigin) {
        window.location.assign(resolved.toString());
        clearPendingPracticeInviteLink();
        return;
      }

      const opened = window.open(resolved.toString(), '_blank', 'noopener');
      if (opened) {
        clearPendingPracticeInviteLink();
        return;
      }
    } catch (error) {
      console.warn('[Invite] Failed to navigate to invite link', error);
    }

    showInfo('Join your practice', 'Open the invite link sent to your email to finish joining.');
  }, [showInfo]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!conversationCacheKey || !conversationId) return;
    window.localStorage.setItem(conversationCacheKey, conversationId);
  }, [conversationCacheKey, conversationId]);

  const currentUserRole = activeMemberRole ?? 'member';
  const canReviewLeads = hasLeadReviewPermission(currentUserRole, currentPractice?.metadata ?? null);


  useConversationSystemMessages({
    conversationId,
    practiceId: effectivePracticeId,
    practiceConfig,
    messagesReady,
    messages,
    conversationMode,
    isConsultFlowActive,
    shouldRequireModeSelection,
    ingestServerMessages: realMessageHandling.ingestServerMessages
  });

  // Create stable callback references for keyboard handlers
  const handleEscape = useCallback(() => {
    if (previewFiles.length > 0) {
      clearPreviewFiles();
      setClearInputTrigger(prev => prev + 1);
    }
  }, [previewFiles.length, clearPreviewFiles]);

  const handleFocusInput = useCallback(() => {
    const textarea = document.querySelector('.message-input') as HTMLTextAreaElement;
    if (textarea) {
      textarea.focus();
    }
  }, []);

  // Setup global event handlers
  useEffect(() => {
    // Setup keyboard handlers
    const cleanupKeyboard = setupGlobalKeyboardListeners({
      onEscape: handleEscape,
      onSubmit: () => {
        // This will be handled by ChatContainer
      },
      onFocusInput: handleFocusInput
    });

    return () => {
      cleanupKeyboard?.();
    };
  }, [handleEscape, handleFocusInput]);

  // Setup scroll behavior
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const messageList = document.querySelector('.message-list');
    if (!messageList) return;

    let scrollTimer: number | null = null;

    const handleScroll = () => {
      // Add scrolling class when scrolling starts
      messageList.classList.add('scrolling');

      // Clear any existing timer
      if (scrollTimer) {
        clearTimeout(scrollTimer);
        scrollTimer = null;
      }

      // Set a timer to remove the scrolling class after scrolling stops
      scrollTimer = window.setTimeout(() => {
        messageList.classList.remove('scrolling');
      }, 1000); // Hide scrollbar 1 second after scrolling stops
    };

    messageList.addEventListener('scroll', handleScroll);

    return () => {
      messageList.removeEventListener('scroll', handleScroll);
      if (scrollTimer) {
        clearTimeout(scrollTimer);
      }
    };
  }, []);

  // Handle welcome modal using server-truth hook
  const handleWelcomeComplete = async () => {
    await markWelcomeAsShown();
  };

  const handleWelcomeClose = async () => {
    await markWelcomeAsShown();
  };

  const handleBusinessWelcomeClose = async () => {
    setShowBusinessWelcome(false);
    try {
      await updatePreferencesCategory('onboarding', {
        practice_welcome_shown: true
      });
    } catch (error) {
      console.warn('[PRACTICE_WELCOME] Failed to update preferences', error);
      showError('Update failed', 'We could not save your preference. You may see this prompt again.');
    }
    navigate('/settings/practice');
  };

  // Handle media capture
  const handleMediaCaptureWrapper = async (blob: Blob, type: 'audio' | 'video') => {
    try {
      // Create a File object from the blob
      const fileName = `Recording_${new Date().toISOString()}.${type === 'audio' ? 'webm' : 'mp4'}`;
      const file = new File([blob], fileName, { type: blob.type });

      // Upload the file to backend and get metadata
      const uploadedFiles = await handleFileSelect([file]);

      // Send a message with the uploaded file metadata
      await handleSendMessage(`I've recorded a ${type} message.`, uploadedFiles);

    } catch (_error) {
      // Handle media upload error

      console.error('Failed to upload captured media:', _error);
      showErrorRef.current?.('Failed to upload recording. Please try again.');
    }
  };

  const resolvedPracticeLogo = isPublicWorkspace
    ? (practiceConfig.profileImage ?? null)
    : (currentPractice?.logo ?? practiceConfig?.profileImage ?? null);
  const resolvedPracticeName = isPublicWorkspace
    ? (practiceConfig.name ?? '')
    : (currentPractice?.name ?? practiceConfig.name ?? '');
  const resolvedPracticeSlug = currentPractice?.slug ?? practiceConfig?.slug ?? practiceId;
  const resolvedPracticeDescription = practiceDetails?.description
    ?? currentPractice?.description
    ?? practiceConfig?.description
    ?? '';

  // Handle navigation to chats - removed since bottom nav is disabled
  const shouldShowChatPlaceholder = workspace !== 'public' && !conversationId;
  const handleSelectConversation = useCallback((id: string) => {
    setConversationId(id);
    if (resolvedConversationsBasePath) {
      navigate(`${resolvedConversationsBasePath}/${encodeURIComponent(id)}`);
    }
  }, [navigate, resolvedConversationsBasePath]);

  const handlePublicSelectConversation = useCallback((id: string) => {
    setConversationId(id);
    setConversationMode(null);
  }, []);

  const handlePublicBack = useCallback(() => {
    if (!resolvedPublicPracticeSlug) return;
    navigate(`/embed/${encodeURIComponent(resolvedPublicPracticeSlug)}`, true);
  }, [navigate, resolvedPublicPracticeSlug]);

  const chatPanel = chatContent ?? (
    <div className="relative h-full flex flex-col">
      {shouldShowChatPlaceholder ? (
        <div className="flex-1 flex items-center justify-center text-sm text-gray-500 dark:text-gray-400">
          {workspace === 'practice'
            ? 'Select a conversation to view the thread.'
            : 'Open a practice link to start chatting.'}
        </div>
      ) : (
        <>
          {showMatterControls && (
            <ConversationHeader
              practiceId={practiceId}
              matterId={null}
              canReviewLeads={canReviewLeads}
              acceptMatter={acceptMatter}
              rejectMatter={rejectMatter}
              updateMatterStatus={updateMatterStatus}
            />
          )}
          <div className="flex-1 min-h-0">
            <ChatContainer
              messages={messages}
              conversationTitle={conversationMetadata?.title ?? null}
              onSendMessage={handleSendMessage}
              onContactFormSubmit={handleContactFormSubmit}
              onAddMessage={addMessage}
              onSelectMode={handleModeSelection}
              onStartNewConversation={handleStartNewConversation}
              onSelectConversation={workspace === 'public' ? handlePublicSelectConversation : undefined}
              onToggleReaction={toggleMessageReaction}
              onRequestReactions={requestMessageReactions}
              conversationMode={conversationMode}
              composerDisabled={isComposerDisabled}
              isPublicWorkspace={workspace === 'public'}
              messagesReady={messagesReady}
              onNavigateHome={workspace === 'public' ? handlePublicBack : undefined}
              practiceConfig={{
                name: resolvedPracticeName,
                profileImage: resolvedPracticeLogo,
                practiceId,
                description: resolvedPracticeDescription,
                slug: resolvedPracticeSlug,
                introMessage: practiceConfig.introMessage
              }}
              onOpenSidebar={() => setIsMobileSidebarOpen(true)}
              practiceId={practiceId}
              previewFiles={previewFiles}
              uploadingFiles={uploadingFiles}
              removePreviewFile={removePreviewFile}
              clearPreviewFiles={clearPreviewFiles}
              handleCameraCapture={handleCameraCapture}
              handleFileSelect={async (files: File[]) => {
                await handleFileSelect(files);
              }}
              cancelUpload={cancelUpload}
              handleMediaCapture={handleMediaCaptureWrapper}
              isRecording={isRecording}
              setIsRecording={setIsRecording}
              clearInput={clearInputTrigger}
              isReadyToUpload={isReadyToUpload}
              isSessionReady={isSessionReady}
              isSocketReady={isSocketReady}
              intakeStatus={intakeStatus}
              conversationId={conversationId}
              isAnonymousUser={isAnonymousUser}
              canChat={canChat}
              hasMoreMessages={hasMoreMessages}
              isLoadingMoreMessages={isLoadingMoreMessages}
              onLoadMoreMessages={loadMoreMessages}
            />
          </div>
        </>
      )}
    </div>
  );

  const conversationSidebarContent = useMemo(() => {
    if (workspace === 'public') return null;
    return (
      <ConversationSidebar
        workspace={workspace}
        practiceId={practiceId}
        selectedConversationId={conversationId}
        onSelectConversation={handleSelectConversation}
      />
    );
  }, [conversationId, handleSelectConversation, practiceId, workspace]);

  const practiceContent = (() => {
    switch (routeKey) {
      case 'payments':
        return <PracticePaymentsPage />;
      case 'payouts':
        return <PracticePayoutsPage />;
      case 'pricing':
        return <PracticePricingPage />;
      case 'clients':
        return <PracticeClientsPage />;
      case 'leads':
        return (
          <LeadsPage
            practiceId={currentPractice?.id ?? practiceId ?? null}
            canReviewLeads={canReviewLeads}
            acceptMatter={acceptMatter}
            rejectMatter={rejectMatter}
          />
        );
      case 'matters':
        return <PracticeMattersPage />;
      case 'conversations':
        return chatPanel;
      case 'home':
      default:
        return <PracticeHomePage />;
    }
  })();

  const clientContent = (() => {
    switch (routeKey) {
      case 'payments':
        return <ClientPaymentsPage />;
      case 'matters':
        return <ClientMattersPage />;
      case 'conversations':
      default:
        return chatPanel;
    }
  })();

  const mainContent = workspace === 'practice'
    ? practiceContent
    : (workspace === 'client' ? clientContent : chatPanel);
  const shouldShowRightSidebar = workspace === 'practice' && routeKey === 'conversations';

  // Render the main app
  return (
    <>
      <DragDropOverlay isVisible={isDragging} onClose={() => setIsDragging(false)} />

      <AppLayout
        workspace={workspace}
        practiceNotFound={practiceNotFound}
        practiceId={practiceId}
        onRetryPracticeConfig={handleRetryPracticeConfig}
        navItems={navItems}
        isMobileSidebarOpen={isMobileSidebarOpen}
        onToggleMobileSidebar={setIsMobileSidebarOpen}
        isSettingsModalOpen={isSettingsRouteNow}
        practiceConfig={{
          name: resolvedPracticeName,
          profileImage: resolvedPracticeLogo,
          description: resolvedPracticeDescription,
          slug: resolvedPracticeSlug
        }}
        currentPractice={currentPractice}
        practiceDetails={practiceDetails}
        messages={messages}
        conversationSidebarContent={conversationSidebarContent ?? undefined}
        showRightSidebar={shouldShowRightSidebar}
      >
        {mainContent}
      </AppLayout>

      {/* Settings Modal is hoisted in AppShell to persist across settings sub-routes */}

      {/* Pricing Modal */}
      {workspace !== 'public' && (
        <PricingModal
          isOpen={showPricingModal}
          onClose={() => {
            setShowPricingModal(false);
            window.location.hash = '';
          }}
          currentTier={currentUserTier}
          onUpgrade={async (tier) => {
            let shouldNavigateToCart = true;
            try {
              if (!session?.user) {
                showError('Sign-in required', 'Please sign in before upgrading your plan.');
                return false;
              }

              if (tier === 'business') {
                // Navigate to cart page for business upgrades instead of direct checkout
                try {
                  const existing = localStorage.getItem('cartPreferences');
                  const parsed = existing ? JSON.parse(existing) : {};
                  localStorage.setItem('cartPreferences', JSON.stringify({
                    ...parsed,
                    tier,
                  }));
                } catch (_error) {
                  console.warn('Unable to store cart preferences for upgrade:', _error);
                }
                // Keep shouldNavigateToCart = true to go to cart page
              } else if (tier === 'enterprise') {
                navigate('/enterprise');
                shouldNavigateToCart = false;
              } else {
                try {
                  const existing = localStorage.getItem('cartPreferences');
                  const parsed = existing ? JSON.parse(existing) : {};
                  localStorage.setItem('cartPreferences', JSON.stringify({
                    ...parsed,
                    tier,
                  }));
                } catch (_error) {
                  console.warn('Unable to store cart preferences for upgrade:', _error);
                }
              }
            } catch (_error) {
              console.error('Error initiating subscription upgrade:', _error);
              const message = _error instanceof Error ? _error.message : 'Unable to start upgrade.';
              showError('Upgrade failed', message);
              shouldNavigateToCart = false;
            } finally {
              setShowPricingModal(false);
              window.location.hash = '';
            }

            return shouldNavigateToCart;
          }}
        />
      )}

      {/* Welcome Modal */}
      <WelcomeModal
        isOpen={showWelcomeModal}
        onClose={handleWelcomeClose}
        onComplete={handleWelcomeComplete}
        workspace={workspace === 'practice' ? 'practice' : 'client'}
      />

      {/* Business Welcome Modal */}
      {showBusinessWelcome && (
        <BusinessWelcomePrompt
          isOpen={showBusinessWelcome}
          onClose={handleBusinessWelcomeClose}
        />
      )}
    </>
  );
}
