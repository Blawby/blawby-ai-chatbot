import { hydrate, prerender as ssr, Router, Route, useLocation, LocationProvider } from 'preact-iso';
import { useState, useEffect, useCallback, useLayoutEffect } from 'preact/hooks';
import { Suspense } from 'preact/compat';
import { I18nextProvider } from 'react-i18next';
import ChatContainer from './components/ChatContainer';
import DragDropOverlay from './components/DragDropOverlay';
import AppLayout from './components/AppLayout';
import AuthPage from './components/AuthPage';
import { SEOHead } from './components/SEOHead';
import { ToastProvider } from './contexts/ToastContext';
import { OrganizationProvider, useOrganization } from './contexts/OrganizationContext';
import { SessionProvider } from './contexts/SessionContext';
import { AuthProvider, useSession } from './contexts/AuthContext';
import { authClient } from './lib/authClient';
import { type SubscriptionTier, type OrganizationConfig } from './types/user';
import { useMessageHandlingWithContext } from './hooks/useMessageHandling';
import { useFileUploadWithContext } from './hooks/useFileUpload';
import { useChatSessionWithContext } from './hooks/useChatSession';
import { setupGlobalKeyboardListeners } from './utils/keyboard';
import type { ChatMessageUI, FileAttachment } from '../worker/types';
// Settings components
import { SettingsLayout } from './components/settings/SettingsLayout';
import { useNavigation } from './utils/navigation';
import PricingModal from './components/PricingModal';
import WelcomeModal from './components/onboarding/WelcomeModal';
import { BusinessWelcomeModal } from './components/onboarding/BusinessWelcomeModal';
import { BusinessSetupModal } from './components/onboarding/BusinessSetupModal';
import { CartPage } from './components/cart/CartPage';
import { debounce } from './utils/debounce';
import { usePaymentUpgrade } from './hooks/usePaymentUpgrade';
import { useToastContext } from './contexts/ToastContext';
import { useSessionContext } from './contexts/SessionContext';
import QuotaBanner from './components/QuotaBanner';
// useSession is now imported from AuthContext above
import './index.css';
import { i18n, initI18n } from './i18n';



