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
import { useOrganizationManagement } from './hooks/useOrganizationManagement';
import { useMessageHandlingWithContext } from './hooks/useMessageHandling';
import { useFileUploadWithContext } from './hooks/useFileUpload';
import { useChatSessionWithContext } from './hooks/useChatSession';
import { setupGlobalKeyboardListeners } from './utils/keyboard';
import { ChatMessageUI } from '../worker/types';
// Settings components
import { SettingsLayout } from './components/settings/SettingsLayout';
import { useNavigation } from './utils/navigation';
import PricingModal from './components/PricingModal';
import WelcomeModal from './components/onboarding/WelcomeModal';
import { BusinessWelcomeModal } from './components/onboarding/BusinessWelcomeModal';
import { BusinessSetupModal } from './components/onboarding/BusinessSetupModal';
import { CartPage } from './components/cart/CartPage';
import { debounce } from './utils/debounce';
import { authClient } from './lib/authClient';
import './index.css';
import { i18n, initI18n } from './i18n';



// Main application component (non-auth pages)
function MainApp() {
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

	// Use organization context
	const { organizationId, organizationConfig, organizationNotFound, handleRetryOrganizationConfig } = useOrganization();
	
	// Use organization management for subscription tier
	const { currentOrganization } = useOrganizationManagement();

	const {
		sessionId,
		error: sessionError
	} = useChatSessionWithContext();

	const { messages, sendMessage, handleContactFormSubmit, addMessage } = useMessageHandlingWithContext({
		sessionId,
		onError: (error) => {
			// Handle message handling error
			 
			console.error('Message handling error:', error);
		}
	});

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
		} catch (error) {
			// Handle localStorage access failures (private browsing, etc.)
			if (import.meta.env.DEV) {
				 
				console.warn('Failed to check onboarding completion status:', error);
			}
		}
	}, []);

	// Check if we should show business setup modal (after tier upgrade)
	useEffect(() => {
		try {
			const businessSetupPending = localStorage.getItem('businessSetupPending');
			if (businessSetupPending === 'true') {
				setShowBusinessSetup(true);
				// Don't remove the flag here - let the modal handlers do it
			}
		} catch (error) {
			if (import.meta.env.DEV) {
				console.warn('Failed to check business setup status:', error);
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
	const [currentUserTier, setCurrentUserTier] = useState<'free' | 'plus' | 'business'>('free');
	
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

	// Listen for user tier changes
	useEffect(() => {
		const handleAuthStateChange = (e: CustomEvent) => {
			if (e.detail && e.detail.subscriptionTier) {
				setCurrentUserTier(e.detail.subscriptionTier);
			} else {
				// Fallback to 'free' when detail is missing or subscriptionTier is falsy
				setCurrentUserTier('free');
			}
		};

		// Use organization tier directly from organization management
		const checkUserTier = () => {
			const orgTier = currentOrganization?.subscriptionTier || 'free';
			setCurrentUserTier(orgTier as 'free' | 'plus' | 'business' | 'enterprise');
		};
		
		checkUserTier();

		window.addEventListener('authStateChanged', handleAuthStateChange as EventListener);
		
		return () => {
			window.removeEventListener('authStateChanged', handleAuthStateChange as EventListener);
		};
	}, [currentOrganization?.subscriptionTier]);

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
	}, [organizationConfig?.introMessage, messages.length, addMessage]);

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
		} catch (error) {
			// Handle localStorage access failures (private browsing, etc.)
			if (import.meta.env.DEV) {
				 
				console.warn('Failed to remove onboarding completion flag:', error);
			}
		}
	};

	const handleWelcomeClose = () => {
		setShowWelcomeModal(false);
		
		// Remove the onboarding completion flag even if user closes without completing
		// This prevents the welcome modal from showing again
		try {
			localStorage.removeItem('onboardingCompleted');
		} catch (error) {
			// Handle localStorage access failures (private browsing, etc.)
			if (import.meta.env.DEV) {
				 
				console.warn('Failed to remove onboarding completion flag:', error);
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
			sendMessage(`I've recorded a ${type} message.`, uploadedFiles);
			
		} catch (error) {
			// Handle media upload error
			 
			console.error('Failed to upload captured media:', error);
			// Show error message to user
			sendMessage("I'm sorry, I couldn't upload the recorded media. Please try again.", []);
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
				onSendMessage={sendMessage}
				onUploadDocument={async (files: File[], _metadata?: { documentType?: string; matterId?: string }) => {
					return await handleFileSelect(files);
				}}
			>
				<div className="relative h-full">
					<ChatContainer
						messages={messages}
						onSendMessage={sendMessage}
						onContactFormSubmit={handleContactFormSubmit}
						organizationConfig={{
							name: organizationConfig?.name ?? '',
							profileImage: organizationConfig?.profileImage ?? null,
							organizationId,
							description: organizationConfig?.description ?? ''
						}}
						onOpenSidebar={() => setIsMobileSidebarOpen(true)}
						sessionId={sessionId}
						organizationId={organizationId}
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
						/>
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
					// Update user's subscription tier
					try {
						const session = await authClient.getSession();
						if (session?.data?.user) {
							// For now, just update the local state
							// In a real implementation, this would make an API call to update the user's subscription
							setCurrentUserTier(tier);
							
							// Dispatch event to notify other components
							window.dispatchEvent(new CustomEvent('authStateChanged', { 
								detail: { 
									...session.data.user, 
									subscriptionTier: tier 
								} 
							}));
						} else {
							// User not authenticated, just update local state
							setCurrentUserTier(tier);
						}
					} catch (error) {
						console.error('Error updating subscription tier:', error);
						// Still update local state as fallback
						setCurrentUserTier(tier);
					}
					
					// Always ensure these cleanup operations run
					setShowPricingModal(false);
					window.location.hash = '';
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
				onClose={() => setShowBusinessSetup(false)}
			/>
		</>
	);
}


// Main App component with routing
export function App() {
	return (
		<LocationProvider>
			<OrganizationProvider onError={(error) => console.error('Organization config error:', error)}>
				<ToastProvider>
					<AppWithSEO />
				</ToastProvider>
			</OrganizationProvider>
		</LocationProvider>
	);
}

// Component that uses organization context for SEO
function AppWithSEO() {
	const { organizationConfig } = useOrganization();
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
			<Router>
				<Route path="/auth" component={AuthPage} />
				<Route path="/cart" component={CartPage} />
				<Route path="/settings/*" component={MainApp} />
				<Route default component={MainApp} />
			</Router>
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
		.catch((error) => {
			 
			console.error('Failed to initialize i18n:', error);
			hydrate(<AppWithProviders />, document.getElementById('app'));
		});
}


export async function prerender() {
	await initI18n();
	return await ssr(<AppWithProviders />);
}
