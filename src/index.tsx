import { hydrate, prerender as ssr, Router, Route, useLocation, LocationProvider } from 'preact-iso';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Suspense } from 'preact/compat';
import { I18nextProvider } from 'react-i18next';
import AuthPage from '@/pages/AuthPage';
import OnboardingPage from '@/pages/OnboardingPage';
import { SEOHead } from '@/app/SEOHead';
import { ToastProvider } from '@/shared/contexts/ToastContext';
import { SessionProvider, useSessionContext } from '@/shared/contexts/SessionContext';
import { getClient, updateUser } from '@/shared/lib/authClient';
import { MainApp } from '@/app/MainApp';
import { SettingsLayout } from '@/features/settings/components/SettingsLayout';
import { useNavigation } from '@/shared/utils/navigation';
import { CartPage } from '@/features/cart/pages/CartPage';
import { usePracticeConfig, type UIPracticeConfig } from '@/shared/hooks/usePracticeConfig';
import { useMobileDetection } from '@/shared/hooks/useMobileDetection';
import { handleError } from '@/shared/utils/errorHandler';
import { useWorkspace } from '@/shared/hooks/useWorkspace';
import { getSettingsReturnPath, getWorkspaceDashboardPath, resolveWorkspaceFromPath, setSettingsReturnPath } from '@/shared/utils/workspace';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { IntakePaymentPage } from '@/features/intake/pages/IntakePaymentPage';
import { linkConversationToUser } from '@/shared/lib/apiClient';
import { AppGuard } from '@/app/AppGuard';
import { PracticeNotFound } from '@/features/practice/components/PracticeNotFound';
import { normalizePracticeRole } from '@/shared/utils/practiceRoles';
import './index.css';
import { i18n, initI18n } from '@/shared/i18n';

const LoadingScreen = () => (
  <div className="flex h-screen items-center justify-center text-sm text-gray-500 dark:text-gray-400">
    Loading…
  </div>
);

const CLIENT_WORKSPACE_CONFIG: UIPracticeConfig = {
  name: 'Client Workspace',
  description: 'Your personal workspace for managing conversations.',
  availableServices: [],
  serviceQuestions: {},
  domain: '',
  brandColor: '#111827',
  accentColor: '#2563eb',
  introMessage: '',
  profileImage: null,
  voice: {
    enabled: false,
    provider: 'cloudflare'
  }
};

type LocationValue = ReturnType<typeof useLocation> & { wasPush?: boolean };
type PracticeRouteKey = 'home' | 'payments' | 'payouts' | 'pricing' | 'clients' | 'leads' | 'matters' | 'conversations';
type ClientRouteKey = 'conversations' | 'payments' | 'matters';

const resolvePracticeRouteKeyFromPath = (path: string): PracticeRouteKey => {
  if (path.startsWith('/practice/payments')) return 'payments';
  if (path.startsWith('/practice/payouts')) return 'payouts';
  if (path.startsWith('/practice/pricing')) return 'pricing';
  if (path.startsWith('/practice/clients')) return 'clients';
  if (path.startsWith('/practice/leads')) return 'leads';
  if (path.startsWith('/practice/matters')) return 'matters';
  if (path.startsWith('/practice/conversations')) return 'conversations';
  return 'home';
};

