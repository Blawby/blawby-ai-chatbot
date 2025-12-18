import { hydrate, prerender as ssr, Router, Route, useLocation, LocationProvider } from 'preact-iso';
import { useState, useEffect, useCallback, useRef, useMemo } from 'preact/hooks';
import { Suspense } from 'preact/compat';
import { I18nextProvider } from 'react-i18next';
import ChatContainer from './components/chat/ChatContainer';
import DragDropOverlay from './components/DragDropOverlay';
import AppLayout from './components/AppLayout';
import AuthPage from './components/AuthPage';
import { SEOHead } from './components/SEOHead';
import { ConversationHeader } from './components/chat/ConversationHeader';
import { AuthGateOverlay } from './components/chat/AuthGateOverlay';
import { ToastProvider } from './contexts/ToastContext';
import { SessionProvider } from './contexts/SessionContext';
import { useSession, getClient } from './lib/authClient';
import { type SubscriptionTier } from './types/user';
import { resolvePracticeKind } from './utils/subscription';
import type { UIPracticeConfig } from './hooks/usePracticeConfig';
import { useMessageHandling } from './hooks/useMessageHandling';
import { useFileUploadWithContext } from './hooks/useFileUpload';
// useChatSession removed - using conversations instead
import { useConversations } from './hooks/useConversations';
import { setupGlobalKeyboardListeners } from './utils/keyboard';
import type { ChatMessageUI, FileAttachment } from '../worker/types';
import { getConversationsEndpoint } from './config/api';
import { getTokenAsync } from './lib/tokenStorage';
// Settings components
import { SettingsLayout } from './components/settings/SettingsLayout';
import { useNavigation } from './utils/navigation';
import { PricingModal, WelcomeModal } from './components/modals/organisms';
import { useWelcomeModal } from './components/modals/hooks/useWelcomeModal';
import { BusinessWelcomePrompt } from './components/onboarding/organisms/BusinessWelcomePrompt';
import { BusinessOnboardingPage } from './components/pages/BusinessOnboardingPage';
import LawyerSearchPage from './components/pages/LawyerSearchPage';
import { CartPage } from './components/cart/CartPage';
import { useToastContext } from './contexts/ToastContext';
import { usePracticeConfig } from './hooks/usePracticeConfig';
import { usePracticeManagement } from './hooks/usePracticeManagement';
import { useMobileDetection } from './hooks/useMobileDetection';
import './index.css';
import { i18n, initI18n } from './i18n';




