import { hydrate, prerender as ssr, Router, Route, useLocation, LocationProvider } from 'preact-iso';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Suspense } from 'preact/compat';
import { I18nextProvider } from 'react-i18next';
import AuthPage from '@/pages/AuthPage';
import AcceptInvitationPage from '@/pages/AcceptInvitationPage';
import OnboardingPage from '@/pages/OnboardingPage';
import PricingPage from '@/pages/PricingPage';
import PaymentResultPage from '@/pages/PaymentResultPage';
import DebugStylesPage from '@/pages/DebugStylesPage';
import DebugDialogsPage from '@/pages/DebugDialogsPage';
import DebugChatPage from '@/pages/DebugChatPage';
import DebugConversationsPage from '@/pages/DebugConversationsPage';
import DebugMatterPage from '@/pages/DebugMatterPage';
import { ClientEngagementReviewPage } from '@/features/engagements/pages/ClientEngagementReviewPage';
import { SEOHead } from '@/app/SEOHead';
import { ToastProvider } from '@/shared/contexts/ToastContext';
import { SessionProvider, useSessionContext } from '@/shared/contexts/SessionContext';
import { getClient } from '@/shared/lib/authClient';
import { MainApp } from '@/app/MainApp';
import { WidgetApp } from '@/app/WidgetApp';
import { WidgetPreviewApp } from '@/app/WidgetPreviewApp';
import { useNavigation } from '@/shared/utils/navigation';
import { usePracticeConfig } from '@/shared/hooks/usePracticeConfig';
import type { UIPracticeConfig } from '@/shared/hooks/usePracticeConfig';
import { useWidgetBootstrap } from '@/shared/hooks/useWidgetBootstrap';
import { handleError } from '@/shared/utils/errorHandler';
import { useWorkspaceResolver } from '@/shared/hooks/useWorkspaceResolver';
import {
  getWorkspaceHomePath,
} from '@/shared/utils/workspace';
import { AppGuard } from '@/app/AppGuard';
import { App404 } from '@/features/practice/components/404';
import { normalizePracticeRole } from '@/shared/utils/practiceRoles';
import { LoadingScreen } from '@/shared/ui/layout/LoadingScreen';
import { resolvePracticeSetupStatus } from '@/features/practice-setup/utils/status';
import { usePracticeDetails } from '@/shared/hooks/usePracticeDetails';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { WorkspacePlaceholderState } from '@/shared/ui/layout/WorkspacePlaceholderState';
import './index.css';
import { i18n, initI18n } from '@/shared/i18n';
import { initializeAccentColor } from '@/shared/utils/accentColors';
import { consumePostAuthConversationContext } from '@/shared/utils/anonymousIdentity';
import { isWidgetRuntimeContext, setWidgetRuntimeContext } from '@/shared/utils/widgetAuth';
import { useTheme } from '@/shared/hooks/useTheme';
import { normalizePracticeDetailsResponse, setActivePractice } from '@/shared/lib/apiClient';
import { setPracticeDetailsEntry } from '@/shared/stores/practiceDetailsStore';
import type { WidgetPreviewConfig, WidgetPreviewMessage, WidgetPreviewScenario } from '@/shared/types/widgetPreview';
const DevDebugStylesRoute = () => {
  if (!import.meta.env.DEV) return <App404 />;
  return <DebugStylesPage />;
};

const DevDebugChatRoute = () => {
  if (!import.meta.env.DEV) return <App404 />;
  return <DebugChatPage />;
};

const DevDebugDialogsRoute = () => {
  if (!import.meta.env.DEV) return <App404 />;
  return <DebugDialogsPage />;
};

const DevDebugDialogPreviewRoute = ({ previewId }: { previewId?: string }) => {
  if (!import.meta.env.DEV) return <App404 />;
  return <DebugDialogsPage previewId={previewId} />;
};

const DevDebugConversationsRoute = () => {
  if (!import.meta.env.DEV) return <App404 />;
  return <DebugConversationsPage />;
};

