import { hydrate, prerender as ssr, Router, Route, useLocation, LocationProvider } from 'preact-iso';
import { useCallback, useEffect, useMemo } from 'preact/hooks';
import { Suspense } from 'preact/compat';
import { I18nextProvider } from 'react-i18next';
import AuthPage from '@/pages/AuthPage';
import { SEOHead } from '@/app/SEOHead';
import { ToastProvider } from '@/shared/contexts/ToastContext';
import { SessionProvider } from '@/shared/contexts/SessionContext';
import { useSession, getClient } from '@/shared/lib/authClient';
import type { UIPracticeConfig } from '@/shared/hooks/usePracticeConfig';
import { MainApp } from '@/app/MainApp';
// Settings components
import { SettingsLayout } from '@/features/settings/components/SettingsLayout';
import { useNavigation } from '@/shared/utils/navigation';
import { BusinessOnboardingPage } from '@/pages/BusinessOnboardingPage';
import LawyerSearchPage from '@/pages/LawyerSearchPage';
import { CartPage } from '@/features/cart/pages/CartPage';
import { usePracticeConfig } from '@/shared/hooks/usePracticeConfig';
import { useMobileDetection } from '@/shared/hooks/useMobileDetection';
import { handleError } from '@/shared/utils/errorHandler';
import './index.css';
import { i18n, initI18n } from '@/shared/i18n';




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

