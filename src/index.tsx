import { hydrate, prerender as ssr, Router, Route, useLocation, LocationProvider } from 'preact-iso';
import { useCallback, useEffect, useMemo, useRef } from 'preact/hooks';
import { Suspense } from 'preact/compat';
import { I18nextProvider } from 'react-i18next';
import AuthPage from '@/pages/AuthPage';
import AcceptInvitationPage from '@/pages/AcceptInvitationPage';
import AwaitingInvitePage from '@/pages/AwaitingInvitePage';
import OnboardingPage from '@/pages/OnboardingPage';
import PricingPage from '@/pages/PricingPage';
import DebugStylesPage from '@/pages/DebugStylesPage';
import DebugMatterPage from '@/pages/DebugMatterPage';
import { SEOHead } from '@/app/SEOHead';
import { ToastProvider } from '@/shared/contexts/ToastContext';
import { SessionProvider, useSessionContext } from '@/shared/contexts/SessionContext';
import { getClient } from '@/shared/lib/authClient';
import { MainApp } from '@/app/MainApp';
import { SettingsPage } from '@/features/settings/pages/SettingsPage';
import { useNavigation } from '@/shared/utils/navigation';
import { usePracticeConfig } from '@/shared/hooks/usePracticeConfig';
import { useMobileDetection } from '@/shared/hooks/useMobileDetection';
import { handleError } from '@/shared/utils/errorHandler';
import { useWorkspaceResolver } from '@/shared/hooks/useWorkspaceResolver';
import {
  buildSettingsPath,
  getSettingsReturnPath,
  getWorkspaceHomePath,
  setSettingsReturnPath
} from '@/shared/utils/workspace';
import { PaySuccessPage } from '@/pages/PaySuccessPage';
import { AppGuard } from '@/app/AppGuard';
import { App404 } from '@/features/practice/components/404';
import { normalizePracticeRole } from '@/shared/utils/practiceRoles';
import './index.css';
import { i18n, initI18n } from '@/shared/i18n';
import { initializeAccentColor } from '@/shared/utils/accentColors';

const LoadingScreen = () => (
  <div className="flex h-screen items-center justify-center text-sm text-gray-500 dark:text-gray-400">
    Loading…
  </div>
);

// Client routes align with public structure

// Main App component with routing
export function App() {
  return (
    <LocationProvider>
      <SessionProvider>
        <AppGuard>
          <AppShell />
        </AppGuard>
      </SessionProvider>
    </LocationProvider>
  );
}

