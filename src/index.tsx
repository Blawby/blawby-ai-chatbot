import { hydrate, prerender as ssr, Router, Route, useLocation, LocationProvider } from 'preact-iso';
import { useState, useEffect, useCallback, useLayoutEffect, useRef, useMemo } from 'preact/hooks';
import { Suspense } from 'preact/compat';
import { I18nextProvider } from 'react-i18next';
import ChatContainer from './components/ChatContainer';
import DragDropOverlay from './components/DragDropOverlay';
import AppLayout from './components/AppLayout';
import AuthPage from './components/AuthPage';
import { SEOHead } from './components/SEOHead';
import { ConversationHeader } from './components/chat/ConversationHeader';
import { ToastProvider } from './contexts/ToastContext';
import { SessionProvider, useSessionContext } from './contexts/SessionContext';
import { useSession } from './lib/authClient';
import { type SubscriptionTier } from './types/user';
import { resolveOrganizationKind } from './utils/subscription';
import type { UIOrganizationConfig } from './hooks/useOrganizationConfig';
import { useMessageHandlingWithContext } from './hooks/useMessageHandling';
import { useFileUploadWithContext } from './hooks/useFileUpload';
import { useChatSessionWithContext } from './hooks/useChatSession';
import { setupGlobalKeyboardListeners } from './utils/keyboard';
import type { ChatMessageUI, FileAttachment } from '../worker/types';
// Settings components
import { SettingsLayout } from './components/settings/SettingsLayout';
import { useNavigation } from './utils/navigation';
import { PricingModal, WelcomeModal } from './components/modals/organisms';
import { useWelcomeModal } from './components/modals/hooks/useWelcomeModal';
import { BusinessWelcomePrompt } from './components/onboarding/organisms/BusinessWelcomePrompt';
import { BusinessOnboardingPage } from './components/pages/BusinessOnboardingPage';
import { CartPage } from './components/cart/CartPage';
import { debounce } from './utils/debounce';
import { useToastContext } from './contexts/ToastContext';
import { useOrganizationConfig } from './hooks/useOrganizationConfig';
import { useOrganizationManagement } from './hooks/useOrganizationManagement';
import QuotaBanner from './components/QuotaBanner';
import { PLATFORM_ORGANIZATION_ID } from './utils/constants';
import { listPractices, createPractice } from './lib/apiClient';
import './index.css';
import { i18n, initI18n } from './i18n';

const DEFAULT_PRACTICE_PHONE =
	(import.meta.env.VITE_DEFAULT_PRACTICE_PHONE ?? '+17025550123').trim();
const DEFAULT_CONSULTATION_FEE = Number.parseFloat(
	import.meta.env.VITE_DEFAULT_CONSULTATION_FEE ?? '150'
);



