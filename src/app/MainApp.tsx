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
import { getConversationsEndpoint } from '@/config/api';
import { useNavigation } from '@/shared/utils/navigation';
import PricingModal from '@/features/modals/components/PricingModal';
import WelcomeModal from '@/features/modals/components/WelcomeModal';
import { useWelcomeModal } from '@/features/modals/hooks/useWelcomeModal';
import { getPreferencesCategory, updatePreferencesCategory } from '@/shared/lib/preferencesApi';
import type { OnboardingPreferences } from '@/shared/types/preferences';
import { BusinessWelcomePrompt } from '@/features/onboarding/components/BusinessWelcomePrompt';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { usePracticeDetails } from '@/shared/hooks/usePracticeDetails';
import { ConversationSidebar } from '@/features/chats/components/ConversationSidebar';
import { NotificationCenterPage } from '@/features/notifications/pages/NotificationCenterPage';
import { ensureNotificationsLoaded } from '@/features/notifications/hooks/useNotifications';
import type { NotificationCategory } from '@/features/notifications/types';
import type { ConversationMetadata, ConversationMode } from '@/shared/types/conversation';
import { logConversationEvent } from '@/shared/lib/conversationApi';
import { LeadsPage } from '@/features/leads/pages/LeadsPage';
import { hasLeadReviewPermission } from '@/shared/utils/leadPermissions';

