import { useState, useEffect, useCallback, useRef, useMemo } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import ChatContainer from './chat/ChatContainer';
import DragDropOverlay from './DragDropOverlay';
import AppLayout from './AppLayout';
import { ConversationHeader } from './chat/ConversationHeader';
import { useSession } from '../lib/authClient';
import type { SubscriptionTier } from '../types/user';
import { resolvePracticeKind } from '../utils/subscription';
import type { UIPracticeConfig } from '../hooks/usePracticeConfig';
import { useMessageHandling } from '../hooks/useMessageHandling';
import { useFileUploadWithContext } from '../hooks/useFileUpload';
import { useConversations } from '../hooks/useConversations';
import { setupGlobalKeyboardListeners } from '../utils/keyboard';
import type { ChatMessageUI, FileAttachment } from '../../worker/types';
import { getConversationsEndpoint } from '../config/api';
import { getTokenAsync } from '../lib/tokenStorage';
import { useNavigation } from '../utils/navigation';
import { PricingModal, WelcomeModal } from './modals/organisms';
import { useWelcomeModal } from './modals/hooks/useWelcomeModal';
import { BusinessWelcomePrompt } from './onboarding/organisms/BusinessWelcomePrompt';
import { useToastContext } from '../contexts/ToastContext';
import { usePracticeManagement } from '../hooks/usePracticeManagement';