// Main application component (non-auth pages)
function MainApp({ 
	organizationId, 
	organizationConfig, 
	organizationNotFound, 
	handleRetryOrganizationConfig
}: {
	organizationId: string;
	organizationConfig: UIOrganizationConfig;
	organizationNotFound: boolean;
	handleRetryOrganizationConfig: () => void;
}) {
	// Core state
	const [clearInputTrigger, setClearInputTrigger] = useState(0);
	const [currentTab, setCurrentTab] = useState<'chats' | 'matter'>('chats');
	const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
	const [isRecording, setIsRecording] = useState(false);
	const location = useLocation();
	const { navigate } = useNavigation();
	const isSettingsRouteNow = location.path.startsWith('/settings');
	const [showWelcomeModal, setShowWelcomeModal] = useState(false);
	const [showBusinessWelcome, setShowBusinessWelcome] = useState(false);
	// Removed legacy business setup modal flow (replaced by /business-onboarding route)
	
	// Mobile state - initialized as false to avoid SSR/client hydration mismatch
	const [_isMobile, setIsMobile] = useState(false);
	
	// Use session from Better Auth
	const { data: session, isPending: sessionIsPending } = useSession();

	// Organization data is now passed as props
	
  // Using our custom organization system instead of Better Auth's organization plugin
	// Removed unused submitUpgrade
	const { showError } = useToastContext();
	const showErrorRef = useRef(showError);
	useEffect(() => {
		showErrorRef.current = showError;
	}, [showError]);
	const { quota, refreshQuota, activeOrganizationSlug: _activeOrganizationSlug, activeOrganizationId } = useSessionContext();
	const { currentOrganization, refetch: refetchOrganizations, acceptMatter, rejectMatter, updateMatterStatus } = useOrganizationManagement();
	const [selectedMatterId, setSelectedMatterId] = useState<string | null>(null);

	useEffect(() => {
		setSelectedMatterId(null);
	}, [organizationId]);

	const isQuotaRestricted = Boolean(
		quota &&
		!quota.unlimited &&
		quota.limit > 0 &&
		quota.used >= quota.limit
	);

	const quotaUsageMessage = isQuotaRestricted
		? (activeOrganizationId === PLATFORM_ORGANIZATION_ID
			? 'You have used all available anonymous messages for this month.'
			: 'You have reached the monthly message limit for your current plan.')
		: null;

	const {
		sessionId,
		error: sessionError
	} = useChatSessionWithContext();

	const { messages, sendMessage, handleContactFormSubmit, addMessage } = useMessageHandlingWithContext({
		sessionId,
		onError: (error) => {
			console.error('Message handling error:', error);
			showError(typeof error === 'string' ? error : 'We hit a snag sending that message.');
		}
	});

	const handleSendMessage = useCallback(async (message: string, attachments: FileAttachment[] = []) => {
		// Let sendMessage errors propagate to its onError handler
		await sendMessage(message, attachments);
		
		// Handle quota refresh separately to avoid leaving stale UI
		try {
			await refreshQuota();
		} catch (_error) {
			// Log for diagnostics
			console.error('Failed to refresh quota after sending message:', _error);
			// Show user-facing notification for quota refresh failure
			showError('Unable to update usage quota', 'Your message was sent, but we couldn\'t refresh your usage information.');
		}
	}, [sendMessage, refreshQuota, showError]);

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
		sessionId,
		onError: (error) => {
			// Handle file upload error
			 
			console.error('File upload error:', error);
		}
	});

	useEffect(() => {
		if (sessionError) {
			// Handle session initialization error
			 
			console.error('Session initialization error:', sessionError);
		}
	}, [sessionError]);

    // Welcome modal state via server-truth + session debounce
    const { shouldShow: shouldShowWelcome, markAsShown: markWelcomeAsShown } = useWelcomeModal();
    useEffect(() => {
        setShowWelcomeModal(shouldShowWelcome);
    }, [shouldShowWelcome]);

    // Check if OAuth user needs onboarding (one-time check after auth)
    useEffect(() => {
        // Ensure practice exists once per session if user is present
        (async () => {
            try {
                if (session?.user && typeof window !== 'undefined') {
                    const key = `ensuredPractice_v1_${session.user.id}`;
                    if (!sessionStorage.getItem(key)) {
                        const controller = new AbortController();
                        const timeoutId = setTimeout(() => controller.abort(), 10000);
                        
                        // Check if practices exist
                        try {
                            const practices = await listPractices({ signal: controller.signal, scope: 'all' });

                            if (practices.length === 0) {
                                const userName = session.user.name || session.user.email?.split('@')[0] || 'User';
                                const practiceName = `${userName}'s Practice`;
                                const sanitizedUserId = (session.user.id ?? '')
                                    .toString()
                                    .toLowerCase()
                                    .replace(/[^a-z0-9]/g, '');
                                const randomSuffix = typeof crypto !== 'undefined' && crypto.randomUUID
                                    ? crypto.randomUUID().replace(/-/g, '').slice(0, 8)
                                    : Math.random().toString(36).slice(2, 10);
                                const slugSource = sanitizedUserId && sanitizedUserId.length >= 12
                                    ? sanitizedUserId
                                    : `${sanitizedUserId}-${randomSuffix}`;
                                const practiceSlug = `practice-${slugSource}`
                                    .replace(/--+/g, '-')
                                    .slice(0, 64);
                                const businessPhone = DEFAULT_PRACTICE_PHONE.length
                                    ? DEFAULT_PRACTICE_PHONE
                                    : undefined;
                                const consultationFee =
                                    Number.isFinite(DEFAULT_CONSULTATION_FEE) && DEFAULT_CONSULTATION_FEE > 0
                                        ? DEFAULT_CONSULTATION_FEE
                                        : undefined;

                                await createPractice({
                                    name: practiceName,
                                    slug: practiceSlug,
                                    businessEmail: session.user.email || undefined,
                                    ...(businessPhone ? { businessPhone } : {}),
                                    ...(consultationFee ? { consultationFee } : {})
                                }, { signal: controller.signal });
                            }

                            clearTimeout(timeoutId);
                            sessionStorage.setItem(key, '1');
                        } catch (e) {
                            clearTimeout(timeoutId);
                            if (e instanceof Error && e.name === 'CanceledError') {
                                return;
                            }
                            console.warn('Failed to ensure practice (non-OK response):', e);
                            // Don't show error for 404s - practice might not be needed yet
                            if (e && typeof e === 'object' && 'response' in e && (e as any).response?.status !== 404) {
                                showErrorRef.current('Couldn\'t set up your workspace', 'Please refresh and try again. If this keeps happening, contact support.');
                            }
                            return;
                        }
                    }
                }
            } catch (e) {
                console.warn('Failed to ensure practice (client fallback):', e);
                // Don't show error for expected failures
                if (e && typeof e === 'object' && 'response' in e && (e as any).response?.status !== 404) {
                    showErrorRef.current('Couldn\'t set up your workspace', 'Please refresh and try again. If this keeps happening, contact support.');
                }
            }
        })();
    }, [session?.user, sessionIsPending]);

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
	
  // Derive current user tier from organization config (our custom system)
  // Note: subscriptionTier is on Organization, not OrganizationConfig
  const resolvedKindForTier = resolveOrganizationKind(currentOrganization?.kind, currentOrganization?.isPersonal ?? null);
  
  // Whitelist of valid SubscriptionTier values
  const VALID_SUBSCRIPTION_TIERS: SubscriptionTier[] = ['free', 'plus', 'business', 'enterprise'];
  
  // Normalize and validate subscriptionTier
  const normalizedTier = currentOrganization?.subscriptionTier
    ? currentOrganization.subscriptionTier.trim().toLowerCase()
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

	// User tier is now derived directly from organization - no need for custom event listeners

	const isSessionReady = Boolean(sessionId);


	// Add intro message when organization config is loaded and no messages exist
	useEffect(() => {
		if (organizationConfig && organizationConfig.introMessage && messages.length === 0) {
			// Add intro message only (organization profile is now a UI element)
			const introMessage: ChatMessageUI = {
				id: crypto.randomUUID(),
				content: organizationConfig.introMessage,
				isUser: false,
				role: 'assistant',
				timestamp: Date.now()
			};
			addMessage(introMessage);
		}
	}, [organizationConfig, messages.length, addMessage]);

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

	// Mobile detection with resize handling
	useLayoutEffect(() => {
		// Function to check if mobile
		const checkIsMobile = () => {
			return window.innerWidth < 1024;
		};

		// Set initial mobile state
		setIsMobile(checkIsMobile());

		// Create debounced resize handler for performance
		const debouncedResizeHandler = debounce(() => {
			setIsMobile(checkIsMobile());
		}, 100);

		// Add resize listener
		window.addEventListener('resize', debouncedResizeHandler);

		// Cleanup function
		return () => {
			window.removeEventListener('resize', debouncedResizeHandler);
			debouncedResizeHandler.cancel();
		};
	}, []);

	// Handle feedback submission
	const handleFeedbackSubmit = useCallback((feedback: Record<string, unknown>) => {
		// Handle feedback submission
		 
		console.log('Feedback submitted:', feedback);
		// Could show a toast notification here
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
		navigate('/settings/organization');
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
				organizationNotFound={organizationNotFound}
				organizationId={organizationId}
				onRetryOrganizationConfig={handleRetryOrganizationConfig}
				currentTab={currentTab}
				onTabChange={setCurrentTab}
				isMobileSidebarOpen={isMobileSidebarOpen}
				onToggleMobileSidebar={setIsMobileSidebarOpen}
				isSettingsModalOpen={isSettingsRouteNow}
				organizationConfig={{
					name: organizationConfig.name ?? '',
					profileImage: organizationConfig?.profileImage ?? null,
					description: organizationConfig?.description ?? ''
				}}
				currentOrganization={currentOrganization}
				onOnboardingCompleted={refetchOrganizations}
				messages={messages}
				onSendMessage={handleSendMessage}
				onUploadDocument={async (files: File[], _metadata?: { documentType?: string; matterId?: string }) => {
					return await handleFileSelect(files);
				}}
				selectedMatterId={selectedMatterId}
				onMatterSelect={setSelectedMatterId}
			>
				<div className="relative h-full flex flex-col">
					<ConversationHeader
						organizationId={organizationId}
						matterId={selectedMatterId}
						acceptMatter={acceptMatter}
						rejectMatter={rejectMatter}
						updateMatterStatus={updateMatterStatus}
					/>
					{(quota && !quota.unlimited) && (
						<div className="px-4 pt-4">
							<QuotaBanner
								quota={quota}
								onUpgrade={() => navigate('/pricing')}
							/>
						</div>
					)}
					<div className="flex-1 min-h-0">
						<ChatContainer
							messages={messages}
							onSendMessage={handleSendMessage}
							onContactFormSubmit={handleContactFormSubmit}
							organizationConfig={{
								name: organizationConfig.name ?? '',
								profileImage: organizationConfig?.profileImage ?? null,
								organizationId,
								description: organizationConfig?.description ?? ''
							}}
							onOpenSidebar={() => setIsMobileSidebarOpen(true)}
							sessionId={sessionId}
							organizationId={'blawby-ai'}
							onFeedbackSubmit={handleFeedbackSubmit}
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
							isUsageRestricted={isQuotaRestricted}
							usageMessage={quotaUsageMessage}
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
        <AppWithOrganization />
      </SessionProvider>
    </LocationProvider>
  );
}