function AppShell() {
  const location = useLocation();
  const { navigate } = useNavigation();
  const { session, isPending: sessionPending } = useSessionContext();
  const { defaultWorkspace, currentPractice, practices } = useWorkspaceResolver();

  const handleRouteChange = useCallback((url: string) => {
    if (typeof window === 'undefined') return;

    if (!url.includes('/settings')) {
      setSettingsReturnPath(url);
    }
  }, []);

  useEffect(() => {
    if (sessionPending) return;
    if (typeof window !== 'undefined') {
      try {
        const pendingPath = window.sessionStorage.getItem('intakeAwaitingInvitePath');
        if (pendingPath) {
          window.sessionStorage.removeItem('intakeAwaitingInvitePath');
          if (pendingPath.startsWith('/') && !pendingPath.startsWith('//')) {
            if (!location.path.startsWith('/auth/awaiting-invite')) {
              navigate(pendingPath, true);
            }
            return;
          }
        }
      } catch (error) {
        try {
          window.sessionStorage.removeItem('intakeAwaitingInvitePath');
        } catch (_innerError) {
          // Ignore secondary failure
        }
        if (import.meta.env.DEV) {
          console.warn('[Workspace] Failed to read intake awaiting path', error);
        }
      }
    }
    const user = session?.user;
    const requiresOnboarding =
      Boolean(user) && !user?.isAnonymous && user?.onboardingComplete !== true;

    if (requiresOnboarding) {
      if (!location.path.startsWith('/onboarding') && !location.path.startsWith('/auth')) {
        const targetUrl = location.url.startsWith('/')
          ? location.url
          : `/${location.url.replace(/^\/+/, '')}`;
        const encodedReturnTo = encodeURIComponent(targetUrl);
        const onboardingUrl = encodedReturnTo
          ? `/onboarding?returnTo=${encodedReturnTo}`
          : '/onboarding';
        navigate(onboardingUrl, true);
      }
      return;
    }

    if (!requiresOnboarding && location.path.startsWith('/onboarding')) {
      const fallbackSlug = currentPractice?.slug ?? practices[0]?.slug ?? null;
      const fallback = getWorkspaceHomePath(defaultWorkspace, fallbackSlug, '/');
      navigate(fallback, true);
    }
  }, [currentPractice, defaultWorkspace, location.path, location.url, navigate, practices, session?.user, sessionPending]);

  return (
    <ToastProvider>
      <Suspense fallback={<LoadingScreen />}>
        <Router onRouteChange={handleRouteChange}>
          <Route path="/auth" component={AuthPage} />
          <Route path="/auth/accept-invitation" component={AcceptInvitationPage} />
          <Route path="/auth/awaiting-invite" component={AwaitingInvitePage} />
          <Route path="/pricing" component={PricingPage} />
          <Route path="/onboarding" component={OnboardingPage} />
          <Route path="/debug/styles" component={import.meta.env.DEV ? DebugStylesPage : App404} />
          <Route path="/debug/matters" component={import.meta.env.DEV ? DebugMatterPage : App404} />
          <Route path="/pay" component={PaySuccessPage} />
          <Route path="/settings" component={LegacySettingsRoute} />
          <Route path="/settings/*" component={LegacySettingsRoute} />
          <Route path="/public/:practiceSlug" component={PublicPracticeRoute} workspaceView="home" />
          <Route path="/public/:practiceSlug/conversations" component={PublicPracticeRoute} workspaceView="list" />
          <Route path="/public/:practiceSlug/conversations/:conversationId" component={PublicPracticeRoute} workspaceView="conversation" />
          <Route path="/public/:practiceSlug/matters" component={PublicPracticeRoute} workspaceView="matters" />
          <Route path="/client" component={App404} />
          <Route path="/client/:practiceSlug" component={ClientPracticeRoute} workspaceView="home" />
          <Route path="/client/:practiceSlug/conversations" component={ClientPracticeRoute} workspaceView="list" />
          <Route path="/client/:practiceSlug/conversations/:conversationId" component={ClientPracticeRoute} workspaceView="conversation" />
          <Route path="/client/:practiceSlug/matters" component={ClientPracticeRoute} workspaceView="matters" />
          <Route path="/client/:practiceSlug/settings" component={WorkspaceSettingsRoute} workspace="client" />
          <Route path="/client/:practiceSlug/settings/*" component={WorkspaceSettingsRoute} workspace="client" />
          <Route path="/practice" component={App404} />
          <Route path="/practice/:practiceSlug" component={PracticeAppRoute} workspaceView="home" />
          <Route path="/practice/:practiceSlug/conversations" component={PracticeAppRoute} workspaceView="list" />
          <Route path="/practice/:practiceSlug/conversations/:conversationId" component={PracticeAppRoute} workspaceView="conversation" />
          <Route path="/practice/:practiceSlug/clients" component={PracticeAppRoute} workspaceView="clients" />
          <Route path="/practice/:practiceSlug/clients/*" component={PracticeAppRoute} workspaceView="clients" />
          <Route path="/practice/:practiceSlug/matters" component={PracticeAppRoute} workspaceView="matters" />
          <Route path="/practice/:practiceSlug/matters/*" component={PracticeAppRoute} workspaceView="matters" />
          <Route path="/practice/:practiceSlug/settings" component={WorkspaceSettingsRoute} workspace="practice" />
          <Route path="/practice/:practiceSlug/settings/*" component={WorkspaceSettingsRoute} workspace="practice" />
          <Route path="/" component={RootRoute} />
          <Route default component={App404} />
        </Router>
      </Suspense>
    </ToastProvider>
  );
}