const DevDebugMatterRoute = () => {
  if (!import.meta.env.DEV) return <App404 />;
  return <DebugMatterPage />;
};


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
function PayRedirect() {
  const { navigate } = useNavigation();
  const location = useLocation();
  useEffect(() => {
    // Validate returnTo: must be a safe relative path starting with a single '/'
    let returnTo = location.query.return_to || '/';
    if (!returnTo.startsWith('/') || returnTo.startsWith('//') || returnTo.includes(':')) {
      returnTo = '/';
    }
    
    const params = new URLSearchParams(window.location.search);
    params.delete('return_to');
    const search = params.toString();
    navigate(`${returnTo}${search ? `?${search}` : ''}`, true);
  }, [location, navigate]);
  return <LoadingScreen />;
}

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
  useTheme();
  const location = useLocation();
  const { navigate } = useNavigation();
  const { session, isPending: sessionPending } = useSessionContext();
  const shouldFetchWorkspacePractices =
    !location.path.startsWith('/public/') &&
    !location.path.startsWith('/auth') &&
    !location.path.startsWith('/pricing') &&
    // Pre-subscription users on the onboarding flow have no org yet — fetching
    // practices would produce a guaranteed 403. AppShell redirects back here
    // until onboardingComplete is true, so this guard is safe.
    !location.path.startsWith('/onboarding');
  const { defaultWorkspace, currentPractice, practices } = useWorkspaceResolver({
    autoFetchPractices: shouldFetchWorkspacePractices
  });

  useEffect(() => {
    if (sessionPending) return;
    if (session?.user && !session.user.isAnonymous) {
      const pendingConversation = consumePostAuthConversationContext();
      if (
        pendingConversation?.workspace === 'public' &&
        pendingConversation.practiceSlug &&
        pendingConversation.conversationId
      ) {
        const targetPath = `/public/${encodeURIComponent(pendingConversation.practiceSlug)}/conversations/${encodeURIComponent(pendingConversation.conversationId)}`;
        const currentUrl = location.url.startsWith('/')
          ? location.url
          : `/${location.url.replace(/^\/+/, '')}`;
        if (currentUrl !== targetPath) {
          navigate(targetPath, true);
          return;
        }
      }
    }
    const isDebugRoute = import.meta.env.DEV && location.path.startsWith('/debug');
    const isPublicIntakeRoute =
      location.path.startsWith('/public/') ||
      location.path.startsWith('/client/');
    const bypassOnboardingForRoute = isPublicIntakeRoute || isDebugRoute;

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
      !bypassOnboardingForRoute;

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
        <Router>
          <Route path="/auth" component={AuthPage} />
          <Route path="/auth/accept-invitation" component={AcceptInvitationPage} />
          <Route path="/pricing" component={PricingPage} />
          <Route path="/onboarding" component={OnboardingPage} />
          <Route path="/debug/styles" component={DevDebugStylesRoute} />
          <Route path="/debug/dialogs" component={DevDebugDialogsRoute} />
          <Route path="/debug/dialogs/:previewId" component={DevDebugDialogPreviewRoute} />
          <Route path="/debug/chat" component={DevDebugChatRoute} />
          <Route path="/debug/conversations" component={DevDebugConversationsRoute} />
          <Route path="/debug/matters" component={DevDebugMatterRoute} />
          <Route path="/pay" component={PayRedirect} />
          <Route path="/public/:practiceSlug" component={PublicPracticeRoute} workspaceView="home" />
          <Route path="/public/:practiceSlug/conversations" component={PublicPracticeRoute} workspaceView="list" />
          <Route path="/public/:practiceSlug/conversations/:conversationId" component={PublicPracticeRoute} workspaceView="conversation" />
          <Route path="/public/:practiceSlug/matters" component={PublicPracticeRoute} workspaceView="matters" />
          <Route path="/client" component={App404} />
          <Route path="/client/:practiceSlug" component={ClientPracticeRoute} workspaceView="home" />
          <Route path="/client/:practiceSlug/conversations" component={ClientPracticeRoute} workspaceView="list" />
          <Route path="/client/:practiceSlug/conversations/:conversationId" component={ClientPracticeRoute} workspaceView="conversation" />
          <Route path="/client/:practiceSlug/matters" component={ClientPracticeRoute} workspaceView="matters" />
          <Route path="/client/:practiceSlug/matters/*" component={ClientPracticeRoute} workspaceView="matters" />
          <Route path="/client/:practiceSlug/engagements/:engagementId/review" component={ClientEngagementReviewRoute} />
          <Route path="/client/:practiceSlug/invoices" component={ClientPracticeRoute} workspaceView="invoices" />
          <Route path="/client/:practiceSlug/invoices/:invoiceId" component={ClientPracticeRoute} workspaceView="invoiceDetail" />
          <Route path="/client/:practiceSlug/settings" component={ClientPracticeRoute} workspaceView="settings" settingsView="general" />
          <Route path="/client/:practiceSlug/settings/general" component={ClientPracticeRoute} workspaceView="settings" settingsView="general" />
          <Route path="/client/:practiceSlug/settings/notifications" component={ClientPracticeRoute} workspaceView="settings" settingsView="notifications" />
          <Route path="/client/:practiceSlug/settings/account" component={ClientPracticeRoute} workspaceView="settings" settingsView="account" />
          <Route path="/client/:practiceSlug/settings/practice" component={ClientPracticeRoute} workspaceView="settings" settingsView="practice" />
          {/* Removed legacy brand settings route for client */}
          <Route path="/client/:practiceSlug/settings/apps/blawby-messenger/settings" component={ClientPracticeRoute} workspaceView="settings" settingsView="blawby-messenger-settings" />
          <Route path="/client/:practiceSlug/settings/practice/coverage" component={ClientPracticeRoute} workspaceView="settings" settingsView="practice-coverage" />
          <Route path="/client/:practiceSlug/settings/practice/team" component={ClientPracticeRoute} workspaceView="settings" settingsView="practice-team" />
          <Route path="/client/:practiceSlug/settings/practice/pricing" component={ClientPracticeRoute} workspaceView="settings" settingsView="practice-pricing" />
          <Route path="/client/:practiceSlug/settings/apps" component={ClientPracticeRoute} workspaceView="settings" settingsView="apps" />
          <Route path="/client/:practiceSlug/settings/apps/:appId" component={ClientPracticeRoute} workspaceView="settings" settingsView="app-detail" />
          <Route path="/client/:practiceSlug/settings/security" component={ClientPracticeRoute} workspaceView="settings" settingsView="security" />
          <Route path="/client/:practiceSlug/settings/help" component={ClientPracticeRoute} workspaceView="settings" settingsView="help" />
          <Route path="/practice" component={App404} />
          <Route path="/practice/:practiceSlug" component={PracticeAppRoute} workspaceView="home" />
          <Route path="/practice/:practiceSlug/setup" component={PracticeAppRoute} workspaceView="setup" />
          <Route path="/practice/:practiceSlug/conversations" component={PracticeAppRoute} workspaceView="list" />
          <Route path="/practice/:practiceSlug/conversations/:conversationId" component={PracticeAppRoute} workspaceView="conversation" />
          <Route path="/practice/:practiceSlug/people" component={PracticeAppRoute} workspaceView="clients" />
          <Route path="/practice/:practiceSlug/people/*" component={PracticeAppRoute} workspaceView="clients" />
          <Route path="/practice/:practiceSlug/clients" component={PracticeAppRoute} workspaceView="clients" />
          <Route path="/practice/:practiceSlug/clients/*" component={PracticeAppRoute} workspaceView="clients" />
          <Route path="/practice/:practiceSlug/matters" component={PracticeAppRoute} workspaceView="matters" />
          <Route path="/practice/:practiceSlug/matters/*" component={PracticeAppRoute} workspaceView="matters" />
          <Route path="/practice/:practiceSlug/intakes" component={PracticeAppRoute} workspaceView="intakes" />
          <Route path="/practice/:practiceSlug/intakes/:intakeId" component={PracticeAppRoute} workspaceView="intakeDetail" />
          <Route path="/practice/:practiceSlug/engagements" component={PracticeAppRoute} workspaceView="engagements" />
          <Route path="/practice/:practiceSlug/engagements/:engagementId" component={PracticeAppRoute} workspaceView="engagements" />
          <Route path="/practice/:practiceSlug/reports" component={PracticeAppRoute} workspaceView="reports" />
          <Route path="/practice/:practiceSlug/reports/*" component={PracticeAppRoute} workspaceView="reports" />
          <Route path="/practice/:practiceSlug/invoices" component={PracticeAppRoute} workspaceView="invoices" />
          <Route path="/practice/:practiceSlug/invoices/new" component={PracticeAppRoute} workspaceView="invoiceCreate" />
          <Route path="/practice/:practiceSlug/invoices/:invoiceId/edit" component={PracticeAppRoute} workspaceView="invoiceEdit" />
          <Route path="/practice/:practiceSlug/invoices/:invoiceId" component={PracticeAppRoute} workspaceView="invoiceDetail" />
          <Route path="/practice/:practiceSlug/settings" component={PracticeAppRoute} workspaceView="settings" settingsView="general" />
          <Route path="/practice/:practiceSlug/settings/general" component={PracticeAppRoute} workspaceView="settings" settingsView="general" />
          <Route path="/practice/:practiceSlug/settings/notifications" component={PracticeAppRoute} workspaceView="settings" settingsView="notifications" />
          <Route path="/practice/:practiceSlug/settings/account" component={PracticeAppRoute} workspaceView="settings" settingsView="account" />
          <Route path="/practice/:practiceSlug/settings/practice" component={PracticeAppRoute} workspaceView="settings" settingsView="practice" />
          {/* Removed legacy brand settings route */}
          <Route path="/practice/:practiceSlug/settings/apps/blawby-messenger/settings" component={PracticeAppRoute} workspaceView="settings" settingsView="blawby-messenger-settings" />
          <Route path="/practice/:practiceSlug/settings/practice/payouts" component={PracticeAppRoute} workspaceView="settings" settingsView="practice-payouts" />
          <Route path="/practice/:practiceSlug/settings/practice/coverage" component={PracticeAppRoute} workspaceView="settings" settingsView="practice-coverage" />
          <Route path="/practice/:practiceSlug/settings/practice/team" component={PracticeAppRoute} workspaceView="settings" settingsView="practice-team" />
          <Route path="/practice/:practiceSlug/settings/practice/pricing" component={PracticeAppRoute} workspaceView="settings" settingsView="practice-pricing" />
          <Route path="/practice/:practiceSlug/settings/apps" component={PracticeAppRoute} workspaceView="settings" settingsView="apps" />
          <Route path="/practice/:practiceSlug/settings/apps/:appId" component={PracticeAppRoute} workspaceView="settings" settingsView="app-detail" />
          <Route path="/practice/:practiceSlug/settings/security" component={PracticeAppRoute} workspaceView="settings" settingsView="security" />
          <Route path="/practice/:practiceSlug/settings/help" component={PracticeAppRoute} workspaceView="settings" settingsView="help" />
          <Route path="/p/:practiceSlug" component={({ practiceSlug }: { practiceSlug?: string }) => <PaymentResultPage practiceSlug={practiceSlug} />} />
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

/**
 * Client engagement review route.
 * Route: /client/:practiceSlug/engagements/:engagementId/review
 *
 * No magic link — client is already authenticated from the intake invite flow.
 * Standard auth redirects apply if unauthenticated.
 */
function ClientEngagementReviewRoute({
  practiceSlug,
  engagementId,
}: {
  practiceSlug?: string;
  engagementId?: string;
}) {
  const { session, isPending: sessionIsPending } = useSessionContext();
  const { resolvePracticeBySlug, practicesLoading } = useWorkspaceResolver();
  const handlePracticeError = useCallback((error: string) => {
    console.error('Practice config error (engagement review):', error);
  }, []);

  const slug = (practiceSlug ?? '').trim();
  const slugPractice = resolvePracticeBySlug(slug);
  const practiceIdCandidate = slugPractice?.id ?? slug ?? '';

  const { practiceConfig, isLoading: configLoading, practiceNotFound, loadError, handleRetryPracticeConfig } = usePracticeConfig({
    onError: handlePracticeError,
    practiceId: practicesLoading ? '' : practiceIdCandidate,
    allowUnauthenticated: false,
  });

  const resolvedPracticeId = (typeof practiceConfig.id === 'string' ? practiceConfig.id : '') || slugPractice?.id || '';

  const conversationsBasePath = slug ? `/client/${encodeURIComponent(slug)}/conversations` : null;

  if (sessionIsPending || configLoading || practicesLoading) return <LoadingScreen />;
  if (practiceNotFound || !slug || !engagementId) return <App404 />;
  if (loadError) {
    return (
      <WorkspacePlaceholderState
        icon={ExclamationTriangleIcon}
        title="Failed to load practice"
        description={loadError}
        primaryAction={{
          label: 'Retry',
          onClick: handleRetryPracticeConfig,
        }}
      />
    );
  }
  if (!session?.user) return <AuthPage />;
  if (!resolvedPracticeId) return <LoadingScreen />;

  return (
    <ClientEngagementReviewPage
      practiceId={resolvedPracticeId}
      engagementId={engagementId}
      practiceName={practiceConfig.name || slug}
      conversationsBasePath={conversationsBasePath}
    />
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
  invoiceId,
  appId,
  workspaceView = 'home',
  settingsView = 'general',
  practiceSlug
}: {
  conversationId?: string;
  invoiceId?: string;
  appId?: string;
  workspaceView?: 'home' | 'setup' | 'list' | 'conversation' | 'intakes' | 'intakeDetail' | 'engagements' | 'matters' | 'clients' | 'invoices' | 'invoiceCreate' | 'invoiceEdit' | 'invoiceDetail' | 'reports' | 'settings';
  settingsView?: 'general' | 'notifications' | 'account' | 'practice' | 'blawby-messenger-settings' | 'practice-payouts' | 'practice-coverage' | 'practice-team' | 'practice-pricing' | 'apps' | 'app-detail' | 'security' | 'help';
  practiceSlug?: string;
}) {
  const { session, isPending, activeMemberRole } = useSessionContext();
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
  const targetPractice = slugPractice ?? currentPractice;
  const normalizedMemberRole = normalizePracticeRole(activeMemberRole);
  const shouldEnforceSetupGate = normalizedMemberRole === 'owner' || normalizedMemberRole === 'admin';
  const { details: practiceDetails, fetchDetails: fetchPracticeDetails } = usePracticeDetails(
    resolvedPracticeId || null,
    normalizedPracticeSlug || null,
    false
  );
  const [setupGateReady, setSetupGateReady] = useState(false);
  const sessionRecord = session?.session as Record<string, unknown> | undefined;
  const backendActiveOrgId =
    (typeof sessionRecord?.activeOrganizationId === 'string'
      ? sessionRecord.activeOrganizationId
      : typeof sessionRecord?.active_organization_id === 'string'
        ? sessionRecord.active_organization_id
        : null);
  const isRouteOrgSynced = !resolvedPracticeId || !backendActiveOrgId || backendActiveOrgId === resolvedPracticeId;
  const setupStatus = useMemo(
    () => resolvePracticeSetupStatus(targetPractice, practiceDetails ?? null),
    [targetPractice, practiceDetails]
  );

  useEffect(() => {
    if (isPending || practicesLoading || !session?.user || !resolvedPracticeId) return;

    // If the backend session doesn't match the route-selected practice ID,
    // synchronize it to ensure correct permission/role resolution.
    if (resolvedPracticeId && backendActiveOrgId !== resolvedPracticeId) {
      setActivePractice(resolvedPracticeId).catch((err) => {
        console.warn('[PracticeAppRoute] Failed to switch active practice context:', err);
      });
    }
  }, [resolvedPracticeId, session?.user, isPending, practicesLoading, backendActiveOrgId]);

  useEffect(() => {
    if (!shouldEnforceSetupGate || !resolvedPracticeId || !canAccessPractice) {
      setSetupGateReady(true);
      return;
    }

    if (!isRouteOrgSynced) {
      setSetupGateReady(false);
      return;
    }

    let cancelled = false;
    setSetupGateReady(false);
    void fetchPracticeDetails()
      .catch((error) => {
        console.warn('[PracticeAppRoute] Failed to load practice details for setup gate:', error);
      })
      .finally(() => {
        if (!cancelled) {
          setSetupGateReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [canAccessPractice, fetchPracticeDetails, isRouteOrgSynced, resolvedPracticeId, shouldEnforceSetupGate]);

  useEffect(() => {
    if (isPending || practicesLoading) return;
    if (!session?.user || !canAccessPractice || !targetPractice?.slug) return;
    if (!shouldEnforceSetupGate || !isRouteOrgSynced || !setupGateReady) return;
    if (!setupStatus.needsSetup || workspaceView === 'setup') return;

    navigate(`/practice/${encodeURIComponent(targetPractice.slug)}/setup`, true);
  }, [
    canAccessPractice,
    isPending,
    isRouteOrgSynced,
    navigate,
    practicesLoading,
    session?.user,
    setupGateReady,
    setupStatus.needsSetup,
    shouldEnforceSetupGate,
    targetPractice?.slug,
    workspaceView,
  ]);

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

    if (!clientAllowed && !publicAllowed) {
      navigate('/auth', true);
      return;
    }

    const fallbackWorkspace = clientAllowed ? 'client' : 'public';
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
    routingClaims?.workspace_access,
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

  if (shouldEnforceSetupGate && !isRouteOrgSynced) {
    return <LoadingScreen />;
  }

  if (shouldEnforceSetupGate && !setupGateReady) {
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
        routeInvoiceId={invoiceId}
        routeSettingsView={settingsView}
        routeSettingsAppId={appId}
        workspaceView={workspaceView}
        practiceSlug={normalizedPracticeSlug || undefined}
      />
  );
}

function ClientPracticeRoute({
  practiceSlug,
  conversationId,
  invoiceId,
  appId,
  workspaceView = 'home',
  settingsView = 'general',
}: {
  practiceSlug?: string;
  conversationId?: string;
  invoiceId?: string;
  appId?: string;
  workspaceView?: 'home' | 'list' | 'conversation' | 'matters' | 'invoices' | 'invoiceDetail' | 'settings';
  settingsView?: 'general' | 'notifications' | 'account' | 'practice' | 'blawby-messenger-settings' | 'practice-payouts' | 'practice-coverage' | 'practice-team' | 'practice-pricing' | 'apps' | 'app-detail' | 'security' | 'help';
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
    } else if (!isAuthenticatedClient && (workspaceView === 'matters' || workspaceView === 'invoices' || workspaceView === 'invoiceDetail')) {
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
        routeInvoiceId={invoiceId}
        routeSettingsView={settingsView}
        routeSettingsAppId={appId}
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
    if (isWidget || isWidgetRuntimeContext()) return;

    // Only attempt if no session exists
    if (!session?.user) {
      const key = 'anonymous_signin_attempted';
      const attemptStatus = sessionStorage.getItem(key);

      // Only attempt once per browser session, or retry if previous attempt failed
      if (!attemptStatus || attemptStatus === 'failed') {
        sessionStorage.setItem(key, 'pending');
        (async () => {
          try {
            const client = getClient();

            // Type assertion needed: Better Auth anonymous plugin types may not be fully exposed
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const signIn = client.signIn as any;

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
        // Skip duplicate anonymous sign-in attempts in the same tab session.
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
  workspaceView: _workspaceView = 'home'
}: {
  practiceSlug: string;
  conversationId?: string;
  workspaceView?: 'home' | 'list' | 'conversation' | 'matters';
}) {
  const { data, isLoading, error } = useWidgetBootstrap(practiceSlug, true);
  const location = useLocation();
  const isPreview = typeof location.query?.preview === 'string'
    ? location.query.preview === '1' || location.query.preview === 'true'
    : /(?:^|[?&])preview=(?:1|true)(?:[&#]|$)/.test(location.url ?? '');
  const initialScenario = useMemo<WidgetPreviewScenario>(() => {
    const raw = typeof location.query?.scenario === 'string'
      ? location.query.scenario
      : new URLSearchParams((location.url ?? '').split('?')[1] ?? '').get('scenario');
    return raw === 'consultation-payment' || raw === 'service-routing' || raw === 'messenger-start'
      ? raw
      : 'messenger-start';
  }, [location.query?.scenario, location.url]);
  const [previewScenario, setPreviewScenario] = useState<WidgetPreviewScenario>(initialScenario);
  const [previewConfig, setPreviewConfig] = useState<WidgetPreviewConfig>({});

  useEffect(() => {
    setWidgetRuntimeContext(true);
    return () => {
      setWidgetRuntimeContext(false);
    };
  }, []);

  useEffect(() => {
    if (!isPreview) return;
    const handleMessage = (event: MessageEvent<WidgetPreviewMessage>) => {
      if (event.origin !== window.location.origin) return;
      if (!event.data || event.data.type !== 'blawby:widget-preview-config') return;
      setPreviewScenario(event.data.scenario);
      setPreviewConfig(event.data.payload ?? {});
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [isPreview]);

  const basePracticeConfig = useMemo<UIPracticeConfig | null>(() => {
    if (!data?.practiceDetails) return null;
    const pd = data.practiceDetails as Record<string, unknown>;
    const dataRecord = (pd.data && typeof pd.data === 'object'
      ? pd.data as Record<string, unknown>
      : null);
    const detailsRecord = (pd.details && typeof pd.details === 'object'
      ? pd.details as Record<string, unknown>
      : null);
    const nestedDetailsRecord = (dataRecord?.details && typeof dataRecord.details === 'object'
      ? dataRecord.details as Record<string, unknown>
      : null);
    const resolveString = (value: unknown): string | null =>
      typeof value === 'string' && value.trim().length > 0 ? value : null;
    const resolveBoolean = (value: unknown): boolean | undefined =>
      typeof value === 'boolean' ? value : undefined;
    const resolveNumber = (value: unknown): number | undefined =>
      typeof value === 'number' ? value : undefined;

    const practiceId = resolveString(pd.organizationId)
      ?? resolveString(pd.organization_id)
      ?? resolveString(dataRecord?.organizationId)
      ?? resolveString(dataRecord?.organization_id)
      ?? resolveString(detailsRecord?.organizationId)
      ?? resolveString(detailsRecord?.organization_id)
      ?? resolveString(detailsRecord?.practiceId)
      ?? resolveString(detailsRecord?.id)
      ?? resolveString(nestedDetailsRecord?.organizationId)
      ?? resolveString(nestedDetailsRecord?.organization_id)
      ?? resolveString(nestedDetailsRecord?.practiceId)
      ?? resolveString(nestedDetailsRecord?.id)
      ?? resolveString((pd as Record<string, unknown>).practiceId)
      ?? resolveString((pd as Record<string, unknown>).id)
      ?? resolveString(dataRecord?.practiceId)
      ?? resolveString(dataRecord?.id);
    const accentColor = resolveString(pd.accentColor)
      ?? resolveString(pd.accent_color)
      ?? resolveString(dataRecord?.accentColor)
      ?? resolveString(dataRecord?.accent_color)
      ?? resolveString(detailsRecord?.accentColor)
      ?? resolveString(detailsRecord?.accent_color)
      ?? resolveString(nestedDetailsRecord?.accentColor)
      ?? resolveString(nestedDetailsRecord?.accent_color);
    const description = resolveString(pd.description)
      ?? resolveString(pd.overview)
      ?? resolveString(detailsRecord?.description)
      ?? resolveString(detailsRecord?.overview);

    return {
      id: practiceId ?? '',
      slug: resolveString(pd.slug) ?? practiceSlug,
      name: resolveString(pd.name) ?? '',
      profileImage: resolveString(pd.logo) ?? null,
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
      introMessage: resolveString(pd.introMessage)
        ?? resolveString(pd.intro_message)
        ?? resolveString(detailsRecord?.introMessage)
        ?? resolveString(detailsRecord?.intro_message)
        ?? resolveString(nestedDetailsRecord?.introMessage)
        ?? resolveString(nestedDetailsRecord?.intro_message)
        ?? resolveString(nestedDetailsRecord?.overview)
        ?? resolveString(detailsRecord?.overview),
      legalDisclaimer: resolveString(pd.legalDisclaimer)
        ?? resolveString(pd.legal_disclaimer)
        ?? resolveString(pd.overview)
        ?? resolveString(detailsRecord?.legalDisclaimer)
        ?? resolveString(detailsRecord?.legal_disclaimer)
        ?? resolveString(nestedDetailsRecord?.legalDisclaimer)
        ?? resolveString(nestedDetailsRecord?.legal_disclaimer)
        ?? resolveString(nestedDetailsRecord?.overview)
        ?? resolveString(detailsRecord?.overview),
    };
  }, [data, practiceSlug]);

  const practiceConfig = useMemo<UIPracticeConfig | null>(() => {
    if (!basePracticeConfig) return null;
    if (!isPreview) return basePracticeConfig;
    return {
      ...basePracticeConfig,
      name: previewConfig.name ?? basePracticeConfig.name,
      profileImage: previewConfig.profileImage !== undefined ? previewConfig.profileImage : basePracticeConfig.profileImage,
      accentColor: previewConfig.accentColor ?? basePracticeConfig.accentColor,
      introMessage: previewConfig.introMessage !== undefined ? previewConfig.introMessage : basePracticeConfig.introMessage,
      legalDisclaimer: previewConfig.legalDisclaimer !== undefined ? previewConfig.legalDisclaimer : basePracticeConfig.legalDisclaimer,
      consultationFee: previewConfig.consultationFee !== undefined ? previewConfig.consultationFee ?? undefined : basePracticeConfig.consultationFee,
      billingIncrementMinutes: previewConfig.billingIncrementMinutes !== undefined ? previewConfig.billingIncrementMinutes : basePracticeConfig.billingIncrementMinutes,
    };
  }, [basePracticeConfig, isPreview, previewConfig]);

  const resolvedPracticeId = practiceConfig?.id || '';

  useEffect(() => {
    if (data?.practiceDetails && resolvedPracticeId) {
      const details = normalizePracticeDetailsResponse(data.practiceDetails);
      if (details) {
        setPracticeDetailsEntry(resolvedPracticeId, details);
      }
    }
  }, [data, resolvedPracticeId]);

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
      {isPreview ? (
        <WidgetPreviewApp
          practiceId={resolvedPracticeId}
          practiceConfig={practiceConfig}
          scenario={previewScenario}
          previewConfig={previewConfig}
        />
      ) : (
        <WidgetApp
          practiceId={resolvedPracticeId}
          practiceConfig={practiceConfig}
          routeConversationId={conversationId}
          bootstrapConversationId={data.conversationId}
          bootstrapSession={data.session}
        />
      )}
    </>
  );
}



function AppWithProviders() {
  return (
    <I18nextProvider i18n={i18n}>
      <Suspense fallback={<LoadingScreen />}>
        <App />
      </Suspense>
    </I18nextProvider>
  );
}

async function mountClientApp() {
  let savedTheme: string | null = null;
  try {
    savedTheme = localStorage.getItem('theme');
  } catch (_error) {
    // Session storage or local storage may be unavailable (private mode, iframe restrictions, etc.)
  }

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
