import { hydrate, prerender as ssr, Router, Route, useLocation, LocationProvider, Link } from 'preact-iso';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Suspense } from 'preact/compat';
import { I18nextProvider } from 'react-i18next';
import AuthPage from '@/pages/AuthPage';
import AcceptInvitationPage from '@/pages/AcceptInvitationPage';
import OnboardingPage from '@/pages/OnboardingPage';
import { SEOHead } from '@/app/SEOHead';
import { ToastProvider } from '@/shared/contexts/ToastContext';
import { SessionProvider, useSessionContext } from '@/shared/contexts/SessionContext';
import { getClient, updateUser } from '@/shared/lib/authClient';
import { getPublicPracticeDetails } from '@/shared/lib/apiClient';
import { MainApp } from '@/app/MainApp';
import { SettingsLayout } from '@/features/settings/components/SettingsLayout';
import { useNavigation } from '@/shared/utils/navigation';
import { CartPage } from '@/features/cart/pages/CartPage';
import { usePracticeConfig } from '@/shared/hooks/usePracticeConfig';
import { useMobileDetection } from '@/shared/hooks/useMobileDetection';
import { handleError } from '@/shared/utils/errorHandler';
import { useWorkspace } from '@/shared/hooks/useWorkspace';
import { getSettingsReturnPath, getWorkspaceHomePath, resolveWorkspaceFromPath, setSettingsReturnPath } from '@/shared/utils/workspace';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { PayRedirectPage } from '@/pages/PayRedirectPage';
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

const NotFoundRoute = () => (
  <div className="flex h-screen flex-col items-center justify-center gap-4 text-sm text-gray-500 dark:text-gray-400">
    <div className="text-lg font-medium">Page Not Found</div>
    <div>The page you&apos;re looking for doesn&apos;t exist.</div>
    <Link
      href="/" 
      className="text-primary hover:underline font-medium"
    >
      Return to Home
    </Link>
  </div>
);

type LocationValue = ReturnType<typeof useLocation> & { wasPush?: boolean };
type PracticeRouteKey = 'home' | 'messages' | 'matters' | 'clients' | 'conversations';

