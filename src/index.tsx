import { hydrate, prerender as ssr, Router, Route, useLocation, LocationProvider } from 'preact-iso';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Suspense } from 'preact/compat';
import { I18nextProvider } from 'react-i18next';
import AuthPage from '@/pages/AuthPage';
import AcceptInvitationPage from '@/pages/AcceptInvitationPage';
import AwaitingInvitePage from '@/pages/AwaitingInvitePage';
import OnboardingPage from '@/pages/OnboardingPage';
import PricingPage from '@/pages/PricingPage';
import { SEOHead } from '@/app/SEOHead';
import { ToastProvider } from '@/shared/contexts/ToastContext';
import { SessionProvider, useSessionContext } from '@/shared/contexts/SessionContext';
import { getClient, getSession, updateUser } from '@/shared/lib/authClient';
import { MainApp } from '@/app/MainApp';
import { SettingsPage } from '@/features/settings/pages/SettingsPage';
import { useNavigation } from '@/shared/utils/navigation';
import { CartPage } from '@/features/cart/pages/CartPage';
import { usePracticeConfig } from '@/shared/hooks/usePracticeConfig';
import { useMobileDetection } from '@/shared/hooks/useMobileDetection';
import { handleError } from '@/shared/utils/errorHandler';
import { useWorkspace } from '@/shared/hooks/useWorkspace';
import { getSettingsReturnPath, getWorkspaceHomePath, resolveWorkspaceFromPath, setSettingsReturnPath } from '@/shared/utils/workspace';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { PaySuccessPage } from '@/pages/PaySuccessPage';
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

const NotFoundRoute = () => {
  const { navigate } = useNavigation();

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 text-sm text-gray-500 dark:text-gray-400">
      <div className="text-lg font-medium">Page Not Found</div>
      <div>The page you&apos;re looking for doesn&apos;t exist.</div>
      <button
        type="button"
        onClick={() => navigate('/')}
        className="text-primary hover:underline font-medium"
      >
        Return to Home
      </button>
    </div>
  );
};

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
  const { session, isPending: sessionPending, activeOrganizationId } = useSessionContext();
  const { defaultWorkspace, canAccessPractice, isPracticeLoading } = useWorkspace();
  const { currentPractice, practices } = usePracticeManagement();
  const lastWorkspaceRef = useRef<'client' | 'practice' | null>(null);
  const lastActivePracticeRef = useRef<string | null>(null);
  const routeTransitionRef = useRef(0);

  if (session?.user?.primaryWorkspace && lastWorkspaceRef.current !== session.user.primaryWorkspace) {
    lastWorkspaceRef.current = session.user.primaryWorkspace;
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
        } catch (innerError) {
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
      <Router onRouteChange={handleRouteChange}>
        <Route path="/auth" component={AuthPage} />
        <Route path="/auth/accept-invitation" component={AcceptInvitationPage} />
        <Route path="/auth/awaiting-invite" component={AwaitingInvitePage} />
        <Route path="/cart" component={CartPage} />
        <Route path="/pricing" component={PricingPage} />
        <Route path="/onboarding" component={OnboardingPage} />
        <Route path="/pay" component={PaySuccessPage} />
        <Route path="/settings" component={SettingsRoute} />
        <Route path="/settings/*" component={SettingsRoute} />
        <Route path="/public/:practiceSlug" component={PublicPracticeRoute} workspaceView="home" />
        <Route path="/public/:practiceSlug/conversations" component={PublicPracticeRoute} workspaceView="list" />
        <Route path="/public/:practiceSlug/conversations/:conversationId" component={PublicPracticeRoute} workspaceView="conversation" />
        <Route path="/public/:practiceSlug/matters" component={PublicPracticeRoute} workspaceView="matters" />
        <Route path="/client" component={NotFoundRoute} />
        <Route path="/client/:practiceSlug" component={ClientPracticeRoute} workspaceView="home" />
        <Route path="/client/:practiceSlug/conversations" component={ClientPracticeRoute} workspaceView="list" />
        <Route path="/client/:practiceSlug/conversations/:conversationId" component={ClientPracticeRoute} workspaceView="conversation" />
        <Route path="/client/:practiceSlug/matters" component={ClientPracticeRoute} workspaceView="matters" />
        <Route path="/practice" component={NotFoundRoute} />
        <Route path="/practice/:practiceSlug" component={PracticeAppRoute} workspaceView="home" />
        <Route path="/practice/:practiceSlug/conversations" component={PracticeAppRoute} workspaceView="list" />
        <Route path="/practice/:practiceSlug/conversations/:conversationId" component={PracticeAppRoute} workspaceView="conversation" />
        <Route path="/practice/:practiceSlug/clients" component={PracticeAppRoute} workspaceView="clients" />
        <Route path="/practice/:practiceSlug/clients/*" component={PracticeAppRoute} workspaceView="clients" />
        <Route path="/practice/:practiceSlug/matters" component={PracticeAppRoute} workspaceView="matters" />
        <Route path="/practice/:practiceSlug/matters/*" component={PracticeAppRoute} workspaceView="matters" />
        <Route default component={RootRoute} />
      </Router>
    </ToastProvider>
  );
}