const resolveClientRouteKeyFromPath = (path: string): ClientRouteKey => {
  if (path.startsWith('/client/payments')) return 'payments';
  if (path.startsWith('/client/matters')) return 'matters';
  return 'conversations';
};

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
  const isSettingsOpen = location.path.startsWith('/settings');
  const isMobileHoisted = useMobileDetection();
  const { session, isPending: sessionPending, activeOrganizationId } = useSessionContext();
  const { defaultWorkspace, canAccessPractice, isPracticeLoading } = useWorkspace();
  const lastWorkspaceRef = useRef<'client' | 'practice' | null>(null);
  const lastActivePracticeRef = useRef<string | null>(null);
  const lastNonSettingsUrlRef = useRef<string | null>(null);
  const routeTransitionRef = useRef(0);

  if (session?.user?.primaryWorkspace && lastWorkspaceRef.current !== session.user.primaryWorkspace) {
    lastWorkspaceRef.current = session.user.primaryWorkspace;
  }

  if (!isSettingsOpen && location.url !== lastNonSettingsUrlRef.current) {
    lastNonSettingsUrlRef.current = location.url;
  }

  const handleRouteChange = useCallback((url: string) => {
    if (typeof window === 'undefined') return;

    if (!url.startsWith('/settings')) {
      setSettingsReturnPath(url);
    }

    if (sessionPending || !session?.user) return;
    const path = url.split('?')[0].split('#')[0];
    const workspaceFromPath = resolveWorkspaceFromPath(path);
    if (workspaceFromPath !== 'client' && workspaceFromPath !== 'practice') return;
    if (workspaceFromPath === 'practice' && (isPracticeLoading || !canAccessPractice)) {
      return;
    }
    if (session.user.primaryWorkspace === workspaceFromPath || lastWorkspaceRef.current === workspaceFromPath) {
      return;
    }

    const transitionId = routeTransitionRef.current + 1;
    routeTransitionRef.current = transitionId;
    const previousWorkspace = lastWorkspaceRef.current;
    lastWorkspaceRef.current = workspaceFromPath;
    updateUser({ primaryWorkspace: workspaceFromPath }).catch((error) => {
      if (routeTransitionRef.current !== transitionId) {
        return;
      }
      console.warn('[Workspace] Failed to persist workspace preference', error);
      lastWorkspaceRef.current = previousWorkspace;
    });

    if (workspaceFromPath === 'practice') {
      const practiceIdCandidate = activeOrganizationId ?? null;

      if (practiceIdCandidate && lastActivePracticeRef.current !== practiceIdCandidate) {
        const previousActivePractice = lastActivePracticeRef.current;
        lastActivePracticeRef.current = practiceIdCandidate;
        const client = getClient();
        client.organization.setActive({ organizationId: practiceIdCandidate }).catch((error) => {
          if (routeTransitionRef.current !== transitionId) {
            return;
          }
          console.warn('[Workspace] Failed to set active organization', error);
          lastActivePracticeRef.current = previousActivePractice;
        });
      }
    }
  }, [activeOrganizationId, canAccessPractice, isPracticeLoading, session?.user, sessionPending]);

  const handleCloseSettings = useCallback(() => {
    const returnPath = getSettingsReturnPath();
    const fallback = getWorkspaceDashboardPath(defaultWorkspace) ?? '/client/conversations';
    navigate(returnPath ?? fallback, true);
  }, [defaultWorkspace, navigate]);

  const fallbackSettingsBackground = getWorkspaceDashboardPath(defaultWorkspace) ?? '/client/conversations';
  const backgroundUrl = isSettingsOpen
    ? (lastNonSettingsUrlRef.current ?? fallbackSettingsBackground)
    : location.url;
  const wasPush = (location as LocationValue).wasPush;

  const routerLocation = useMemo<LocationValue>(() => {
    const parsed = new URL(backgroundUrl, 'http://localhost');
    return {
      url: backgroundUrl,
      path: parsed.pathname.replace(/\/+$/g, '') || '/',
      query: Object.fromEntries(parsed.searchParams),
      route: location.route,
      wasPush
    };
  }, [backgroundUrl, location.route, wasPush]);

  useEffect(() => {
    if (sessionPending) return;
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
      const fallback = getWorkspaceDashboardPath(defaultWorkspace) ?? '/client/conversations';
      navigate(fallback, true);
    }
  }, [defaultWorkspace, location.path, location.url, navigate, session?.user, sessionPending]);

  return (
    <ToastProvider>
      <LocationProvider.ctx.Provider value={routerLocation}>
        <Router onRouteChange={handleRouteChange}>
          <Route path="/auth" component={AuthPage} />
          <Route path="/cart" component={CartPage} />
          <Route path="/onboarding" component={OnboardingPage} />
          <Route path="/intake/pay" component={IntakePaymentPage} />
          <Route path="/settings" component={SettingsRoute} />
          <Route path="/settings/*" component={SettingsRoute} />
          <Route path="/embed/:practiceSlug" component={PublicPracticeRoute} embedView="home" />
          <Route path="/embed/:practiceSlug/conversations" component={PublicPracticeRoute} embedView="list" />
          <Route path="/embed/:practiceSlug/conversations/:conversationId" component={PublicPracticeRoute} embedView="conversation" />
          <Route path="/embed/:practiceSlug/matters" component={PublicPracticeRoute} embedView="matters" />
          <Route path="/embed/:practiceSlug/profile" component={PublicPracticeRoute} embedView="profile" />
          <Route path="/practice" component={PracticeBaseRoute} />
          <Route path="/practice/home" component={PracticeAppRoute} settingsOverlayOpen={isSettingsOpen} activeRoute="home" />
          <Route path="/practice/conversations" component={PracticeAppRoute} settingsOverlayOpen={isSettingsOpen} activeRoute="conversations" />
          <Route path="/practice/conversations/:conversationId" component={PracticeAppRoute} settingsOverlayOpen={isSettingsOpen} activeRoute="conversations" />
          <Route path="/practice/payments" component={PracticeAppRoute} settingsOverlayOpen={isSettingsOpen} activeRoute="payments" />
          <Route path="/practice/payments/*" component={PracticeAppRoute} settingsOverlayOpen={isSettingsOpen} activeRoute="payments" />
          <Route path="/practice/payouts" component={PracticeAppRoute} settingsOverlayOpen={isSettingsOpen} activeRoute="payouts" />
          <Route path="/practice/payouts/*" component={PracticeAppRoute} settingsOverlayOpen={isSettingsOpen} activeRoute="payouts" />
          <Route path="/practice/pricing" component={PracticeAppRoute} settingsOverlayOpen={isSettingsOpen} activeRoute="pricing" />
          <Route path="/practice/pricing/*" component={PracticeAppRoute} settingsOverlayOpen={isSettingsOpen} activeRoute="pricing" />
          <Route path="/practice/clients" component={PracticeAppRoute} settingsOverlayOpen={isSettingsOpen} activeRoute="clients" />
          <Route path="/practice/clients/*" component={PracticeAppRoute} settingsOverlayOpen={isSettingsOpen} activeRoute="clients" />
          <Route path="/practice/leads" component={PracticeAppRoute} settingsOverlayOpen={isSettingsOpen} activeRoute="leads" />
          <Route path="/practice/leads/*" component={PracticeAppRoute} settingsOverlayOpen={isSettingsOpen} activeRoute="leads" />
          <Route path="/practice/matters" component={PracticeAppRoute} settingsOverlayOpen={isSettingsOpen} activeRoute="matters" />
          <Route path="/practice/matters/*" component={PracticeAppRoute} settingsOverlayOpen={isSettingsOpen} activeRoute="matters" />
          <Route default component={RootRoute} />
        </Router>
      </LocationProvider.ctx.Provider>

      {isSettingsOpen && (
        <SettingsLayout
          key="settings-modal-hoisted"
          isMobile={isMobileHoisted}
          onClose={handleCloseSettings}
          className="h-full"
        />
      )}
    </ToastProvider>
  );
}