function LegacySettingsRoute() {
  const location = useLocation();
  const { defaultWorkspace, currentPractice, practices, practicesLoading } = useWorkspaceResolver();
  const { navigate } = useNavigation();
  const resolvedPractice = currentPractice ?? practices[0] ?? null;
  const resolvedSlug = resolvedPractice?.slug ?? null;
  const legacySubPath = location.path.replace(/^\/settings\/?/, '');

  useEffect(() => {
    if (practicesLoading || !resolvedSlug || !resolvedPractice) return;
    const workspacePrefix = defaultWorkspace === 'practice' ? 'practice' : 'client';
    const settingsBase = `/${workspacePrefix}/${encodeURIComponent(resolvedSlug)}/settings`;
    navigate(buildSettingsPath(settingsBase, legacySubPath || undefined), true);
  }, [defaultWorkspace, legacySubPath, navigate, practicesLoading, resolvedPractice, resolvedSlug]);

  if (!practicesLoading && (!resolvedSlug || !resolvedPractice)) return <App404 />;

  return <LoadingScreen />;
}

function WorkspaceSettingsRoute({
  practiceSlug,
  workspace
}: {
  practiceSlug?: string;
  workspace?: 'client' | 'practice';
}) {
  const { session, isPending: sessionIsPending } = useSessionContext();
  const {
    practicesLoading,
    resolvePracticeBySlug
  } = useWorkspaceResolver();
  const { navigate } = useNavigation();
  const isMobile = useMobileDetection();

  const slug = (practiceSlug ?? '').trim();
  const workspaceKey = workspace === 'client' || workspace === 'practice' ? workspace : null;

  const resolvedPractice = resolvePracticeBySlug(slug);
  const canAccessRouteWorkspace = Boolean(resolvedPractice);

  const handleCloseSettings = useCallback(() => {
    const returnPath = getSettingsReturnPath();
    const fallback = workspaceKey ? getWorkspaceHomePath(workspaceKey, slug, '/') : '/';
    navigate(returnPath ?? fallback, true);
  }, [navigate, slug, workspaceKey]);

  if (!slug || !workspaceKey) {
    return <App404 />;
  }

  if (sessionIsPending || practicesLoading) {
    return <LoadingScreen />;
  }

  if (!session?.user) {
    return <AuthPage />;
  }

  if (!canAccessRouteWorkspace) {
    return <App404 />;
  }

  return (
    <SettingsPage
      isMobile={isMobile}
      onClose={handleCloseSettings}
      className="h-full"
    />
  );
}

function RootRoute() {
  const { session, isPending } = useSessionContext();
  const {
    defaultWorkspace,
    hasPracticeAccess: canAccessPractice,
    practicesLoading,
    currentPractice,
    practices
  } = useWorkspaceResolver();
  const { navigate } = useNavigation();
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (isPending || practicesLoading) return;

    if (!session?.user) {
      navigate('/auth', true);
      return;
    }

    if (session.user.onboardingComplete !== true && !session.user.isAnonymous) {
      return;
    }

    const hasPractice = Boolean(currentPractice?.id || practices.length > 0);
    if (!canAccessPractice && !hasPractice) {
      navigate('/pricing?returnTo=/', true);
      return;
    }

    if (isMountedRef.current) {
      const fallbackSlug = currentPractice?.slug ?? practices[0]?.slug ?? null;
      const destination = getWorkspaceHomePath(defaultWorkspace, fallbackSlug, '/');
      navigate(destination, true);
    }
  }, [
    canAccessPractice,
    defaultWorkspace,
    practicesLoading,
    isPending,
    navigate,
    session?.user,
    currentPractice,
    practices
  ]);

  return <LoadingScreen />;
}