function SettingsRoute() {
  const { preferredWorkspace, defaultWorkspace } = useWorkspace();
  const { activeOrganizationId } = useSessionContext();
  const { navigate } = useNavigation();
  const isClientWorkspace = preferredWorkspace === 'client';
  const {
    currentPractice,
    practices,
    loading: practicesLoading
  } = usePracticeManagement();
  const practiceById = (id: string | null) => practices.find((practice) => practice.id === id) ?? null;
  const resolvedPractice =
    practiceById(activeOrganizationId) ??
    currentPractice ??
    practices[0] ??
    null;
  const resolvedSlug = resolvedPractice?.slug ?? null;
  const handleCloseSettings = useCallback(() => {
    const returnPath = getSettingsReturnPath();
    const fallback = getWorkspaceHomePath(defaultWorkspace, resolvedSlug, '/');
    navigate(returnPath ?? fallback, true);
  }, [defaultWorkspace, navigate, resolvedSlug]);

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
      onSettingsClose={handleCloseSettings}
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
  const { currentPractice, practices, loading: practicesLoading } = usePracticeManagement();
  const [activationError, setActivationError] = useState<string | null>(null);
  const activationAttemptedRef = useRef(false);
  const workspaceInitRef = useRef(false);
  const practiceResetRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (isPending || isPracticeLoading || practicesLoading) return;
    if (!session?.user) return;
    if (activeOrganizationId) return;
    const targetPracticeId = currentPractice?.id ?? practices[0]?.id ?? null;
    if (!targetPracticeId) return;
    if (activationAttemptedRef.current) return;

    activationAttemptedRef.current = true;
    const client = getClient();
    client.organization
      .setActive({ organizationId: targetPracticeId })
      .then(() => {
        return getSession()
          .catch((error) => {
            console.error('[Workspace] Practice activated but failed to refresh session', error);
            setActivationError('Practice activated but we could not refresh your session. Refresh the page to continue.');
          });
      })
      .catch((error) => {
        console.error('[Workspace] Failed to set active organization automatically', error);
        setActivationError('We could not activate your practice automatically. Refresh to retry or pick a practice manually.');
      });
  }, [
    activeOrganizationId,
    currentPractice?.id,
    isPending,
    isPracticeLoading,
    practices,
    practicesLoading,
    session?.user
  ]);

  useEffect(() => {
    if (isPending || isPracticeLoading || practicesLoading) return;

    if (!session?.user) {
      navigate('/auth', true);
      return;
    }

    if (session.user.onboardingComplete !== true && !session.user.isAnonymous) {
      return;
    }

    const hasPractice = Boolean(currentPractice?.id || practices.length > 0);
    if (!canAccessPractice && !hasPractice) {
      navigate('/pricing', true);
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
    practicesLoading,
    isPending,
    navigate,
    activeOrganizationId,
    session?.user,
    currentPractice,
    practices
  ]);

  if (activationError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 px-6 text-center text-sm text-red-300">
        <p className="text-base font-semibold text-red-200">Activation stalled</p>
        <p className="max-w-md text-red-100">{activationError}</p>
        <button
          type="button"
          className="rounded-lg bg-red-500/20 px-4 py-2 font-medium text-red-100 hover:bg-red-500/30"
          onClick={() => window.location.reload()}
        >
          Reload and try again
        </button>
      </div>
    );
  }

  return <LoadingScreen />;
}