// Client routes align with public embed structure

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
  const { currentPractice, practices } = usePracticeManagement();
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

  const fallbackSlug = currentPractice?.slug ?? practices[0]?.slug ?? null;
  const handleCloseSettings = useCallback(() => {
    const returnPath = getSettingsReturnPath();
    const fallback = getWorkspaceHomePath(defaultWorkspace, fallbackSlug, '/');
    navigate(returnPath ?? fallback, true);
  }, [defaultWorkspace, fallbackSlug, navigate]);

  const fallbackSettingsBackground = getWorkspaceHomePath(defaultWorkspace, fallbackSlug, '/');
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
      const fallback = getWorkspaceHomePath(defaultWorkspace, fallbackSlug, '/');
      navigate(fallback, true);
    }
  }, [defaultWorkspace, fallbackSlug, location.path, location.url, navigate, session?.user, sessionPending]);

  return (
    <ToastProvider>
      <LocationProvider.ctx.Provider value={routerLocation}>
        <Router onRouteChange={handleRouteChange}>
          <Route path="/auth" component={AuthPage} />
          <Route path="/auth/accept-invitation" component={AcceptInvitationPage} />
          <Route path="/cart" component={CartPage} />
          <Route path="/onboarding" component={OnboardingPage} />
          <Route path="/pay" component={PayRedirectPage} />
          <Route path="/settings" component={SettingsRoute} />
          <Route path="/settings/*" component={SettingsRoute} />
          <Route path="/embed/:practiceSlug" component={PublicPracticeRoute} embedView="home" />
          <Route path="/embed/:practiceSlug/conversations" component={PublicPracticeRoute} embedView="list" />
          <Route path="/embed/:practiceSlug/conversations/:conversationId" component={PublicPracticeRoute} embedView="conversation" />
          <Route path="/embed/:practiceSlug/matters" component={PublicPracticeRoute} embedView="matters" />
          <Route path="/client" component={NotFoundRoute} />
          <Route path="/client/:practiceSlug" component={ClientPracticeRoute} embedView="home" />
          <Route path="/client/:practiceSlug/conversations" component={ClientPracticeRoute} embedView="list" />
          <Route path="/client/:practiceSlug/conversations/:conversationId" component={ClientPracticeRoute} embedView="conversation" />
          <Route path="/client/:practiceSlug/matters" component={ClientPracticeRoute} embedView="matters" />
          <Route path="/practice" component={NotFoundRoute} />
          <Route path="/practice/:practiceSlug" component={PracticeAppRoute} settingsOverlayOpen={isSettingsOpen} activeRoute="home" practiceEmbedView="home" />
          <Route path="/practice/:practiceSlug/conversations" component={PracticeAppRoute} settingsOverlayOpen={isSettingsOpen} activeRoute="messages" practiceEmbedView="list" />
          <Route path="/practice/:practiceSlug/conversations/:conversationId" component={PracticeAppRoute} settingsOverlayOpen={isSettingsOpen} activeRoute="messages" practiceEmbedView="conversation" />
          <Route path="/practice/:practiceSlug/clients" component={PracticeAppRoute} settingsOverlayOpen={isSettingsOpen} activeRoute="clients" practiceEmbedView="clients" />
          <Route path="/practice/:practiceSlug/clients/*" component={PracticeAppRoute} settingsOverlayOpen={isSettingsOpen} activeRoute="clients" practiceEmbedView="clients" />
          <Route path="/practice/:practiceSlug/matters" component={PracticeAppRoute} settingsOverlayOpen={isSettingsOpen} activeRoute="matters" practiceEmbedView="matters" />
          <Route path="/practice/:practiceSlug/matters/*" component={PracticeAppRoute} settingsOverlayOpen={isSettingsOpen} activeRoute="matters" practiceEmbedView="matters" />
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
  const { preferredWorkspace } = useWorkspace();
  const { activeOrganizationId } = useSessionContext();
  const { navigate } = useNavigation();
  const isClientWorkspace = preferredWorkspace === 'client';
  const { currentPractice, practices, loading: practicesLoading } = usePracticeManagement();
  const practiceById = (id: string | null) => practices.find((practice) => practice.id === id) ?? null;
  const resolvedPractice =
    practiceById(activeOrganizationId) ??
    currentPractice ??
    practices[0] ??
    null;
  const resolvedSlug = resolvedPractice?.slug ?? null;

  useEffect(() => {
    if (!isClientWorkspace) return;
    if (practicesLoading) return;
    if (!resolvedSlug) {
      navigate('/auth', true);
      return;
    }
    navigate(`/client/${encodeURIComponent(resolvedSlug)}`, true);
  }, [isClientWorkspace, navigate, practicesLoading, resolvedSlug]);

  if (isClientWorkspace) {
    if (practicesLoading) {
      return <LoadingScreen />;
    }
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 text-sm text-gray-500 dark:text-gray-400">
        <div>Settings are available in your client portal.</div>
        <button
          type="button"
          className="rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm hover:bg-accent-600"
          onClick={() => navigate('/auth', true)}
        >
          Go to sign in
        </button>
      </div>
    );
  }

  return (
    <PracticeAppRoute
      settingsMode={true}
      settingsOverlayOpen={true}
      activeRoute="home"
    />
  );
}

function RootRoute() {
  const { session, isPending, activeOrganizationId } = useSessionContext();
  const {
    defaultWorkspace,
    canAccessPractice,
    isPracticeLoading
  } = useWorkspace();
  const { navigate } = useNavigation();
  const { currentPractice, practices } = usePracticeManagement();
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
      const fallbackSlug = currentPractice?.slug ?? practices[0]?.slug ?? null;
      const destination = getWorkspaceHomePath(defaultWorkspace, fallbackSlug, '/');
      navigate(destination, true);
    }
  }, [
    canAccessPractice,
    defaultWorkspace,
    isPracticeLoading,
    isPending,
    navigate,
    activeOrganizationId,
    session?.user,
    currentPractice,
    practices
  ]);

  return <LoadingScreen />;
}