function PracticeAppRoute({
  conversationId,
  workspaceView = 'home',
  practiceSlug
}: {
  conversationId?: string;
  workspaceView?: 'home' | 'list' | 'conversation' | 'matters' | 'clients';
  practiceSlug?: string;
}) {
  const { session, isPending } = useSessionContext();
  const {
    hasPracticeAccess: canAccessPractice,
    practicesLoading,
    currentPractice,
    practices,
    resolvePracticeBySlug
  } = useWorkspaceResolver();
  const { navigate } = useNavigation();
  const normalizedPracticeSlug = (practiceSlug ?? '').trim();
  const hasPracticeSlug = normalizedPracticeSlug.length > 0;
  const slugPractice = hasPracticeSlug ? resolvePracticeBySlug(normalizedPracticeSlug) : null;
  const fallbackPracticeId = currentPractice?.id
    ?? practices[0]?.id
    ?? '';
  const practiceIdCandidate = hasPracticeSlug
    ? (slugPractice?.id ?? '')
    : fallbackPracticeId;
  const practiceRefreshKey = useMemo(() => {
    if (!currentPractice) return null;
    return [
      currentPractice.updatedAt,
      currentPractice.slug,
      currentPractice.logo,
      currentPractice.name
    ]
      .filter(Boolean)
      .join('|');
  }, [currentPractice]);

  const handlePracticeError = useCallback((error: string) => {
    console.error('Practice config error:', error);
  }, []);

  const shouldDelayPracticeConfig = practicesLoading;

  const {
    practiceConfig,
    practiceNotFound,
    isLoading: _isLoading
  } = usePracticeConfig({
    onError: handlePracticeError,
    practiceId: shouldDelayPracticeConfig ? '' : practiceIdCandidate,
    allowUnauthenticated: false,
    refreshKey: practiceRefreshKey
  });

  const resolvedPracticeIdFromConfig = typeof practiceConfig.id === 'string' ? practiceConfig.id : '';
  const resolvedPracticeId = resolvedPracticeIdFromConfig || practiceIdCandidate;

  useEffect(() => {
    if (isPending || practicesLoading) return;
    if (!session?.user) return;
    if (canAccessPractice) return;

    if (normalizedPracticeSlug) {
      navigate(`/client/${encodeURIComponent(normalizedPracticeSlug)}`, true);
      return;
    }

    const fallbackSlug = currentPractice?.slug ?? practices[0]?.slug ?? null;
    if (fallbackSlug) {
      navigate(`/client/${encodeURIComponent(fallbackSlug)}`, true);
      return;
    }

    navigate('/pricing?returnTo=/', true);
  }, [
    canAccessPractice,
    currentPractice?.slug,
    isPending,
    practicesLoading,
    navigate,
    normalizedPracticeSlug,
    practices,
    session?.user
  ]);

  if (isPending || practicesLoading || shouldDelayPracticeConfig) {
    return <LoadingScreen />;
  }

  if (!hasPracticeSlug) {
    return <App404 />;
  }

  if (!session?.user) {
    return <AuthPage />;
  }

  if (!canAccessPractice) {
    return <LoadingScreen />;
  }

  if (hasPracticeSlug && !slugPractice && !practicesLoading) {
    return (
      <App404 />
    );
  }

  if (!resolvedPracticeId) {
    if (practiceNotFound) {
      return (
        <App404 />
      );
    }
    return <LoadingScreen />;
  }

  return (
      <MainApp
        practiceId={resolvedPracticeId}
        practiceConfig={practiceConfig}
        isPracticeView={true}
        workspace="practice"
        routeConversationId={conversationId}
        practiceWorkspaceView={workspaceView}
        practiceSlug={normalizedPracticeSlug || undefined}
      />
  );
}