function PracticeAppRoute({
  settingsMode = false,
  onSettingsClose,
  conversationId,
  workspaceView = 'home',
  practiceSlug
}: {
  settingsMode?: boolean;
  onSettingsClose?: () => void;
  conversationId?: string;
  workspaceView?: 'home' | 'list' | 'conversation' | 'matters' | 'clients';
  practiceSlug?: string;
}) {
  const { session, isPending, activeOrganizationId } = useSessionContext();
  const isMobile = useMobileDetection();
  const {
    currentPractice,
    practices,
    loading: practicesLoading,
    refetch
  } = usePracticeManagement();
  const normalizedPracticeSlug = (practiceSlug ?? '').trim();
  const hasPracticeSlug = normalizedPracticeSlug.length > 0;
  const slugPractice = hasPracticeSlug
    ? practices.find((practice) => practice.slug === normalizedPracticeSlug)
      ?? (currentPractice?.slug === normalizedPracticeSlug ? currentPractice : null)
    : null;
  const fallbackPracticeId = activeOrganizationId
    ?? currentPractice?.id
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

  const activationTargetId = practiceIdCandidate;
  const activationRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activationTargetId) return;
    if (activeOrganizationId === activationTargetId) return;
    if (activationRef.current === activationTargetId || activationRef.current === `FAILED:${activationTargetId}`) return;

    activationRef.current = activationTargetId;
    const client = getClient();
    client.organization
      .setActive({ organizationId: activationTargetId })
      .then(() => {
        return getSession().catch(() => undefined);
      })
      .catch((error) => {
        console.warn('[Workspace] Failed to set active organization', error);
        activationRef.current = `FAILED:${activationTargetId}`;
      });
  }, [activationTargetId, activeOrganizationId]);

  if (isPending || practicesLoading || shouldDelayPracticeConfig) {
    return <LoadingScreen />;
  }

  if (!session?.user) {
    return <AuthPage />;
  }

  if (hasPracticeSlug && !slugPractice && !practicesLoading) {
    return (
      <PracticeNotFound
        practiceId={normalizedPracticeSlug}
        onRetry={() => refetch()}
      />
    );
  }

  if (!resolvedPracticeId) {
    if (practiceNotFound) {
      return (
        <PracticeNotFound
          practiceId={normalizedPracticeSlug || activationTargetId || 'unknown'}
          onRetry={() => refetch()}
        />
      );
    }
    return <LoadingScreen />;
  }

  if (settingsMode) {
    return (
      <SettingsPage
        isMobile={isMobile}
        onClose={onSettingsClose}
        className="h-full"
      />
    );
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
    if (isAuthenticatedClient && workspaceView === 'home') {
      navigate(`/client/${encodeURIComponent(slug)}/conversations`, true);
    } else if (!isAuthenticatedClient && workspaceView === 'matters') {
      navigate(`/client/${encodeURIComponent(slug)}`, true);
    }
  }, [isAuthenticatedClient, workspaceView, slug, navigate, sessionIsPending, session]);

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
    if (isAuthenticatedClient && workspaceView === 'home') {
      navigate(`/public/${encodeURIComponent(slug)}/conversations`, true);
    } else if (!isAuthenticatedClient && workspaceView === 'matters') {
      navigate(`/public/${encodeURIComponent(slug)}`, true);
    }
  }, [isAuthenticatedClient, workspaceView, slug, navigate, sessionIsPending, session]);

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