function PracticeAppRoute({
  settingsMode = false,
  settingsOverlayOpen = false,
  activeRoute = 'home',
  conversationId,
  practiceEmbedView = 'home',
  practiceSlug
}: {
  settingsMode?: boolean;
  settingsOverlayOpen?: boolean;
  activeRoute?: PracticeRouteKey;
  conversationId?: string;
  practiceEmbedView?: 'home' | 'list' | 'conversation' | 'matters' | 'clients';
  practiceSlug?: string;
}) {
  const { session, isPending, activeOrganizationId } = useSessionContext();
  const { navigate } = useNavigation();
  const { isPracticeEnabled, canAccessPractice } = useWorkspace();
  const { currentPractice, practices, loading: practicesLoading } = usePracticeManagement();
  const [autoActivationState, setAutoActivationState] = useState<'idle' | 'pending' | 'done' | 'failed'>('idle');
  const autoActivationKeyRef = useRef<string | null>(null);
  const [resolvedSlugPracticeId, setResolvedSlugPracticeId] = useState<string | null>(null);
  const [slugLookupStatus, setSlugLookupStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [slugLookupRetry, setSlugLookupRetry] = useState(0);
  const autoActivationCandidateId = practices[0]?.id ?? currentPractice?.id ?? '';
  const normalizedPracticeSlug = (practiceSlug ?? '').trim();
  const hasPracticeSlug = normalizedPracticeSlug.length > 0;
  const resolvedPracticeId = activeOrganizationId ?? '';
  const hasPracticeCandidate = Boolean(hasPracticeSlug || resolvedPracticeId || autoActivationCandidateId);
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

  const handleRetrySlugLookup = useCallback(() => {
    setSlugLookupStatus('idle');
    setSlugLookupRetry((prev) => prev + 1);
  }, []);

  const canAutoActivatePractice = Boolean(
    !hasPracticeSlug &&
    !practicesLoading &&
    session?.user &&
    autoActivationCandidateId &&
    !activeOrganizationId
  );
  const shouldDelayPracticeConfig = canAutoActivatePractice && autoActivationState !== 'done' && autoActivationState !== 'failed';

  useEffect(() => {
    if (!hasPracticeSlug) {
      setResolvedSlugPracticeId(null);
      setSlugLookupStatus('idle');
      return;
    }

    const abortController = new AbortController();
    setSlugLookupStatus('loading');

    getPublicPracticeDetails(normalizedPracticeSlug, { signal: abortController.signal })
      .then((details) => {
        if (abortController.signal.aborted) return;
        
        const practiceId = details?.practiceId ?? null;
        if (!practiceId) {
          setResolvedSlugPracticeId(null);
          setSlugLookupStatus('error');
          return;
        }
        setResolvedSlugPracticeId(practiceId);
        setSlugLookupStatus('done');
      })
      .catch((error) => {
        if (abortController.signal.aborted) return;
        
        console.warn('[PracticeSlug] Failed to resolve practice slug', error);
        setResolvedSlugPracticeId(null);
        setSlugLookupStatus('error');
      });

    return () => {
      abortController.abort();
    };
  }, [hasPracticeSlug, normalizedPracticeSlug, slugLookupRetry]);

  const {
    practiceConfig,
    practiceNotFound,
    handleRetryPracticeConfig,
    isLoading: _isLoading
  } = usePracticeConfig({
    onError: handlePracticeError,
    practiceId: shouldDelayPracticeConfig
      ? ''
      : (hasPracticeSlug ? (resolvedSlugPracticeId ?? '') : resolvedPracticeId),
    allowUnauthenticated: false,
    refreshKey: practiceRefreshKey
  });

  const resolvedPracticeIdFromConfig = typeof practiceConfig.id === 'string' ? practiceConfig.id : '';
  const practiceId = hasPracticeSlug
    ? (resolvedPracticeIdFromConfig || resolvedPracticeId)
    : resolvedPracticeId;

  const slugActivationRef = useRef<string | null>(null);
  useEffect(() => {
    if (!hasPracticeSlug) return;
    const targetPracticeId = resolvedSlugPracticeId ?? resolvedPracticeIdFromConfig;
    if (!targetPracticeId) return;
    if (activeOrganizationId === targetPracticeId) return;
    if (slugActivationRef.current === targetPracticeId) return;
    slugActivationRef.current = targetPracticeId;

    const client = getClient();
    client.organization
      .setActive({ organizationId: targetPracticeId })
      .catch((error) => {
        console.warn('[Workspace] Failed to set active organization for practice slug', error);
        slugActivationRef.current = null;
      });
  }, [activeOrganizationId, hasPracticeSlug, resolvedPracticeIdFromConfig, resolvedSlugPracticeId]);

  useEffect(() => {
    if (!canAutoActivatePractice) return;
    if (slugActivationRef.current) return;
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
      const clientSlug = practices[0]?.slug ?? currentPractice?.slug;
      if (clientSlug) {
        navigate(`/client/${encodeURIComponent(clientSlug)}`, true);
      } else {
        navigate('/auth', true);
      }
    }
  }, [
    canAccessPractice,
    currentPractice,
    hasPracticeCandidate,
    isPracticeEnabled,
    isPending,
    navigate,
    practices,
    practicesLoading,
    session?.user,
    settingsMode,
    shouldDelayPracticeConfig
  ]);

  if (isPending || practicesLoading || shouldDelayPracticeConfig || (hasPracticeSlug && slugLookupStatus === 'loading')) {
    return <LoadingScreen />;
  }

  if (!session?.user) {
    return <AuthPage />;
  }

  if (hasPracticeSlug && slugLookupStatus === 'error') {
    return (
      <PracticeNotFound
        practiceId={normalizedPracticeSlug}
        onRetry={handleRetrySlugLookup}
      />
    );
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
      practiceEmbedView={practiceEmbedView}
      practiceSlug={normalizedPracticeSlug || undefined}
    />
  );
}