function ClientPracticeRoute({
  practiceSlug,
  conversationId,
  workspaceView = 'home'
}: {
  practiceSlug?: string;
  conversationId?: string;
  workspaceView?: 'home' | 'list' | 'conversation' | 'matters';
}) {
  const location = useLocation();
  const { session, isPending: sessionIsPending, activeMemberRole } = useSessionContext();
  const {
    practicesLoading,
    resolvePracticeBySlug
  } = useWorkspaceResolver();
  const { navigate } = useNavigation();
  const handlePracticeError = useCallback((error: string) => {
    console.error('Practice config error:', error);
  }, []);

  const slug = (practiceSlug ?? '').trim();
  const slugPractice = resolvePracticeBySlug(slug);
  const practiceIdCandidate = slugPractice?.id ?? slug ?? '';

  const {
    practiceConfig,
    practiceNotFound,
    isLoading
  } = usePracticeConfig({
    onError: handlePracticeError,
    practiceId: practicesLoading ? '' : practiceIdCandidate,
    allowUnauthenticated: false
  });
  const resolvedPracticeId = useMemo(
    () => (typeof practiceConfig.id === 'string' ? practiceConfig.id : '') || slugPractice?.id || '',
    [practiceConfig.id, slugPractice?.id]
  );

  const normalizedRole = normalizePracticeRole(activeMemberRole);
  const isAuthenticatedClient = Boolean(session?.user && !session.user.isAnonymous && normalizedRole === 'client');

  useEffect(() => {
    if (!slug || sessionIsPending) return;
    if (isAuthenticatedClient && workspaceView === 'home') {
      navigate(`/client/${encodeURIComponent(slug)}/conversations`, true);
    } else if (!isAuthenticatedClient && workspaceView === 'matters') {
      navigate(`/client/${encodeURIComponent(slug)}`, true);
    }
  }, [isAuthenticatedClient, workspaceView, slug, navigate, sessionIsPending, session]);

  if (isLoading || sessionIsPending || practicesLoading) {
    return <LoadingScreen />;
  }

  if (!slug) {
    return <App404 />;
  }

  if (!session?.user) {
    return <AuthPage />;
  }

  if (!slugPractice) {
    return <App404 />;
  }

  if (practiceNotFound) {
    return <App404 />;
  }

  if (!resolvedPracticeId) {
    return <LoadingScreen />;
  }

  const currentUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${location.url}`
    : undefined;

  return (
    <>
      <SEOHead
        practiceConfig={practiceConfig}
        currentUrl={currentUrl}
      />
      <MainApp
        practiceId={resolvedPracticeId}
        practiceConfig={practiceConfig}
        isPracticeView={true}
        workspace="client"
        clientPracticeSlug={slug || undefined}
        routeConversationId={conversationId}
        clientWorkspaceView={workspaceView}
      />
    </>
  );
}

function PublicPracticeRoute({
  practiceSlug,
  conversationId,
  workspaceView = 'home'
}: {
  practiceSlug?: string;
  conversationId?: string;
  workspaceView?: 'home' | 'list' | 'conversation' | 'matters';
}) {
  const location = useLocation();
  const { session, isPending: sessionIsPending, activeMemberRole } = useSessionContext();
  const {
    practicesLoading,
    resolvePracticeBySlug
  } = useWorkspaceResolver();
  const { navigate } = useNavigation();
  const handlePracticeError = useCallback((error: string) => {
    console.error('Practice config error:', error);
  }, []);

  const slug = (practiceSlug ?? '').trim();
  const slugPractice = resolvePracticeBySlug(slug);

  const {
    practiceConfig,
    practiceNotFound,
    isLoading
  } = usePracticeConfig({
    onError: handlePracticeError,
    practiceId: slug,
    allowUnauthenticated: true
  });
  const resolvedPracticeId = useMemo(
    () => (typeof practiceConfig.id === 'string' ? practiceConfig.id : '') || slugPractice?.id || '',
    [practiceConfig.id, slugPractice?.id]
  );

  // Handle anonymous sign-in for widget users (clients chatting with practices)
  // This runs immediately on mount, without waiting for practice details to load
  useEffect(() => {
    if (typeof window === 'undefined' || sessionIsPending) return;

    // Only attempt if no session exists
    if (!session?.user) {
      const key = 'anonymous_signin_attempted';
      const attemptStatus = sessionStorage.getItem(key);

      // Only attempt once per browser session, or retry if previous attempt failed
      if (!attemptStatus || attemptStatus === 'failed') {
        sessionStorage.setItem(key, 'pending');
        console.log('[Auth] Attempting anonymous sign-in');
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

            if (typeof anonymousSignIn !== 'function') {
              console.error('[Auth] Anonymous sign-in method not available', {
                signInKeys: signIn ? Object.keys(signIn) : null,
                message: 'Better Auth anonymous plugin may not be configured correctly.'
              });
              handleError('Anonymous sign-in method not available', {
                signInKeys: signIn ? Object.keys(signIn) : null,
              }, { component: 'Auth', action: 'anonymous-sign-in', silent: import.meta.env.DEV });
              sessionStorage.setItem(key, 'failed');
              return;
            }

            console.log('[Auth] Calling anonymous sign-in...');
            const result = await anonymousSignIn();

            if (result?.error) {
              console.error('[Auth] Anonymous sign-in failed', {
                error: result.error,
                message: 'The server needs to have the Better Auth anonymous plugin enabled. Check server logs for details.'
              });
              handleError(result.error, {}, { component: 'Auth', action: 'anonymous-sign-in', silent: import.meta.env.DEV });
              sessionStorage.setItem(key, 'failed');
            } else {
              sessionStorage.setItem(key, 'success');
              console.log('[Auth] Anonymous sign-in successful for widget user', {
                hasData: !!result?.data
              });
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('[Auth] Anonymous sign-in exception', {
              error: errorMessage,
              stack: error instanceof Error ? error.stack : undefined,
              message: 'CRITICAL: Better Auth anonymous plugin must be configured on the API server. ' +
                       'Check server logs and ensure anonymous() plugin is added to Better Auth config.'
            });
            handleError(error, {}, { component: 'Auth', action: 'anonymous-sign-in', silent: import.meta.env.DEV });
            sessionStorage.setItem(key, 'failed');
          }
        })();
      } else {
        console.log('[Auth] Anonymous sign-in already attempted, skipping', {
          status: sessionStorage.getItem(key)
        });
      }
    }
  }, [session?.user, sessionIsPending]);

  const normalizedRole = normalizePracticeRole(activeMemberRole);
  const isAuthenticatedClient = Boolean(session?.user && !session.user.isAnonymous && normalizedRole === 'client');

  useEffect(() => {
    if (!slug || sessionIsPending) return;
    if (isAuthenticatedClient && workspaceView === 'home') {
      navigate(`/public/${encodeURIComponent(slug)}/conversations`, true);
    } else if (!isAuthenticatedClient && workspaceView === 'matters') {
      navigate(`/public/${encodeURIComponent(slug)}`, true);
    }
  }, [isAuthenticatedClient, workspaceView, slug, navigate, sessionIsPending, session]);

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!slug) {
    return <App404 />;
  }

  if (practiceNotFound) {
    return <App404 />;
  }

  if (!resolvedPracticeId) {
    return <LoadingScreen />;
  }

  if (sessionIsPending) {
    return <LoadingScreen />;
  }

  if (!sessionIsPending && session?.user && !session.user.isAnonymous && practicesLoading && !resolvedPracticeId) {
    return <LoadingScreen />;
  }

  if (isAuthenticatedClient && workspaceView === 'home' && slug) {
    return <LoadingScreen />;
  }
  if (!isAuthenticatedClient && workspaceView === 'matters' && slug) {
    return <LoadingScreen />;
  }

  const currentUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${location.url}`
    : undefined;

  return (
    <>
      <SEOHead
        practiceConfig={practiceConfig}
        currentUrl={currentUrl}
      />
      <MainApp
        practiceId={resolvedPracticeId}
        practiceConfig={practiceConfig}
        isPracticeView={true}
        workspace="public"
        publicPracticeSlug={slug || undefined}
        routeConversationId={conversationId}
        publicWorkspaceView={workspaceView}
      />
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
  const savedTheme = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const shouldBeDark = savedTheme === 'dark' || (!savedTheme && prefersDark);

  if (shouldBeDark) {
    document.documentElement.classList.add('dark');
  }

  // Initialize default accent color before workspace/practice details load.
  initializeAccentColor();

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
  mountClientApp();
}

export async function prerender() {
  await initI18n();
  return await ssr(<AppWithProviders />);
}