// Main application component (non-auth pages)
export function MainApp({
  practiceId,
  practiceConfig,
  practiceNotFound,
  handleRetryPracticeConfig
}: {
  practiceId: string;
  practiceConfig: UIPracticeConfig;
  practiceNotFound: boolean;
  handleRetryPracticeConfig: () => void;
}) {
  // Core state
  const [clearInputTrigger, setClearInputTrigger] = useState(0);
  const [currentTab, setCurrentTab] = useState<'chats' | 'matter' | 'inbox'>('chats');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const location = useLocation();
  const { navigate } = useNavigation();
  const isSettingsRouteNow = location.path.startsWith('/settings');
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [showBusinessWelcome, setShowBusinessWelcome] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);
  // Removed legacy business setup modal flow (replaced by /business-onboarding route)

  useEffect(() => {
    setConversationId(null);
  }, [practiceId]);

  // Use session from Better Auth
  const { data: session, isPending: sessionIsPending } = useSession();

  // Practice data is now passed as props

  // Using our custom practice system instead of Better Auth's organization plugin
  // Removed unused submitUpgrade
  const { showError } = useToastContext();
  const showErrorRef = useRef(showError);
  useEffect(() => {
    showErrorRef.current = showError;
  }, [showError]);
  const {
    currentPractice,
    refetch: refetchPractices,
    acceptMatter,
    rejectMatter,
    updateMatterStatus,
    getMembers,
    fetchMembers
  } = usePracticeManagement();

  const {
    conversations,
    isLoading: conversationsLoading,
    refresh: refreshConversations
  } = useConversations({
    practiceId,
    onError: (error) => showErrorRef.current?.(error)
  });

  // useChatSession removed - using conversations directly
  const handleMessageError = useCallback((error: string | Error) => {
    console.error('Message handling error:', error);
    showErrorRef.current?.(typeof error === 'string' ? error : 'We hit a snag sending that message.');
  }, []);

  const realMessageHandling = useMessageHandling({
    practiceId,
    practiceSlug: practiceConfig.slug ?? undefined,
    conversationId: conversationId ?? undefined,
    onError: handleMessageError
  });

  const messages = realMessageHandling.messages;
  const addMessage = realMessageHandling.addMessage;
  const intakeStatus = realMessageHandling.intakeStatus;

  useEffect(() => {
    realMessageHandling.clearMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- clearMessages should be stable; re-run only on practiceId change
  }, [practiceId]);

  const createConversation = useCallback(async () => {
    if (!practiceId || !session?.user || isCreatingConversation) return null;

    try {
      setIsCreatingConversation(true);

      // Wait for token to be available - retry a few times if needed
      let token: string | null = null;
      for (let i = 0; i < 5; i++) {
        token = await getTokenAsync();
        if (token) break;
        // Wait a bit before retrying (token might still be saving to IndexedDB)
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      } else {
        console.error('[createConversation] No token available after retries - conversation creation will fail');
        throw new Error('Authentication token not available');
      }

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
      await refreshConversations();
      return data.data.id;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start conversation';
      showErrorRef.current?.(message);
      return null;
    } finally {
      setIsCreatingConversation(false);
    }
  }, [practiceId, session?.user, isCreatingConversation, refreshConversations]);

  const [conversationCreationFailed, setConversationCreationFailed] = useState(false);
  const conversationCreationAttempted = useRef<string | null>(null);
  const conversationCreationInProgress = useRef(false);

  useEffect(() => {
    if (conversationsLoading || isCreatingConversation) return;

    // Prevent infinite loops and race conditions
    if (
      (conversationCreationFailed && conversationCreationAttempted.current === practiceId) ||
      conversationCreationInProgress.current
    ) {
      return;
    }

    const practiceConversation = conversations.find((c) => c.practice_id === practiceId);

    if (import.meta.env.DEV) {
      console.log('[Conversation] Looking for conversation', {
        practiceId,
        conversationsCount: conversations.length,
        conversationIds: conversations.map(c => c.id),
        practiceIds: conversations.map(c => c.practice_id),
        found: !!practiceConversation,
        conversationId: practiceConversation?.id
      });
    }

    if (practiceConversation) {
      const newConversationId = practiceConversation.id;
      setConversationId((prev) => {
        if (prev !== newConversationId) {
          if (import.meta.env.DEV) {
            console.log('[Conversation] Setting conversationId:', newConversationId);
          }
          return newConversationId;
        }
        return prev;
      });
      setConversationCreationFailed(false); // Reset on success
      conversationCreationAttempted.current = null;
      conversationCreationInProgress.current = false;
    } else if (practiceId && session?.user && !conversationCreationFailed) {
      conversationCreationAttempted.current = practiceId;
      conversationCreationInProgress.current = true;
      createConversation().then((id) => {
        if (!id) {
          setConversationCreationFailed(true);
        } else {
          setConversationCreationFailed(false);
          conversationCreationAttempted.current = null;
        }
        conversationCreationInProgress.current = false;
      }).catch(() => {
        setConversationCreationFailed(true);
        conversationCreationInProgress.current = false;
      });
    }
  }, [
    conversationsLoading,
    isCreatingConversation,
    conversations,
    practiceId,
    session?.user,
    createConversation,
    conversationCreationFailed
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
  const { shouldShow: shouldShowWelcome, markAsShown: markWelcomeAsShown } = useWelcomeModal();
  useEffect(() => {
    setShowWelcomeModal(shouldShowWelcome);
  }, [shouldShowWelcome]);

  // Note: Auto-practice creation removed - clients don't need practices.
  // Practice members (lawyers) will create practices through onboarding/upgrade flow.
  // Clients chat with practices via widget (practiceId from URL), not their own practice.

  useEffect(() => {
    const user = session?.user;
    if (user && !sessionIsPending) {
      if (import.meta.env.DEV) {
        try {
          // Lightweight visibility into onboarding decision path
          const debugUser = user as Record<string, unknown>;
          // Avoid logging PII beyond booleans/keys
          console.debug('[ONBOARDING][CHECK] session detected', {
            onboardingCompleted: debugUser?.onboardingCompleted,
            hasOnboardingData: Boolean(debugUser?.onboardingData),
            local_onboardingCompleted: localStorage.getItem('onboardingCompleted'),
            local_onboardingCheckDone: localStorage.getItem('onboardingCheckDone')
          });
        } catch (e) {
          console.warn('[ONBOARDING][CHECK] session debug failed:', e);
        }
      }
      const hasOnboardingFlag = localStorage.getItem('onboardingCompleted');
      const hasOnboardingCheckFlag = localStorage.getItem('onboardingCheckDone');
      const userWithOnboarding = user as typeof user & { onboardingCompleted?: boolean };
      const _hasCompletedOnboarding = userWithOnboarding.onboardingCompleted === true;

      // Legacy localStorage sync removed; welcome modal now uses server truth
      // If user hasn't completed onboarding and we haven't checked yet
      if (!hasOnboardingFlag && !hasOnboardingCheckFlag) {
        const needsOnboarding = userWithOnboarding.onboardingCompleted === false ||
                  userWithOnboarding.onboardingCompleted === undefined;

        if (needsOnboarding) {
          if (import.meta.env.DEV) {
            console.debug('[ONBOARDING][REDIRECT] redirecting to /auth?mode=signin&onboarding=true');
          }
          // Set flag to prevent repeated checks
          try {
            localStorage.setItem('onboardingCheckDone', 'true');
          } catch (_error) {
            // Handle localStorage failures gracefully
            console.warn('[ONBOARDING][FLAGS] localStorage set failed:', _error);
          }

          // Redirect to auth page with onboarding
          window.location.href = '/auth?mode=signin&onboarding=true';
        } else {
          // Legacy localStorage sync removed; welcome modal now uses server truth
        }
      }
    }
  }, [session?.user, sessionIsPending]);

  // Check if we should show business welcome modal (after upgrade)
  useEffect(() => {
    const queryString = location.query || window.location.search;
    const params = new URLSearchParams(queryString);
    if (params.get('upgraded') === 'business') {
      setShowBusinessWelcome(true);
    }
  }, [location.query]);

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

  const isSessionReady = Boolean(conversationId && !conversationsLoading && !isCreatingConversation);
  const showMatterControls = currentPractice?.id === practiceId;

  const activeConversation = useMemo(() => {
    if (conversationId) {
      return conversations.find(c => c.id === conversationId) ?? null;
    }
    return conversations.length === 1 ? conversations[0] : null;
  }, [conversationId, conversations]);

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
  const isOwner = currentMember?.role === 'owner';
  const isAdmin = currentMember?.role === 'admin' || isOwner;
  const canReviewLeads = Boolean(isAdmin);

  if (import.meta.env.DEV) {
    console.log('[Session] isSessionReady check', {
      conversationId,
      conversationsLoading,
      isCreatingConversation,
      isSessionReady
    });
  }

  // Add intro message when practice config is loaded and no messages exist
  useEffect(() => {
    if (practiceConfig && practiceConfig.introMessage && addMessage) {
      // Check if intro message already exists to prevent duplicates
      const introMessageId = 'system-intro';
      const hasIntroMessage = messages.some(m => m.id === introMessageId);

      if (!hasIntroMessage && messages.length === 0) {
        const introMessage: ChatMessageUI = {
          id: introMessageId, // Use stable ID to prevent duplicates
          content: practiceConfig.introMessage,
          isUser: false,
          role: 'assistant',
          timestamp: Date.now()
        };
        addMessage(introMessage);
      }
    }
  }, [practiceConfig, messages, addMessage]);

  useEffect(() => {
    if (!currentPractice?.id) return;
    void fetchMembers(currentPractice.id).catch((error) => {
      if (import.meta.env.DEV) {
        console.warn('[Members] Failed to fetch practice members:', error);
      }
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
    setShowWelcomeModal(false);
  };

  const handleWelcomeClose = async () => {
    await markWelcomeAsShown();
    setShowWelcomeModal(false);
  };

  const handleBusinessWelcomeClose = () => {
    setShowBusinessWelcome(false);
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

  // Handle navigation to chats - removed since bottom nav is disabled

  // Render the main app
  return (
    <>
      <DragDropOverlay isVisible={isDragging} onClose={() => setIsDragging(false)} />

      <AppLayout
        practiceNotFound={practiceNotFound}
        practiceId={practiceId}
        onRetryPracticeConfig={handleRetryPracticeConfig}
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        isMobileSidebarOpen={isMobileSidebarOpen}
        onToggleMobileSidebar={setIsMobileSidebarOpen}
        isSettingsModalOpen={isSettingsRouteNow}
        practiceConfig={{
          name: practiceConfig.name ?? '',
          profileImage: practiceConfig?.profileImage ?? null,
          description: practiceConfig?.description ?? ''
        }}
        currentPractice={currentPractice}
        onOnboardingCompleted={refetchPractices}
        messages={messages}
        onSendMessage={handleSendMessage}
        onUploadDocument={async (files: File[], _metadata?: { documentType?: string; matterId?: string }) => {
          return await handleFileSelect(files);
        }}
      >
        <div className="relative h-full flex flex-col">
          {showMatterControls && (
            <ConversationHeader
              practiceId={practiceId}
              matterId={activeConversation?.matter_id ?? null}
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
              practiceConfig={{
                name: practiceConfig.name ?? '',
                profileImage: practiceConfig?.profileImage ?? null,
                practiceId,
                description: practiceConfig?.description ?? ''
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
            />
          </div>
        </div>
      </AppLayout>

      {/* Settings Modal moved to AppWithSEO to persist across settings sub-routes */}

      {/* Pricing Modal */}
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

      {/* Welcome Modal */}
      <WelcomeModal
        isOpen={showWelcomeModal}
        onClose={handleWelcomeClose}
        onComplete={handleWelcomeComplete}
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