// Main application component (non-auth pages)
function MainApp({ 
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
        const { currentPractice, refetch: refetchPractices, acceptMatter, rejectMatter, updateMatterStatus } = usePracticeManagement();

        const {
                conversations,
                isLoading: conversationsLoading,
                refresh: refreshConversations
        } = useConversations({
                practiceId,
                onError: (error) => showErrorRef.current?.(error)
        });

        // useChatSession removed - using conversations directly
        const realMessageHandling = useMessageHandling({
                practiceId,
                conversationId: conversationId ?? undefined,
                onError: (error) => {
                        console.error('Message handling error:', error);
                        showError(typeof error === 'string' ? error : 'We hit a snag sending that message.');
                }
        });

        const messages = realMessageHandling.messages;
        const addMessage = realMessageHandling.addMessage;
        const intakeStatus = realMessageHandling.intakeStatus;

        useEffect(() => {
                realMessageHandling.clearMessages();
        }, [practiceId, realMessageHandling.clearMessages]);

        const createConversation = useCallback(async () => {
                if (!practiceId || !session?.user || isCreatingConversation) return null;

                try {
                        setIsCreatingConversation(true);
                        const token = await getTokenAsync();
                        const headers: Record<string, string> = {
                                'Content-Type': 'application/json'
                        };
                        if (token) {
                                headers.Authorization = `Bearer ${token}`;
                        }

                        const response = await fetch(getConversationsEndpoint(), {
                                method: 'POST',
                                headers,
                                credentials: 'include',
                                body: JSON.stringify({
                                        participantUserIds: [session.user.id],
                                        metadata: { source: 'chat' }
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

        useEffect(() => {
                if (conversationsLoading || isCreatingConversation) return;

                const practiceConversation = conversations.find((c) => c.practice_id === practiceId);

                if (practiceConversation) {
                        setConversationId((prev) => prev ?? practiceConversation.id);
                } else if (practiceId && session?.user) {
                        void createConversation();
                }
        }, [conversationsLoading, isCreatingConversation, conversations, practiceId, session?.user, createConversation]);

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


        // Add intro message when practice config is loaded and no messages exist
        useEffect(() => {
                if (practiceConfig && practiceConfig.introMessage && messages.length === 0) {
                        if (addMessage) {
                                const introMessage: ChatMessageUI = {
                                        id: crypto.randomUUID(),
                                        content: practiceConfig.introMessage,
                                        isUser: false,
                                        role: 'assistant',
                                        timestamp: Date.now()
                                };
                                addMessage(introMessage);
                        }
                }
        }, [practiceConfig, messages.length, addMessage]);

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
			handleSendMessage(`I've recorded a ${type} message.`, uploadedFiles);
			
		} catch (_error) {
			// Handle media upload error
			 
			console.error('Failed to upload captured media:', _error);
			// Show error message to user
			handleSendMessage("I'm sorry, I couldn't upload the recorded media. Please try again.", []);
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
					<ConversationHeader
						practiceId={practiceId}
						matterId={null}
						acceptMatter={acceptMatter}
						rejectMatter={rejectMatter}
						updateMatterStatus={updateMatterStatus}
					/>
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
							isSessionReady={isSessionReady && !intakeStatus.showAuthGate}
						/>
						{intakeStatus.showAuthGate && (
							<AuthGateOverlay
								onSignIn={() => {
									// Navigate to auth page
									window.location.href = '/auth?mode=signin';
								}}
								practiceName={practiceConfig.name ?? undefined}
							/>
						)}
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
						shouldNavigateToCart = true;
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

// Main App component with routing
export function App() {
  return (
    <LocationProvider>
      <SessionProvider>
        <AppWithPractice />
      </SessionProvider>
    </LocationProvider>
  );
}

// Component that loads practice config when authenticated
function AppWithPractice() {
  const { data: session, isPending: sessionIsPending } = useSession();
  const handlePracticeError = useCallback((error: string) => {
    console.error('Practice config error:', error);
  }, []);

  // Only load practice config when authenticated
  const {
    practiceId,
    practiceConfig,
    practiceNotFound,
    handleRetryPracticeConfig,
    isLoading
  } = usePracticeConfig({ onError: handlePracticeError });

  // Handle anonymous sign-in for widget users (clients chatting with practices)
  useEffect(() => {
    if (typeof window === 'undefined' || sessionIsPending) return;
    
    // If no session and practiceId is available (widget context), sign in anonymously
    if (!session?.user && practiceId) {
      const key = `anonymous_signin_attempted_${practiceId}`;
      if (!sessionStorage.getItem(key)) {
        (async () => {
          try {
            const client = getClient();
            // Type assertion needed: Better Auth anonymous plugin types may not be fully exposed
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const anonymousSignIn = (client.signIn as any).anonymous;
            
            // Check if anonymous method exists before calling
            if (typeof anonymousSignIn !== 'function') {
              console.error('[Auth] Anonymous sign-in method not available - Better Auth anonymous plugin may not be configured', {
                practiceId,
                message: 'The server needs to have the Better Auth anonymous plugin enabled. Check server logs for details.'
              });
              sessionStorage.setItem(key, 'failed');
              return;
            }
            
            const result = await anonymousSignIn();
            if (result?.data?.user) {
              sessionStorage.setItem(key, '1');
              console.log('[Auth] Anonymous sign-in successful for widget user', {
                userId: result.data.user.id,
                practiceId
              });
            } else if (result?.error) {
              // Fail loudly - Better Auth anonymous plugin may not be configured
              console.error('[Auth] Anonymous sign-in failed - Better Auth anonymous plugin may not be configured', {
                error: result.error,
                practiceId,
                message: 'The server needs to have the Better Auth anonymous plugin enabled. Check server logs for details.'
              });
              // Set key to prevent retry loops, but log error clearly
              sessionStorage.setItem(key, 'failed');
            } else {
              // Handle case where result is undefined or doesn't have expected structure
              console.error('[Auth] Anonymous sign-in returned unexpected result', {
                practiceId,
                result,
                message: 'The server needs to have the Better Auth anonymous plugin enabled. Check server logs for details.'
              });
              sessionStorage.setItem(key, 'failed');
            }
          } catch (error) {
            // Fail loudly with detailed error information
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('[Auth] Anonymous sign-in exception - server configuration issue', {
              error: errorMessage,
              practiceId,
              stack: error instanceof Error ? error.stack : undefined,
              message: 'CRITICAL: Better Auth anonymous plugin must be configured on the API server. ' +
                       'Check server logs and ensure anonymous() plugin is added to Better Auth config.'
            });
            // Set key to prevent retry loops
            sessionStorage.setItem(key, 'failed');
          }
        })();
      }
    }
  }, [session?.user, practiceId, sessionIsPending]);

  // Show loading state while checking auth or loading practice config
  if (isLoading || sessionIsPending) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-gray-500 dark:text-gray-400">
        Loading…
      </div>
    );
  }

  return (
    <AppWithSEO
      practiceId={practiceId}
      practiceConfig={practiceConfig}
      practiceNotFound={practiceNotFound}
      handleRetryPracticeConfig={handleRetryPracticeConfig}
      session={session}
    />
  );
}

function AppWithSEO({
  practiceId,
  practiceConfig,
  practiceNotFound,
  handleRetryPracticeConfig,
  session,
}: {
  practiceId: string;
  practiceConfig: UIPracticeConfig;
  practiceNotFound: boolean;
  handleRetryPracticeConfig: () => void;
  session: ReturnType<typeof useSession>['data'];
}) {
  const location = useLocation();
  const { navigate } = useNavigation();
  
  // Create reactive currentUrl that updates on navigation
  const currentUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}${location.url}`
    : undefined;

	// Hoisted settings modal controls
	const isSettingsOpen = location.path.startsWith('/settings');
	// Responsive mobile state for the hoisted settings layout
	const isMobileHoisted = useMobileDetection();

	// Stable component to avoid remounting the MainApp subtree for settings
	const SettingsRoute = useMemo(() => {
		return function SettingsRouteInner(props: Record<string, unknown>) {
			return (
				<MainApp 
					practiceId={practiceId}
					practiceConfig={practiceConfig}
					practiceNotFound={practiceNotFound}
					handleRetryPracticeConfig={handleRetryPracticeConfig}
					{...props}
				/>
			);
		};
	}, [practiceId, practiceConfig, practiceNotFound, handleRetryPracticeConfig]);

	return (
		<>
			<SEOHead 
				practiceConfig={practiceConfig}
				currentUrl={currentUrl}
			/>
			<ToastProvider>
				<Router>
  					<Route path="/auth" component={AuthPage} />
					<Route path="/cart" component={CartPage} />
					<Route path="/lawyers" component={LawyerSearchPage} />
					<Route path="/business-onboarding" component={BusinessOnboardingPage} />
					<Route path="/business-onboarding/*" component={BusinessOnboardingPage} />
					<Route path="/settings/*" component={SettingsRoute} />
  					<Route default component={(props) => {
						// Root route: show auth if not authenticated, otherwise show chat app
						if (!session?.user) {
							return <AuthPage />;
						}
						return (
							<MainApp
								practiceId={practiceId}
								practiceConfig={practiceConfig}
								practiceNotFound={practiceNotFound}
								handleRetryPracticeConfig={handleRetryPracticeConfig}
								{...props}
							/>
						);
					}} />
				</Router>

				{/* Hoisted Settings Modal - single instance persists across sub-routes */}
				{isSettingsOpen && (
					<SettingsLayout
						key="settings-modal-hoisted"
						isMobile={isMobileHoisted}
						onClose={() => {
							navigate('/');
						}}
						className="h-full"
					/>
				)}
			</ToastProvider>
		</>
	);
}

const FallbackLoader = () => (
	<div className="flex h-screen items-center justify-center text-sm text-gray-500 dark:text-gray-400">
		Loading…
	</div>
);

function AppWithProviders() {
	return (
		<I18nextProvider i18n={i18n}>
			<Suspense fallback={<FallbackLoader />}>
				<App />
			</Suspense>
		</I18nextProvider>
	);
}

async function mountClientApp() {
	// Initialize theme from localStorage with fallback to system preference
	const savedTheme = localStorage.getItem('theme');
	const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
	const shouldBeDark = savedTheme === 'dark' || (!savedTheme && prefersDark);

	if (shouldBeDark) {
		document.documentElement.classList.add('dark');
	}

	initI18n()
		.then(() => {
			hydrate(<AppWithProviders />, document.getElementById('app'));
		})
		.catch((_error) => {
			 
			console.error('Failed to initialize i18n:', _error);
			hydrate(<AppWithProviders />, document.getElementById('app'));
		});
}

if (typeof window !== 'undefined') {
	const bootstrap = () => mountClientApp();
	if (import.meta.env.DEV) {
		import('./mocks')
			.then(({ setupMocks }) => setupMocks())
			.catch(() => {})
			.finally(bootstrap);
	} else {
		bootstrap();
	}
}


export async function prerender() {
	await initI18n();
	return await ssr(<AppWithProviders />);
}