function ClientPracticeRoute({
  practiceSlug,
  conversationId,
  embedView = 'home'
}: {
  practiceSlug?: string;
  conversationId?: string;
  embedView?: 'home' | 'list' | 'conversation' | 'matters';
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

  const normalizedRole = normalizePracticeRole(activeMemberRole);
  const isAuthenticatedClient = Boolean(session?.user && !session.user.isAnonymous && normalizedRole === 'client');

  useEffect(() => {
    if (!slug || sessionIsPending) return;
    if (isAuthenticatedClient && embedView === 'home') {
      navigate(`/client/${encodeURIComponent(slug)}/conversations`, true);
    } else if (!isAuthenticatedClient && embedView === 'matters') {
      navigate(`/client/${encodeURIComponent(slug)}`, true);
    }
  }, [isAuthenticatedClient, embedView, slug, navigate, sessionIsPending, session]);

  if (isLoading || sessionIsPending) {
    return <LoadingScreen />;
  }

  if (!session?.user) {
    return <AuthPage />;
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
        workspace="client"
        activeRoute={embedView === 'conversation' || embedView === 'list' ? 'messages' : embedView === 'matters' ? 'matters' : 'home'}
        clientPracticeSlug={slug || undefined}
        routeConversationId={conversationId}
        clientEmbedView={embedView}
      />
    </>
  );
}

function PublicPracticeRoute({
  practiceSlug,
  conversationId,
  embedView = 'home'
}: {
  practiceSlug?: string;
  conversationId?: string;
  embedView?: 'home' | 'list' | 'conversation' | 'matters';
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

  const normalizedRole = normalizePracticeRole(activeMemberRole);
  const isAuthenticatedClient = Boolean(session?.user && !session.user.isAnonymous && normalizedRole === 'client');

  useEffect(() => {
    if (!slug || sessionIsPending) return;
    if (isAuthenticatedClient && embedView === 'home') {
      navigate(`/embed/${encodeURIComponent(slug)}/conversations`, true);
    } else if (!isAuthenticatedClient && embedView === 'matters') {
      navigate(`/embed/${encodeURIComponent(slug)}`, true);
    }
  }, [isAuthenticatedClient, embedView, slug, navigate, sessionIsPending, session]);

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

  if (isAuthenticatedClient && embedView === 'home' && slug) {
    return <LoadingScreen />;
  }
  if (!isAuthenticatedClient && embedView === 'matters' && slug) {
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