function SettingsRoute() {
  const location = useLocation();
  const { defaultWorkspace, canAccessPractice, preferredWorkspace } = useWorkspace();
  const resolved = preferredWorkspace ?? defaultWorkspace;

  if (resolved === 'practice' && canAccessPractice) {
    return (
      <PracticeAppRoute
        settingsMode={true}
        settingsOverlayOpen={true}
        activeRoute={resolvePracticeRouteKeyFromPath(location.path)}
      />
    );
  }

  return (
    <ClientAppRoute
      settingsMode={true}
      settingsOverlayOpen={true}
      activeRoute={resolveClientRouteKeyFromPath(location.path)}
    />
  );
}

function PracticeBaseRoute() {
  const { navigate } = useNavigation();
  useEffect(() => {
    navigate('/practice/home', true);
  }, [navigate]);
  return <LoadingScreen />;
}


function RootRoute() {
  const { session, isPending, activeOrganizationId } = useSessionContext();
  const {
    defaultWorkspace,
    canAccessPractice,
    isPracticeLoading
  } = useWorkspace();
  const { navigate } = useNavigation();
  const workspaceInitRef = useRef(false);
  const practiceResetRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (isPending || isPracticeLoading) return;

    if (!session?.user) {
      navigate('/auth', true);
      return;
    }

    if (
      !session.user.primaryWorkspace &&
      !workspaceInitRef.current
    ) {
      workspaceInitRef.current = true;
      const nextPreferredPracticeId = defaultWorkspace === 'practice'
        ? (activeOrganizationId ?? null)
        : null;
      updateUser({
        primaryWorkspace: defaultWorkspace,
        preferredPracticeId: nextPreferredPracticeId
      }).catch((error) => {
        console.warn('[Workspace] Failed to persist default workspace', error);
        workspaceInitRef.current = false;
      });
    }

    if (
      !canAccessPractice &&
      session.user.primaryWorkspace === 'practice' &&
      !practiceResetRef.current
    ) {
      practiceResetRef.current = true;
      updateUser({ primaryWorkspace: 'client', preferredPracticeId: null }).catch((error) => {
        console.warn('[Workspace] Failed to reset workspace to client', error);
        practiceResetRef.current = false;
      });
    }

    if (isMountedRef.current) {
      const destination = getWorkspaceDashboardPath(defaultWorkspace) ?? '/client/conversations';
      navigate(destination, true);
    }
  }, [
    canAccessPractice,
    defaultWorkspace,
    isPracticeLoading,
    isPending,
    navigate,
    activeOrganizationId,
    session?.user
  ]);

  return <LoadingScreen />;
}