// Main application component (non-auth pages)
export function MainApp({
  practiceId,
  practiceConfig,
  practiceNotFound,
  handleRetryPracticeConfig,
  isPracticeView,
  workspace,
  settingsOverlayOpen,
  dashboardContent,
  chatContent
}: {
  practiceId: string;
  practiceConfig: UIPracticeConfig;
  practiceNotFound: boolean;
  handleRetryPracticeConfig: () => void;
  isPracticeView: boolean;
  workspace: WorkspaceType;
  settingsOverlayOpen?: boolean;
  dashboardContent?: ComponentChildren;
  chatContent?: ComponentChildren;
}) {
  // Core state
  const [clearInputTrigger, setClearInputTrigger] = useState(0);
  const initialTab = workspace === 'public' ? 'chats' : 'dashboard';
  const [currentTab, setCurrentTab] = useState<'dashboard' | 'chats' | 'matter' | 'notifications' | 'leads'>(initialTab);
  const [notificationCategory, setNotificationCategory] = useState<NotificationCategory>('message');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const location = useLocation();
  const { navigate } = useNavigation();
  const isSettingsRouteNow = settingsOverlayOpen ?? location.path.startsWith('/settings');
  const [showBusinessWelcome, setShowBusinessWelcome] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);
  const [conversationMode, setConversationMode] = useState<ConversationMode | null>(null);

  useEffect(() => {
    setConversationId(null);
    setConversationMode(null);
  }, [practiceId]);

  useEffect(() => {
    if (workspace === 'public' && currentTab !== 'chats') {
      setCurrentTab('chats');
    }
  }, [currentTab, workspace]);

  const basePath = useMemo(() => {
    if (workspace === 'practice') return '/practice';
    if (workspace === 'client') return '/client';
    return null;
  }, [workspace]);
  const chatsBasePath = useMemo(() => (basePath ? `${basePath}/chats` : null), [basePath]);
  const notificationsBasePath = useMemo(() => (basePath ? `${basePath}/notifications` : null), [basePath]);
  const leadsBasePath = useMemo(() => (basePath ? `${basePath}/leads` : null), [basePath]);

  const dashboardPath = useMemo(() => {
    if (!basePath) return null;
    return `${basePath}/dashboard`;
  }, [basePath]);

  const tabFromPath = useMemo(() => {
    if (!basePath) return null;
    if (location.path.startsWith(`${basePath}/chats`)) return 'chats';
    if (leadsBasePath && location.path.startsWith(leadsBasePath)) return 'leads';
    if (location.path.startsWith(`${basePath}/matter`)) return 'matter';
    if (location.path.startsWith(`${basePath}/notifications`)) return 'notifications';
    if (location.path === basePath || location.path === `${basePath}/`) return 'dashboard';
    if (dashboardPath && (location.path === dashboardPath || location.path.startsWith(`${dashboardPath}/`))) {
      return 'dashboard';
    }
    return null;
  }, [basePath, dashboardPath, leadsBasePath, location.path]);

  const notificationCategoryFromPath = useMemo(() => {
    if (!notificationsBasePath) return null;
    if (!location.path.startsWith(notificationsBasePath)) return null;
    const raw = location.path.slice(notificationsBasePath.length).replace(/^\//, '');
    const candidate = raw.split('/')[0];
    if (!candidate) return 'message' as NotificationCategory;
    const normalized = candidate.toLowerCase();
    const allowed: NotificationCategory[] = ['message', 'system', 'payment', 'intake', 'matter'];
    return allowed.includes(normalized as NotificationCategory) ? (normalized as NotificationCategory) : 'message';
  }, [notificationsBasePath, location.path]);

  const conversationIdFromPath = useMemo(() => {
    if (!chatsBasePath) return null;
    if (!location.path.startsWith(`${chatsBasePath}/`)) return null;
    const raw = location.path.slice(`${chatsBasePath}/`.length);
    const id = raw.split('/')[0];
    if (!id) return null;
    try {
      return decodeURIComponent(id);
    } catch (error) {
      console.warn('[MainApp] Failed to decode conversation id from URL', {
        id,
        error
      });
      return id;
    }
  }, [chatsBasePath, location.path]);

  useEffect(() => {
    if (!basePath || !dashboardPath) return;
    if (basePath === '/client' && location.path.startsWith('/dashboard')) {
      const suffix = location.path.slice('/dashboard'.length);
      const normalizedSuffix = suffix === '' || suffix === '/' ? '/dashboard' : suffix;
      const nextPath = `/client${normalizedSuffix}`;
      if (location.path !== nextPath) {
        navigate(nextPath, true);
      }
      return;
    }
    if (location.path === basePath || location.path === `${basePath}/`) {
      navigate(dashboardPath, true);
      return;
    }
    if (notificationsBasePath && (location.path === notificationsBasePath || location.path === `${notificationsBasePath}/`)) {
      navigate(`${notificationsBasePath}/${notificationCategoryFromPath ?? 'message'}`, true);
    }
  }, [basePath, dashboardPath, location.path, navigate, notificationCategoryFromPath, notificationsBasePath]);

  useEffect(() => {
    if (tabFromPath && tabFromPath !== currentTab) {
      setCurrentTab(tabFromPath);
    }
    if (
      tabFromPath === 'notifications' &&
      notificationCategoryFromPath &&
      notificationCategoryFromPath !== notificationCategory
    ) {
      setNotificationCategory(notificationCategoryFromPath);
    }
  }, [currentTab, notificationCategory, notificationCategoryFromPath, tabFromPath]);

  useEffect(() => {
    if (!conversationIdFromPath) return;
    if (conversationIdFromPath === conversationId) return;
    setConversationId(conversationIdFromPath);
    setConversationMode(null);
  }, [conversationId, conversationIdFromPath]);

  useEffect(() => {
    if (!chatsBasePath) return;
    if (currentTab !== 'chats') return;
    if (!conversationId) return;
    const targetPath = `${chatsBasePath}/${encodeURIComponent(conversationId)}`;
    if (location.path !== targetPath) {
      navigate(targetPath, true);
    }
  }, [chatsBasePath, conversationId, currentTab, location.path, navigate]);

  const handleTabChange = useCallback((tab: 'dashboard' | 'chats' | 'matter' | 'notifications' | 'leads') => {
    setCurrentTab(tab);
    if (tab === 'notifications') {
      ensureNotificationsLoaded(notificationCategory);
    }
    if (!basePath || !dashboardPath) return;
    const nextPath = tab === 'dashboard'
      ? dashboardPath
      : tab === 'chats' && conversationId
        ? `${basePath}/chats/${encodeURIComponent(conversationId)}`
        : tab === 'notifications' && notificationsBasePath
          ? `${notificationsBasePath}/${notificationCategory}`
          : tab === 'leads' && leadsBasePath
            ? leadsBasePath
          : `${basePath}/${tab}`;
    if (location.path !== nextPath) {
      navigate(nextPath);
    }
  }, [basePath, conversationId, dashboardPath, leadsBasePath, location.path, navigate, notificationCategory, notificationsBasePath]);

  const handleNotificationCategoryChange = useCallback((nextCategory: NotificationCategory) => {
    ensureNotificationsLoaded(nextCategory);
    setNotificationCategory(nextCategory);
    setCurrentTab('notifications');
    if (!notificationsBasePath) return;
    const target = `${notificationsBasePath}/${nextCategory}`;
    if (location.path !== target) {
      navigate(target);
    }
  }, [location.path, navigate, notificationsBasePath]);

  // Use session from Better Auth
  const { session, isPending: sessionIsPending, isAnonymous } = useSessionContext();
  const isAnonymousUser = isAnonymous;
  const isPracticeWorkspace = workspace === 'practice';
  const effectivePracticeId = practiceId || undefined;

  // Practice data is now passed as props

  // Using our custom practice system instead of Better Auth's organization plugin
  // Removed unused submitUpgrade
  const { showError } = useToastContext();
  const showErrorRef = useRef(showError);
  const onboardingCheckRef = useRef(false);
  const practiceWelcomeCheckRef = useRef(false);
  const isSelectingRef = useRef(false);
  useEffect(() => {
    showErrorRef.current = showError;
  }, [showError]);
  const {
    currentPractice,
    acceptMatter,
    rejectMatter,
    updateMatterStatus,
    getMembers,
    fetchMembers
  } = usePracticeManagement({
    autoFetchPractices: workspace !== 'public',
    fetchInvitations: workspace !== 'public'
  });
  const { details: practiceDetails } = usePracticeDetails(isPracticeWorkspace ? practiceId : null);

  const handleMessageError = useCallback((error: string | Error) => {
    console.error('Message handling error:', error);
    showErrorRef.current?.(typeof error === 'string' ? error : 'We hit a snag sending that message.');
  }, []);

  const handleConversationMetadataUpdated = useCallback((metadata: ConversationMetadata | null) => {
    setConversationMode(metadata?.mode ?? null);
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
  const intakeStatus = realMessageHandling.intakeStatus;
  const startConsultFlow = realMessageHandling.startConsultFlow;
  const updateConversationMetadata = realMessageHandling.updateConversationMetadata;
  const isConsultFlowActive = realMessageHandling.isConsultFlowActive;

  useEffect(() => {
    realMessageHandling.clearMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- clearMessages should be stable; re-run only on practiceId change
  }, [practiceId]);

  const createConversation = useCallback(async () => {
    if (isPracticeWorkspace) return null;
    if (!practiceId || !session?.user || isCreatingConversation) return null;

    try {
      setIsCreatingConversation(true);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      const url = `${getConversationsEndpoint()}?practiceId=${encodeURIComponent(practiceId)}`;

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

      setConversationMode(nextMode);
      await updateConversationMetadata({
        mode: nextMode
      }, activeConversationId);
      await logConversationEvent(activeConversationId, practiceId, 'mode_selected', { mode: nextMode });
      if (nextMode === 'REQUEST_CONSULTATION') {
        startConsultFlow(activeConversationId);
        await logConversationEvent(activeConversationId, practiceId, 'consult_flow_started', { source });
      }
    } catch (error) {
      setConversationMode(null);
      console.warn('[MainApp] Failed to persist conversation mode selection', error);
    } finally {
      isSelectingRef.current = false;
    }
  }, [
    conversationId,
    createConversation,
    isCreatingConversation,
    practiceId,
    startConsultFlow,
    updateConversationMetadata
  ]);

  const handleSendMessage = useCallback(async (message: string, attachments: FileAttachment[] = []) => {
    if (!conversationId) {
      showErrorRef.current?.('Setting up your conversation. Please try again momentarily.');
      if (!isCreatingConversation) {
        void createConversation();
      }
      return;
    }

    await realMessageHandling.sendMessage(message, attachments);
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

  useEffect(() => {
    if (sessionIsPending || isAnonymous || !session?.user?.id) {
      return;
    }
    if (onboardingCheckRef.current) return;
    onboardingCheckRef.current = true;

    const checkOnboarding = async () => {
      try {
        const prefs = await getPreferencesCategory<OnboardingPreferences>('onboarding');
        const needsOnboarding = prefs?.completed !== true;

        if (import.meta.env.DEV) {
          console.debug('[ONBOARDING][CHECK] preferences', {
            completed: prefs?.completed
          });
        }

        if (needsOnboarding) {
          if (import.meta.env.DEV) {
            console.debug('[ONBOARDING][REDIRECT] redirecting to /auth?mode=signin&onboarding=true');
          }
          window.location.href = '/auth?mode=signin&onboarding=true';
        }
      } catch (error) {
        console.warn('[ONBOARDING][CHECK] preferences fetch failed:', error);
        onboardingCheckRef.current = false;
      }
    };

    void checkOnboarding();
  }, [isAnonymous, session?.user?.id, sessionIsPending]);

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
  const isSessionReady = Boolean(conversationId && !isCreatingConversation);
  const isComposerDisabled = (shouldRequireModeSelection && !conversationMode) || isConsultFlowActive;
  const canChat = Boolean(practiceId) && (!isPracticeWorkspace ? Boolean(isPracticeView) : Boolean(conversationId));
  const showMatterControls = currentPractice?.id === practiceId && workspace !== 'client';

  const currentUserEmail = session?.user?.email || null;
  const members = useMemo(
    () => (currentPractice ? getMembers(currentPractice.id) : []),
    [currentPractice, getMembers]
  );
  const currentMember = useMemo(() => {
    if (!currentPractice || !currentUserEmail) return null;
    return members.find(m => m.email && m.email.toLowerCase() === currentUserEmail.toLowerCase()) ||
      members.find(m => m.userId === session?.user?.id) ||
      null;
  }, [currentPractice, currentUserEmail, members, session?.user?.id]);
  const currentUserRole = currentMember?.role ?? 'paralegal';
  const canReviewLeads = hasLeadReviewPermission(currentUserRole, currentPractice?.metadata ?? null);


  // Add intro message when practice config is loaded and no messages exist
  useEffect(() => {
    if (!practiceConfig || !practiceConfig.introMessage || !addMessage) {
      return;
    }
    const introMessageId = 'system-intro';
    const modeSelectorMessageId = 'system-mode-selector';
    const hasIntroMessage = messages.some(m => m.id === introMessageId);
    const hasModeSelectorMessage = messages.some(m => m.id === modeSelectorMessageId);
    const shouldShowModeSelector = shouldRequireModeSelection;

    if (!hasIntroMessage && messages.length === 0) {
      const now = Date.now();
      addMessage({
        id: introMessageId,
        content: practiceConfig.introMessage,
        isUser: false,
        role: 'assistant',
        timestamp: now
      });
      if (shouldShowModeSelector && !hasModeSelectorMessage) {
        addMessage({
          id: modeSelectorMessageId,
          content: 'How would you like to proceed?',
          isUser: false,
          role: 'assistant',
          timestamp: now + 1,
          metadata: { modeSelector: true }
        });
      }
      return;
    }

    if (shouldShowModeSelector && hasIntroMessage && !hasModeSelectorMessage) {
      addMessage({
        id: modeSelectorMessageId,
        content: 'How would you like to proceed?',
        isUser: false,
        role: 'assistant',
        timestamp: Date.now(),
        metadata: { modeSelector: true }
      });
    }
  }, [practiceConfig, messages, addMessage, shouldRequireModeSelection]);

  useEffect(() => {
    if (!currentPractice?.id) return;
    void fetchMembers(currentPractice.id).catch((error) => {
      console.warn('[Members] Failed to fetch practice members:', error);
      showErrorRef.current?.('Team members unavailable', 'Unable to load team members.');
    });
  }, [currentPractice?.id, fetchMembers]);

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

  const resolvedPracticeLogo = currentPractice?.logo ?? practiceConfig?.profileImage ?? null;

  // Handle navigation to chats - removed since bottom nav is disabled
  const shouldShowChatPlaceholder = workspace !== 'public' && !conversationId;
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
              onSendMessage={handleSendMessage}
              onContactFormSubmit={handleContactFormSubmit}
              onAddMessage={addMessage}
              onSelectMode={handleModeSelection}
              conversationMode={conversationMode}
              composerDisabled={isComposerDisabled}
              practiceConfig={{
                name: practiceConfig.name ?? '',
                profileImage: resolvedPracticeLogo,
                practiceId,
                description: practiceConfig?.description ?? '',
                slug: practiceConfig?.slug ?? practiceId
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
              intakeStatus={intakeStatus}
              conversationId={conversationId}
              isAnonymousUser={isAnonymousUser}
              canChat={canChat}
            />
          </div>
        </>
      )}
    </div>
  );

  const notificationsPanel = (
    <NotificationCenterPage
      category={notificationCategory}
      onCategoryChange={handleNotificationCategoryChange}
      className="h-full"
    />
  );

  const leadsPanel = isPracticeWorkspace ? (
    <LeadsPage
      practiceId={currentPractice?.id ?? practiceId ?? null}
      canReviewLeads={canReviewLeads}
      acceptMatter={acceptMatter}
      rejectMatter={rejectMatter}
    />
  ) : null;

  const handleSelectConversation = useCallback((id: string) => {
    setConversationId(id);
    if (chatsBasePath) {
      navigate(`${chatsBasePath}/${encodeURIComponent(id)}`);
    }
  }, [chatsBasePath, navigate]);

  const chatSidebarContent = useMemo(() => (
    <ConversationSidebar
      workspace={workspace}
      practiceId={practiceId}
      selectedConversationId={conversationId}
      onSelectConversation={handleSelectConversation}
    />
  ), [conversationId, handleSelectConversation, practiceId, workspace]);

  // Render the main app
  return (
    <>
      <DragDropOverlay isVisible={isDragging} onClose={() => setIsDragging(false)} />

      <AppLayout
        workspace={workspace}
        practiceNotFound={practiceNotFound}
        practiceId={practiceId}
        onRetryPracticeConfig={handleRetryPracticeConfig}
        currentTab={currentTab}
        onTabChange={handleTabChange}
        isMobileSidebarOpen={isMobileSidebarOpen}
        onToggleMobileSidebar={setIsMobileSidebarOpen}
        isSettingsModalOpen={isSettingsRouteNow}
        notificationCategory={notificationCategory}
        onSelectNotificationCategory={handleNotificationCategoryChange}
        practiceConfig={{
          name: practiceConfig.name ?? '',
          profileImage: resolvedPracticeLogo,
          description: practiceConfig?.description ?? '',
          slug: practiceConfig?.slug ?? practiceId
        }}
        currentPractice={currentPractice}
        practiceDetails={practiceDetails}
        messages={messages}
        onSendMessage={handleSendMessage}
        onUploadDocument={async (files: File[], _metadata?: { documentType?: string; matterId?: string }) => {
          return await handleFileSelect(files);
        }}
        dashboardContent={dashboardContent}
        chatSidebarContent={chatSidebarContent}
        notificationsContent={notificationsPanel}
        leadsContent={leadsPanel ?? undefined}
        showLeadsTab={isPracticeWorkspace}
      >
        {chatPanel}
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