// Main application component (non-auth pages)
function MainApp({ 
	organizationId, 
	organizationConfig, 
	organizationNotFound, 
	handleRetryOrganizationConfig,
	...routeProps
}: {
	organizationId: string;
	organizationConfig: OrganizationConfig;
	organizationNotFound: boolean;
	handleRetryOrganizationConfig: () => void;
} & Record<string, any>) {
	// Core state
	const [clearInputTrigger, setClearInputTrigger] = useState(0);
	const [currentTab, setCurrentTab] = useState<'chats' | 'matter'>('chats');
	const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
	const [isRecording, setIsRecording] = useState(false);
	const [showSettingsModal, setShowSettingsModal] = useState(false);
	const [showWelcomeModal, setShowWelcomeModal] = useState(false);
	const [showBusinessWelcome, setShowBusinessWelcome] = useState(false);
	const [showBusinessSetup, setShowBusinessSetup] = useState(false);
	
	// Mobile state - initialized as false to avoid SSR/client hydration mismatch
	const [isMobile, setIsMobile] = useState(false);
	
	// Get current location to detect settings routes
	const location = useLocation();
	const { navigate } = useNavigation();

	// Use session from Better Auth
	const { data: session, isPending: sessionIsPending } = useSession();

	// Organization data is now passed as props
	
  // Using our custom organization system instead of Better Auth's organization plugin
	const { submitUpgrade } = usePaymentUpgrade();
	const { showError } = useToastContext();
	const { quota, quotaLoading, refreshQuota, activeOrganizationSlug } = useSessionContext();

	const isQuotaRestricted = Boolean(
		quota &&
		!quota.messages.unlimited &&
		quota.messages.limit > 0 &&
		quota.messages.remaining !== null &&
		quota.messages.remaining <= 0
	);

	const quotaUsageMessage = isQuotaRestricted
		? (activeOrganizationSlug === 'blawby-ai'
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

	// Handle settings modal based on URL
	useEffect(() => {
		const isSettingsRoute = location.path.startsWith('/settings');
		setShowSettingsModal(isSettingsRoute);
	}, [location.path]);

	// Check if we should show welcome modal (after onboarding completion)
	useEffect(() => {
		// Check if user just completed onboarding
		try {
			const onboardingCompleted = localStorage.getItem('onboardingCompleted');
			if (onboardingCompleted === 'true') {
				setShowWelcomeModal(true);
				// Don't remove the flag here - let the completion handler do it
				// This prevents permanent loss if the modal fails to render
			}
		} catch (_error) {
			// Handle localStorage access failures (private browsing, etc.)
			if (import.meta.env.DEV) {
				 
				console.warn('Failed to check onboarding completion status:', _error);
			}
		}
	}, []);

	// Check if OAuth user needs onboarding (one-time check after auth)
	useEffect(() => {
		if (session?.user && !sessionIsPending) {
			// Only check if this is a fresh authentication (no localStorage flag set)
			const hasOnboardingFlag = localStorage.getItem('onboardingCompleted');
			const hasOnboardingCheckFlag = localStorage.getItem('onboardingCheckDone');
			
			// If user hasn't completed onboarding and we haven't checked yet
			if (!hasOnboardingFlag && !hasOnboardingCheckFlag) {
				const userWithOnboarding = session.user as typeof session.user & { onboardingCompleted?: boolean };
				const needsOnboarding = userWithOnboarding.onboardingCompleted === false || 
										userWithOnboarding.onboardingCompleted === undefined;
				
				if (needsOnboarding) {
					// Set flag to prevent repeated checks
					try {
						localStorage.setItem('onboardingCheckDone', 'true');
					} catch (_error) {
						// Handle localStorage failures gracefully
					}
					
					// Redirect to auth page with onboarding
					window.location.href = '/auth?mode=signin&onboarding=true';
				} else {
					// User has completed onboarding, set the flag
					try {
						localStorage.setItem('onboardingCheckDone', 'true');
					} catch (_error) {
						// Handle localStorage failures gracefully
					}
				}
			}
		}
	}, [session?.user, sessionIsPending, session]);

	// Check if we should show business setup modal (after tier upgrade)
	useEffect(() => {
		try {
			const businessSetupPending = localStorage.getItem('businessSetupPending');
			if (businessSetupPending === 'true') {
				setShowBusinessSetup(true);
				// Don't remove the flag here - let the modal handlers do it
			}
		} catch (_error) {
			if (import.meta.env.DEV) {
				console.warn('Failed to check business setup status:', _error);
			}
		}
	}, []);

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
  const currentUserTier = (organizationConfig?.subscriptionTier || 'free') as SubscriptionTier;
	
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

	// Handle welcome modal
	const handleWelcomeComplete = () => {
		setShowWelcomeModal(false);
		
		// Remove the onboarding completion flag now that the welcome modal has been shown
		try {
			localStorage.removeItem('onboardingCompleted');
		} catch (_error) {
			// Handle localStorage access failures (private browsing, etc.)
			if (import.meta.env.DEV) {
				 
				console.warn('Failed to remove onboarding completion flag:', _error);
			}
		}
	};

	const handleWelcomeClose = () => {
		setShowWelcomeModal(false);
		
		// Remove the onboarding completion flag even if user closes without completing
		// This prevents the welcome modal from showing again
		try {
			localStorage.removeItem('onboardingCompleted');
		} catch (_error) {
			// Handle localStorage access failures (private browsing, etc.)
			if (import.meta.env.DEV) {
				 
				console.warn('Failed to remove onboarding completion flag:', _error);
			}
		}
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
				isSettingsModalOpen={showSettingsModal}
				organizationConfig={{
					name: organizationConfig?.name ?? '',
					profileImage: organizationConfig?.profileImage ?? null,
					description: organizationConfig?.description ?? ''
				}}
				messages={messages}
				onSendMessage={handleSendMessage}
				onUploadDocument={async (files: File[], _metadata?: { documentType?: string; matterId?: string }) => {
					return await handleFileSelect(files);
				}}
			>
				<div className="relative h-full flex flex-col">
					{(quota && !quota.messages.unlimited) && (
						<div className="px-4 pt-4">
							<QuotaBanner
								quota={quota}
								loading={quotaLoading}
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
								name: organizationConfig?.name ?? '',
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

			{/* Settings Modal */}
			{showSettingsModal && (
				<SettingsLayout
					isMobile={isMobile}
					onClose={() => {
						setShowSettingsModal(false);
						setIsMobileSidebarOpen(false); // Close mobile sidebar when settings close
						navigate('/');
					}}
					className="h-full"
				/>
			)}

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

						// Always use blawby-ai organization for stripe upgrades
						const stripeOrganizationId = 'blawby-ai';

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
				<BusinessWelcomeModal
					isOpen={showBusinessWelcome}
					onClose={handleBusinessWelcomeClose}
				/>
			)}

			{/* Business Setup Modal */}
			<BusinessSetupModal
				isOpen={showBusinessSetup}
				onClose={() => {
					// Clear the localStorage flag so modal doesn't reappear on reload
					try {
						localStorage.removeItem('businessSetupPending');
					} catch (_error) {
						if (import.meta.env.DEV) {
							console.warn('Failed to remove business setup flag:', _error);
						}
					}
					setShowBusinessSetup(false);
				}}
			/>
		</>
	);
}


// Main App component with routing
export function App() {
	const handleOrgError = useCallback((error: string) => {
		console.error('Organization config error:', error);
	}, []);

	return (
		<LocationProvider>
			<AuthProvider>
				<OrganizationProvider onError={handleOrgError}>
					<AppWithOrganization />
				</OrganizationProvider>
			</AuthProvider>
		</LocationProvider>
	);
}

// Component that calls useOrganization and passes data to AppWithSEO
function AppWithOrganization() {
	const { organizationId, organizationConfig, organizationNotFound, handleRetryOrganizationConfig } = useOrganization();
	
	return <AppWithSEO 
		organizationId={organizationId}
		organizationConfig={organizationConfig}
		organizationNotFound={organizationNotFound}
		handleRetryOrganizationConfig={handleRetryOrganizationConfig}
	/>;
}

// Component that uses organization context for SEO
function AppWithSEO({ 
	organizationId, 
	organizationConfig, 
	organizationNotFound, 
	handleRetryOrganizationConfig 
}: {
	organizationId: string;
	organizationConfig: OrganizationConfig;
	organizationNotFound: boolean;
	handleRetryOrganizationConfig: () => void;
}) {
	const location = useLocation();
	
	// Create reactive currentUrl that updates on navigation
	const currentUrl = typeof window !== 'undefined' 
		? `${window.location.origin}${location.url}`
		: undefined;
	
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
					<Route path="/settings/*" component={(props) => <MainAppWithProviders 
						organizationId={organizationId}
						organizationConfig={organizationConfig}
						organizationNotFound={organizationNotFound}
						handleRetryOrganizationConfig={handleRetryOrganizationConfig}
						{...props}
					/>} />
					<Route default component={(props) => <MainAppWithProviders 
						organizationId={organizationId}
						organizationConfig={organizationConfig}
						organizationNotFound={organizationNotFound}
						handleRetryOrganizationConfig={handleRetryOrganizationConfig}
						{...props}
					/>} />
				</Router>
			</ToastProvider>
		</>
	);
}

// Wrapper component that provides context to MainApp
function MainAppWithProviders(props: {
	organizationId: string;
	organizationConfig: OrganizationConfig;
	organizationNotFound: boolean;
	handleRetryOrganizationConfig: () => void;
} & Record<string, any>) {
	return (
		<SessionProvider>
			<MainApp {...props} />
		</SessionProvider>
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

if (typeof window !== 'undefined') {
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


export async function prerender() {
	await initI18n();
	return await ssr(<AppWithProviders />);
}