function ClientAppRoute({
  settingsMode = false,
  settingsOverlayOpen = false,
  activeRoute = 'conversations',
  conversationId
}: {
  settingsMode?: boolean;
  settingsOverlayOpen?: boolean;
  activeRoute?: ClientRouteKey;
  conversationId?: string;
}) {
  const { session, isPending } = useSessionContext();
  const { navigate } = useNavigation();
  const linkingHandledRef = useRef(false);

  useEffect(() => {
    if (settingsMode || isPending) return;
    if (!session?.user) {
      navigate('/auth', true);
      return;
    }
  }, [isPending, navigate, session?.user, settingsMode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isPending || !session?.user) return;
    if (linkingHandledRef.current) return;

    const url = new URL(window.location.href);
    const conversationId = url.searchParams.get('conversationId');
    const practiceId = url.searchParams.get('practiceId');
    if (!conversationId || !practiceId) {
      return;
    }

    linkingHandledRef.current = true;

    (async () => {
      try {
        await linkConversationToUser(conversationId, practiceId);
      } catch (error) {
        console.error('[Client] Failed to link conversation after auth redirect', error);
      } finally {
        url.searchParams.delete('conversationId');
        url.searchParams.delete('practiceId');
        const cleaned = `${url.pathname}${url.search}${url.hash}`;
        window.history.replaceState({}, '', cleaned);
      }
    })();
  }, [isPending, session?.user]);

  if (isPending) {
    return <LoadingScreen />;
  }

  if (!session?.user) {
    return <AuthPage />;
  }

  return (
    <MainApp
      practiceId=""
      practiceConfig={CLIENT_WORKSPACE_CONFIG}
      practiceNotFound={false}
      handleRetryPracticeConfig={() => {}}
      isPracticeView={false}
      workspace="client"
      settingsOverlayOpen={settingsOverlayOpen}
      activeRoute={activeRoute}
      routeConversationId={conversationId}
    />
  );
}