// Component that loads organization config when authenticated
function AppWithOrganization() {
  const { data: session, isPending: sessionIsPending } = useSession();
  const handleOrgError = useCallback((error: string) => {
    console.error('Organization config error:', error);
  }, []);

  // Only load organization config when authenticated
  const {
    organizationId,
    organizationConfig,
    organizationNotFound,
    handleRetryOrganizationConfig,
    isLoading
  } = useOrganizationConfig({ onError: handleOrgError });

  // Show loading state while checking auth or loading org config
  if (isLoading || sessionIsPending) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-gray-500 dark:text-gray-400">
        Loading…
      </div>
    );
  }

  return (
    <AppWithSEO
      organizationId={organizationId}
      organizationConfig={organizationConfig}
      organizationNotFound={organizationNotFound}
      handleRetryOrganizationConfig={handleRetryOrganizationConfig}
      session={session}
    />
  );
}

function AppWithSEO({
  organizationId,
  organizationConfig,
  organizationNotFound,
  handleRetryOrganizationConfig,
  session,
}: {
  organizationId: string;
  organizationConfig: UIOrganizationConfig;
  organizationNotFound: boolean;
  handleRetryOrganizationConfig: () => void;
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
	const [isMobileHoisted, setIsMobileHoisted] = useState(false);
	useLayoutEffect(() => {
		if (typeof window === 'undefined') return;
		const checkIsMobile = () => window.innerWidth < 1024;
		setIsMobileHoisted(checkIsMobile());
		const debouncedResizeHandler = debounce(() => {
			setIsMobileHoisted(checkIsMobile());
		}, 100);
		window.addEventListener('resize', debouncedResizeHandler);
		return () => {
			window.removeEventListener('resize', debouncedResizeHandler);
			debouncedResizeHandler.cancel();
		};
	}, []);

	// Stable component to avoid remounting the MainApp subtree for settings
	const SettingsRoute = useMemo(() => {
		return function SettingsRouteInner(props: Record<string, unknown>) {
			return (
				<MainApp 
					organizationId={organizationId}
					organizationConfig={organizationConfig}
					organizationNotFound={organizationNotFound}
					handleRetryOrganizationConfig={handleRetryOrganizationConfig}
					{...props}
				/>
			);
		};
	}, [organizationId, organizationConfig, organizationNotFound, handleRetryOrganizationConfig]);

	return (
		<>
			<SEOHead 
				organizationConfig={organizationConfig}
				currentUrl={currentUrl}
			/>
			<ToastProvider>
				<Router>
  					<Route path="/auth" component={AuthPage} />
					<Route path="/cart" component={CartPage} />
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
								organizationId={organizationId}
								organizationConfig={organizationConfig}
								organizationNotFound={organizationNotFound}
								handleRetryOrganizationConfig={handleRetryOrganizationConfig}
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