// Component that loads practice config and manages session state
function AppWithPractice() {
  const location = useLocation();
  const { data: session, isPending: sessionIsPending } = useSession();
  const handlePracticeError = useCallback((error: string) => {
    console.error('Practice config error:', error);
  }, []);

  const slugFromPath = useMemo(() => {
    const segments = location.path.split('/').filter(Boolean);
    if (segments.length !== 1) return null;
    const slug = segments[0];
    const reserved = ['auth', 'cart', 'lawyers', 'business-onboarding', 'settings'];
    return reserved.includes(slug) ? null : slug;
  }, [location.path]);

  // Load practice config for authenticated users or guest slug routes
  const {
    practiceId,
    practiceConfig,
    practiceNotFound,
    handleRetryPracticeConfig,
    isLoading
  } = usePracticeConfig({
    onError: handlePracticeError,
    practiceId: slugFromPath ?? undefined,
    allowUnauthenticated: true
  });

  // Handle anonymous sign-in for widget users (clients chatting with practices)
  useEffect(() => {
    if (typeof window === 'undefined' || sessionIsPending) return;
    
    // If no session and practiceId is available (widget context), sign in anonymously
    if (!session?.user && practiceId) {
      const key = `anonymous_signin_attempted_${practiceId}`;
      const retryCountKey = `anonymous_signin_retries_${practiceId}`;
      let attempted = sessionStorage.getItem(key);
      const retryCount = parseInt(sessionStorage.getItem(retryCountKey) || '0', 10);
      
      // Max retries to prevent infinite loops even in dev
      if (retryCount >= 3) {
        console.error('[Auth] Max anonymous sign-in retries reached', { practiceId, retryCount });
        return;
      }
      
      // If we marked it as successful but there's no actual session, clear it and retry
      // This handles cases where sign-in appeared to succeed but session isn't valid
      if (attempted === '1' && !session?.user) {
        console.log('[Auth] Session invalid despite successful sign-in, clearing flag and retrying');
        sessionStorage.removeItem(key);
        sessionStorage.setItem(retryCountKey, String(retryCount + 1));
        attempted = null;
      }
      
      // In development with mocks, only allow retries for failed attempts
      if (import.meta.env.DEV && attempted === 'failed') {
        console.log('[Auth] Clearing failed anonymous sign-in attempt for retry in dev mode');
        sessionStorage.removeItem(key);
        sessionStorage.setItem(retryCountKey, String(retryCount + 1));
        attempted = null;
      }
      
      if (!attempted) {
        console.log('[Auth] Attempting anonymous sign-in', { practiceId });
        (async () => {
          try {
            const client = getClient();
            console.log('[Auth] Client obtained, checking for anonymous method...');
            
            // Type assertion needed: Better Auth anonymous plugin types may not be fully exposed
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const signIn = client.signIn as any;
            console.log('[Auth] signIn object:', { 
              hasSignIn: !!signIn, 
              signInKeys: signIn ? Object.keys(signIn) : null,
              hasAnonymous: !!(signIn?.anonymous),
              anonymousType: typeof signIn?.anonymous
            });
            
            const anonymousSignIn = signIn?.anonymous;
            
            // Check if anonymous method exists before calling
            if (typeof anonymousSignIn !== 'function') {
              console.error('[Auth] Anonymous sign-in method not available', {
                practiceId,
                signInKeys: signIn ? Object.keys(signIn) : null,
                message: 'Better Auth anonymous plugin may not be configured correctly.'
              });
              handleError('Anonymous sign-in method not available', {
                practiceId,
                signInKeys: signIn ? Object.keys(signIn) : null,
              }, { component: 'Auth', action: 'anonymous-sign-in', silent: import.meta.env.DEV });
              sessionStorage.setItem(key, 'failed');
              return;
            }
            
            console.log('[Auth] Calling anonymous sign-in...');
            const result = await anonymousSignIn();
            
            // Better Auth returns { data, error } format
            // If there's no error, the sign-in succeeded
            // Better Auth will automatically update the session via useSession()
            if (result?.error) {
              // Fail loudly - Better Auth anonymous plugin may not be configured
              console.error('[Auth] Anonymous sign-in failed', {
                error: result.error,
                practiceId,
                message: 'The server needs to have the Better Auth anonymous plugin enabled. Check server logs for details.'
              });
              handleError(result.error, {
                practiceId,
              }, { component: 'Auth', action: 'anonymous-sign-in', silent: import.meta.env.DEV });
              // Set key to prevent retry loops, but log error clearly
              sessionStorage.setItem(key, 'failed');
            } else {
              // Success - no error means sign-in worked
              // Better Auth will update the session automatically
              sessionStorage.setItem(key, '1');
              sessionStorage.removeItem(retryCountKey);
              console.log('[Auth] Anonymous sign-in successful for widget user', {
                practiceId,
                hasData: !!result?.data
              });
            }
          } catch (error) {
            // Fail loudly with detailed error information
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('[Auth] Anonymous sign-in exception', {
              error: errorMessage,
              practiceId,
              stack: error instanceof Error ? error.stack : undefined,
              message: 'CRITICAL: Better Auth anonymous plugin must be configured on the API server. ' +
                       'Check server logs and ensure anonymous() plugin is added to Better Auth config.'
            });
            handleError(error, {
              practiceId,
            }, { component: 'Auth', action: 'anonymous-sign-in', silent: import.meta.env.DEV });
            // Set key to prevent retry loops
            sessionStorage.setItem(key, 'failed');
          }
        })();
      } else {
        console.log('[Auth] Anonymous sign-in already attempted, skipping', { 
          practiceId, 
          status: sessionStorage.getItem(key) 
        });
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
					<Route path="/:practiceSlug" component={(props) => (
						<MainApp
							practiceId={practiceId}
							practiceConfig={practiceConfig}
							practiceNotFound={practiceNotFound}
							handleRetryPracticeConfig={handleRetryPracticeConfig}
							{...props}
						/>
					)} />
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
	// Only enable MSW if explicitly enabled via VITE_ENABLE_MSW env var
	const enableMocks = import.meta.env.DEV && import.meta.env.VITE_ENABLE_MSW === 'true';
	
	if (enableMocks) {
		import('./mocks')
			.then(({ setupMocks }) => {
				console.log('[App] Setting up MSW mocks...');
				return setupMocks();
			})
			.then(() => {
				console.log('[App] MSW mocks ready, bootstrapping app...');
				bootstrap();
			})
			.catch((err) => {
				console.error('[App] Failed to setup mocks, bootstrapping anyway:', err);
				bootstrap();
			});
	} else {
		if (import.meta.env.DEV) {
			console.log('[App] Running without MSW mocks - using real staging-api endpoints');
		}
		bootstrap();
	}
}


export async function prerender() {
	await initI18n();
	return await ssr(<AppWithProviders />);
}