function PracticeAppRoute({
  settingsMode = false,
  settingsOverlayOpen = false,
  activeRoute = 'home',
  conversationId
}: {
  settingsMode?: boolean;
  settingsOverlayOpen?: boolean;
  activeRoute?: PracticeRouteKey;
  conversationId?: string;
}) {
  const { session, isPending, activeOrganizationId } = useSessionContext();
  const { navigate } = useNavigation();
  const { isPracticeEnabled, canAccessPractice } = useWorkspace();
  const { currentPractice, practices, loading: practicesLoading } = usePracticeManagement();
  const [autoActivationState, setAutoActivationState] = useState<'idle' | 'pending' | 'done' | 'failed'>('idle');
  const autoActivationKeyRef = useRef<string | null>(null);
  const autoActivationCandidateId = practices[0]?.id ?? currentPractice?.id ?? '';
  const resolvedPracticeId = activeOrganizationId ?? '';
  const hasPracticeCandidate = Boolean(resolvedPracticeId || autoActivationCandidateId);
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

  const canAutoActivatePractice = Boolean(
    !practicesLoading &&
    session?.user &&
    autoActivationCandidateId &&
    !activeOrganizationId
  );
  const shouldDelayPracticeConfig = canAutoActivatePractice && autoActivationState !== 'done' && autoActivationState !== 'failed';

  const {
    practiceConfig,
    practiceNotFound,
    handleRetryPracticeConfig,
    isLoading: _isLoading
  } = usePracticeConfig({
    onError: handlePracticeError,
    practiceId: shouldDelayPracticeConfig ? '' : resolvedPracticeId,
    allowUnauthenticated: false,
    refreshKey: practiceRefreshKey
  });

  const practiceId = resolvedPracticeId;

  useEffect(() => {
    if (!canAutoActivatePractice) return;
    const activationKey = `${session?.user?.id ?? 'unknown'}:${autoActivationCandidateId}`;
    if (autoActivationKeyRef.current === activationKey) return;
    autoActivationKeyRef.current = activationKey;
    setAutoActivationState('pending');
    const client = getClient();
    client.organization
      .setActive({ organizationId: autoActivationCandidateId })
      .then(() => {
        setAutoActivationState('done');
      })
      .catch((error) => {
        console.warn('[Workspace] Failed to auto-activate practice', error);
        setAutoActivationState('failed');
      });
  }, [autoActivationCandidateId, canAutoActivatePractice, session?.user?.id]);

  useEffect(() => {
    if (settingsMode || isPending || practicesLoading) return;
    if (!session?.user) return;
    if (shouldDelayPracticeConfig) return;
    if (!isPracticeEnabled || (!canAccessPractice && !hasPracticeCandidate)) {
      navigate('/client/conversations', true);
    }
  }, [
    canAccessPractice,
    hasPracticeCandidate,
    isPracticeEnabled,
    isPending,
    navigate,
    practicesLoading,
    session?.user,
    settingsMode,
    shouldDelayPracticeConfig
  ]);

  if (isPending || practicesLoading || shouldDelayPracticeConfig) {
    return <LoadingScreen />;
  }

  if (!session?.user) {
    return <AuthPage />;
  }

  if (!hasPracticeCandidate) {
    return <LoadingScreen />;
  }

  if (!practiceId) {
    if (practiceNotFound || autoActivationState === 'failed') {
      return <LoadingScreen />;
    }
    return <LoadingScreen />;
  }

  return (
    <MainApp
      practiceId={practiceId}
      practiceConfig={practiceConfig}
      practiceNotFound={practiceNotFound}
      handleRetryPracticeConfig={handleRetryPracticeConfig}
      isPracticeView={true}
      workspace="practice"
      settingsOverlayOpen={settingsOverlayOpen}
      activeRoute={activeRoute}
      routeConversationId={conversationId}
    />
  );
}

function PublicPracticeRoute({
  practiceSlug,
  conversationId,
  embedView = 'home'
}: {
  practiceSlug?: string;
  conversationId?: string;
  embedView?: 'home' | 'list' | 'conversation' | 'matters' | 'profile';
}) {
  const location = useLocation();
  const { session, isPending: sessionIsPending, activeMemberRole } = useSessionContext();
  const { navigate } = useNavigation();
  const handlePracticeError = useCallback((error: string) => {
    console.error('Practice config error:', error);
  }, []);

  const slug = (practiceSlug ?? '').trim();

  const {
    practiceConfig,
    practiceNotFound,
    handleRetryPracticeConfig,
    isLoading
  } = usePracticeConfig({
    onError: handlePracticeError,
    practiceId: slug,
    allowUnauthenticated: true
  });
  const resolvedPracticeId = useMemo(
    () => (typeof practiceConfig.id === 'string' ? practiceConfig.id : ''),
    [practiceConfig.id]
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

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (practiceNotFound) {
    return (
      <PracticeNotFound
        practiceId={slug || resolvedPracticeId}
        onRetry={handleRetryPracticeConfig}
      />
    );
  }

  if (!resolvedPracticeId) {
    return <LoadingScreen />;
  }

  if (sessionIsPending) {
    return <LoadingScreen />;
  }

  const normalizedRole = normalizePracticeRole(activeMemberRole);
  const isAuthenticatedClient = Boolean(session?.user && !session.user.isAnonymous && normalizedRole === 'client');
  if (isAuthenticatedClient && embedView === 'home' && slug) {
    navigate(`/embed/${encodeURIComponent(slug)}/conversations`, true);
    return <LoadingScreen />;
  }
  if (!isAuthenticatedClient && (embedView === 'matters' || embedView === 'profile') && slug) {
    navigate(`/embed/${encodeURIComponent(slug)}`, true);
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
        practiceNotFound={practiceNotFound}
        handleRetryPracticeConfig={handleRetryPracticeConfig}
        isPracticeView={true}
        workspace="public"
        activeRoute="conversations"
        publicPracticeSlug={slug || undefined}
        routeConversationId={conversationId}
        publicEmbedView={embedView}
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
