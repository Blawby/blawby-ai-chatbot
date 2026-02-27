import { hydrate, prerender as ssr, Router, Route, useLocation, LocationProvider } from 'preact-iso';
import { useCallback, useEffect, useMemo, useRef } from 'preact/hooks';
import { Suspense, lazy } from 'preact/compat';
import { I18nextProvider } from 'react-i18next';
import AuthPage from '@/pages/AuthPage';
import AcceptInvitationPage from '@/pages/AcceptInvitationPage';
import AwaitingInvitePage from '@/pages/AwaitingInvitePage';
import OnboardingPage from '@/pages/OnboardingPage';
import PricingPage from '@/pages/PricingPage';
import { SEOHead } from '@/app/SEOHead';
import { ToastProvider } from '@/shared/contexts/ToastContext';
import { SessionProvider, useSessionContext } from '@/shared/contexts/SessionContext';
import { RoutePracticeProvider } from '@/shared/contexts/RoutePracticeContext';
import { getClient } from '@/shared/lib/authClient';
import { MainApp } from '@/app/MainApp';
const SettingsPage = lazy(() => import('@/features/settings/pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
import { useNavigation } from '@/shared/utils/navigation';
import { usePracticeConfig } from '@/shared/hooks/usePracticeConfig';
import type { UIPracticeConfig } from '@/shared/hooks/usePracticeConfig';
import { useWidgetBootstrap } from '@/shared/hooks/useWidgetBootstrap';
import { useMobileDetection } from '@/shared/hooks/useMobileDetection';
import { handleError } from '@/shared/utils/errorHandler';
import { useWorkspaceResolver } from '@/shared/hooks/useWorkspaceResolver';
import {
  getValidatedSettingsReturnPath,
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

const DebugStylesPage = import.meta.env.DEV ? lazy(() => import('@/pages/DebugStylesPage')) : null;
const DebugMatterPage = import.meta.env.DEV ? lazy(() => import('@/pages/DebugMatterPage')) : null;

const DevDebugStylesRoute = () => {
  if (!import.meta.env.DEV || !DebugStylesPage) return <App404 />;
  return <DebugStylesPage />;
};

const DevDebugMatterRoute = () => {
  if (!import.meta.env.DEV || !DebugMatterPage) return <App404 />;
  return <DebugMatterPage />;
};

const LoadingScreen = () => (
  <div className="flex h-screen items-center justify-center text-sm text-gray-500 dark:text-gray-400">
    Loading…
  </div>
);

// PWA Cache Trap Breaker (Development Only)
// Since we disabled the PWA in dev, old workers from previous sessions aggressively intercept 
// navigation requests (like /widget-test.html) and serve the SPA shell, trapping the user.
if (import.meta.env.DEV && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    let unregistered = false;
    for (const registration of registrations) {
      registration.unregister();
      unregistered = true;
      console.warn('⚠️ Unregistered rogue development service worker.');
    }
    if (unregistered) {
      console.warn('🔄 Reloading page to escape SPA cache trap...');
      window.location.reload();
    }
  });
}

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
  const shouldFetchWorkspacePractices =
    !location.path.startsWith('/public/') &&
    !location.path.startsWith('/auth') &&
    !location.path.startsWith('/pricing') &&
    !location.path.startsWith('/pay');
  const { defaultWorkspace, currentPractice, practices } = useWorkspaceResolver({
    autoFetchPractices: shouldFetchWorkspacePractices
  });

  const handleRouteChange = useCallback((url: string) => {
    if (typeof window === 'undefined') return;

    if (!url.includes('/settings')) {
      setSettingsReturnPath(url);
    }
  }, []);

  useEffect(() => {
    if (sessionPending) return;
    const isPublicIntakeRoute =
      location.path.startsWith('/public/') ||
      location.path.startsWith('/client/') ||
      location.path.startsWith('/pay');
    if (typeof window !== 'undefined') {
      try {
        const pendingPath = window.sessionStorage.getItem('intakeAwaitingInvitePath');
        if (pendingPath) {
          const currentUrl = location.url.startsWith('/')
            ? location.url
            : `/${location.url.replace(/^\/+/, '')}`;
          const isValidPendingPath = pendingPath.startsWith('/') && !pendingPath.startsWith('//');
          const isAuthReturnRoute = location.path.startsWith('/auth');

          if (!isValidPendingPath) {
            window.sessionStorage.removeItem('intakeAwaitingInvitePath');
          } else if (pendingPath === currentUrl) {
            // Already at the target path; consume it without triggering another navigation.
            window.sessionStorage.removeItem('intakeAwaitingInvitePath');
          } else if (isAuthReturnRoute) {
            // Only auto-redirect from auth return routes to avoid flicker on normal public page refresh.
            window.sessionStorage.removeItem('intakeAwaitingInvitePath');
            navigate(pendingPath, true);
            return;
          } else {
            // Stale pending path outside auth flow; consume it to prevent repeated soft redirects.
            window.sessionStorage.removeItem('intakeAwaitingInvitePath');
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
      Boolean(user) &&
      !user?.isAnonymous &&
      user?.onboardingComplete !== true &&
      !isPublicIntakeRoute;

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
  }, [
    currentPractice,
    defaultWorkspace,
    location.path,
    location.url,
    navigate,
    practices,
    session?.user,
    sessionPending
  ]);

  return (
    <ToastProvider>
      <Suspense fallback={<LoadingScreen />}>
        <Router onRouteChange={handleRouteChange}>
          <Route path="/auth" component={AuthPage} />
          <Route path="/auth/accept-invitation" component={AcceptInvitationPage} />
          <Route path="/auth/awaiting-invite" component={AwaitingInvitePage} />
          <Route path="/pricing" component={PricingPage} />
          <Route path="/onboarding" component={OnboardingPage} />
          <Route path="/debug/styles" component={DevDebugStylesRoute} />
          <Route path="/debug/matters" component={DevDebugMatterRoute} />
          <Route path="/pay" component={PaySuccessPage} />
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
          <Route path="/practice/:practiceSlug/setup" component={PracticeAppRoute} workspaceView="setup" />
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

function RouteLoadError({
  message,
  onRetry
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-sm text-input-text">Failed to load this page: {message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-md border border-input-border px-3 py-1.5 text-sm text-input-text hover:bg-hover-background"
      >
        Retry
      </button>
    </div>
  );
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
    const validatedReturnPath = workspaceKey
      ? getValidatedSettingsReturnPath(returnPath, workspaceKey, slug)
      : null;
    navigate(validatedReturnPath ?? fallback, true);
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
    <RoutePracticeProvider value={{ practiceId: resolvedPractice?.id ?? null, practiceSlug: slug, workspace: workspaceKey }}>
      <SettingsPage
        isMobile={isMobile}
        onClose={handleCloseSettings}
        className="h-full"
      />
    </RoutePracticeProvider>
  );
}

function RootRoute() {
  const { session, isPending } = useSessionContext();
  const {
    defaultWorkspace,
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

    if (isMountedRef.current) {
      const fallbackSlug = currentPractice?.slug ?? practices[0]?.slug ?? null;
      const destination = getWorkspaceHomePath(defaultWorkspace, fallbackSlug, '/');
      navigate(destination, true);
    }
  }, [
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
  workspaceView?: 'home' | 'setup' | 'list' | 'conversation' | 'matters' | 'clients';
  practiceSlug?: string;
}) {
  const { session, isPending } = useSessionContext();
  const {
    hasPracticeAccess: canAccessPractice,
    practicesLoading,
    currentPractice,
    practices,
    resolvePracticeBySlug,
    routingClaims
  } = useWorkspaceResolver();
  const { navigate } = useNavigation();
  const normalizedPracticeSlug = (practiceSlug ?? '').trim();
  const hasPracticeSlug = normalizedPracticeSlug.length > 0;
  const slugPractice = hasPracticeSlug ? resolvePracticeBySlug(normalizedPracticeSlug) : null;
  const fallbackPracticeId = currentPractice?.id
    ?? practices[0]?.id
    ?? '';
  const practiceLookupKey = hasPracticeSlug ? (slugPractice?.id ?? '') : fallbackPracticeId;
  const practiceRefreshKey = useMemo(() => {
    if (!currentPractice || currentPractice.slug !== normalizedPracticeSlug) return null;
    return [
      currentPractice.updatedAt,
      currentPractice.slug,
      currentPractice.logo,
      currentPractice.name
    ]
      .filter(Boolean)
      .join('|');
  }, [currentPractice, normalizedPracticeSlug]);

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
    practiceId: shouldDelayPracticeConfig ? '' : practiceLookupKey,
    allowUnauthenticated: false,
    refreshKey: practiceRefreshKey
  });

  const resolvedPracticeIdFromConfig = typeof practiceConfig.id === 'string' ? practiceConfig.id : '';
  const resolvedPracticeId = resolvedPracticeIdFromConfig || practiceLookupKey;

  useEffect(() => {
    if (isPending || practicesLoading) return;
    if (!session?.user) return;
    if (canAccessPractice) return;

    const workspaceAccess = routingClaims?.workspace_access;
    const clientAllowed = workspaceAccess ? workspaceAccess.client : true;
    const publicAllowed = workspaceAccess ? workspaceAccess.public : true;

    if (normalizedPracticeSlug) {
      if (clientAllowed) {
        navigate(`/client/${encodeURIComponent(normalizedPracticeSlug)}`, true);
        return;
      }
      if (publicAllowed) {
        navigate(`/public/${encodeURIComponent(normalizedPracticeSlug)}`, true);
        return;
      }
    }

    const fallbackSlug = currentPractice?.slug ?? practices[0]?.slug ?? null;
    if (fallbackSlug) {
      if (clientAllowed) {
        navigate(`/client/${encodeURIComponent(fallbackSlug)}`, true);
        return;
      }
      if (publicAllowed) {
        navigate(`/public/${encodeURIComponent(fallbackSlug)}`, true);
        return;
      }
    }

    const fallbackWorkspace = clientAllowed ? 'client' : (publicAllowed ? 'public' : 'client');
    const fallbackPath = getWorkspaceHomePath(fallbackWorkspace, fallbackSlug, fallbackWorkspace === 'public' ? '/public' : '/');
    navigate(fallbackPath, true);
  }, [
    canAccessPractice,
    currentPractice?.slug,
    isPending,
    practicesLoading,
    navigate,
    normalizedPracticeSlug,
    practices,
    routingClaims?.workspace_access?.client,
    routingClaims?.workspace_access?.public,
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
        workspaceView={workspaceView}
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
  }, [isAuthenticatedClient, workspaceView, slug, navigate, sessionIsPending]);

  if (isLoading || sessionIsPending || practicesLoading) {
    return <LoadingScreen />;
  }

  if (!slug) {
    return <App404 />;
  }

  if (!session?.user) {
    return <AuthPage />;
  }

  if (practiceNotFound) {
    return <App404 />;
  }

  if (!slugPractice) {
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
        workspaceView={workspaceView}
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
  const isWidget = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('v') === 'widget'
    : (location.query?.v === 'widget'
      || /(?:^|[?&])v=widget(?:[&#]|$)/.test(location.url ?? ''));

  const {
    practiceConfig,
    practiceNotFound,
    loadError,
    isLoading,
    handleRetryPracticeConfig
  } = usePracticeConfig({
    onError: handlePracticeError,
    practiceId: slug,
    allowUnauthenticated: true
  });
  const resolvedPracticeId = useMemo(
    () => (typeof practiceConfig.id === 'string' ? practiceConfig.id : ''),
    [practiceConfig.id]
  );

  // Handle anonymous sign-in for non-widget public routes.
  // Widget routes use /api/widget/bootstrap (useWidgetBootstrap) to establish
  // the anonymous session and hydrate practice details in one worker request.
  // Calling Better Auth anonymous sign-in directly here causes duplicate auth
  // attempts and hard-fails in environments where the backend anonymous plugin
  // is disabled while the widget bootstrap route still works.
  useEffect(() => {
    if (typeof window === 'undefined' || sessionIsPending) return;
    if (isWidget || hasWidgetRuntimeContext()) return;

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
  }, [isWidget, session?.user, sessionIsPending]);

  const normalizedRole = normalizePracticeRole(activeMemberRole);
  const isAuthenticatedClient = Boolean(session?.user && !session.user.isAnonymous && normalizedRole === 'client');

  useEffect(() => {
    if (!slug || sessionIsPending) return;
    if (isAuthenticatedClient && workspaceView === 'home') {
      navigate(`/public/${encodeURIComponent(slug)}/conversations`, true);
    } else if (!isAuthenticatedClient && workspaceView === 'matters') {
      navigate(`/public/${encodeURIComponent(slug)}`, true);
    }
  }, [isAuthenticatedClient, workspaceView, slug, navigate, sessionIsPending]);

  if (isWidget) {
    return <WidgetRoute practiceSlug={slug} conversationId={conversationId} workspaceView={workspaceView} />;
  }

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!slug) {
    return <App404 />;
  }

  if (practiceNotFound) {
    return <App404 />;
  }

  if (loadError) {
    return <RouteLoadError message={loadError} onRetry={handleRetryPracticeConfig} />;
  }

  if (!resolvedPracticeId) {
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
        workspaceView={workspaceView}
        isWidget={false}
      />
    </>
  );
}

function WidgetRoute({
  practiceSlug,
  conversationId,
  workspaceView = 'home'
}: {
  practiceSlug: string;
  conversationId?: string;
  workspaceView?: 'home' | 'list' | 'conversation' | 'matters';
}) {
  const { data, isLoading, error } = useWidgetBootstrap(practiceSlug, true);
  const location = useLocation();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(WIDGET_RUNTIME_CONTEXT_KEY, '1');
    } catch {
      // ignore storage failures in privacy modes
    }
    return () => {
      try {
        window.sessionStorage.removeItem(WIDGET_RUNTIME_CONTEXT_KEY);
      } catch {
        // ignore
      }
    };
  }, []);

  const practiceConfig = useMemo<UIPracticeConfig | null>(() => {
    if (!data?.practiceDetails) return null;
    const pd = data.practiceDetails as Record<string, unknown>;
    const detailsRecord = (pd.details && typeof pd.details === 'object'
      ? pd.details as Record<string, unknown>
      : null);
    const resolveString = (value: unknown): string | null =>
      typeof value === 'string' && value.trim().length > 0 ? value : null;
    const resolveBoolean = (value: unknown): boolean | undefined =>
      typeof value === 'boolean' ? value : undefined;
    const resolveNumber = (value: unknown): number | undefined =>
      typeof value === 'number' ? value : undefined;

    const practiceId = resolveString(pd.practiceId)
      ?? resolveString(pd.id)
      ?? resolveString(pd.organization_id)
      ?? resolveString(pd.organizationId);
    const accentColor = resolveString(pd.accentColor)
      ?? resolveString(pd.accent_color)
      ?? resolveString(detailsRecord?.accentColor)
      ?? resolveString(detailsRecord?.accent_color);
    const introMessage = resolveString(pd.introMessage)
      ?? resolveString(pd.intro_message)
      ?? resolveString(detailsRecord?.introMessage)
      ?? resolveString(detailsRecord?.intro_message);
    const description = resolveString(pd.description)
      ?? resolveString(pd.overview)
      ?? resolveString(detailsRecord?.description)
      ?? resolveString(detailsRecord?.overview);

    return {
      id: practiceId ?? '',
      slug: resolveString(pd.slug) ?? practiceSlug,
      name: resolveString(pd.name) ?? '',
      profileImage: resolveString(pd.logo) ?? null,
      introMessage: introMessage ?? '',
      description: description ?? '',
      availableServices: [],
      serviceQuestions: {},
      domain: '',
      brandColor: '#000000',
      accentColor: accentColor ?? 'gold',
      voice: {
        enabled: false,
        provider: 'cloudflare',
        voiceId: null,
        displayName: null,
        previewUrl: null,
      },
      consultationFee: resolveNumber(pd.consultation_fee) ?? resolveNumber(detailsRecord?.consultationFee),
      paymentUrl: resolveString(pd.payment_url) ?? resolveString(detailsRecord?.paymentUrl),
      calendlyUrl: resolveString(pd.calendly_url) ?? resolveString(detailsRecord?.calendlyUrl),
      isPublic: resolveBoolean(pd.is_public) ?? resolveBoolean(detailsRecord?.isPublic),
    };
  }, [data, practiceSlug]);

  const resolvedPracticeId = practiceConfig?.id || '';

  if (isLoading || !data) {
    return <LoadingScreen />;
  }

  if (error || !practiceConfig || !resolvedPracticeId) {
    return <App404 />;
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
        publicPracticeSlug={practiceSlug || undefined}
        routeConversationId={data.conversationId || conversationId}
        workspaceView={workspaceView}
        isWidget={true}
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
const WIDGET_RUNTIME_CONTEXT_KEY = 'blawby_widget_runtime_context';

const hasWidgetRuntimeContext = (): boolean => {
  if (typeof window === 'undefined') return false;
  if (new URLSearchParams(window.location.search).get('v') === 'widget') return true;
  try {
    return window.sessionStorage.getItem(WIDGET_RUNTIME_CONTEXT_KEY) === '1';
  } catch {
    return false;
  }
};
