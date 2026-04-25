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
import { getSession } from '@/shared/lib/authClient';
import { MainApp } from '@/app/MainApp';
import { WidgetApp } from '@/app/WidgetApp';
import { WidgetPreviewApp } from '@/app/WidgetPreviewApp';
import { useNavigation } from '@/shared/utils/navigation';
import { usePracticeConfig } from '@/shared/hooks/usePracticeConfig';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import type { UIPracticeConfig } from '@/shared/hooks/usePracticeConfig';
import type { MinorAmount } from '../worker/types';
import { useWidgetBootstrap } from '@/shared/hooks/useWidgetBootstrap';
import { handleError as _handleError } from '@/shared/utils/errorHandler';
import { useWorkspaceResolver } from '@/shared/hooks/useWorkspaceResolver';
import {
  getWorkspaceHomePath,
} from '@/shared/utils/workspace';
import { AppGuard } from '@/app/AppGuard';
import { App404 } from '@/features/practice/components/404';
// `normalizePracticeRole` is not needed in this module; remove import.
import { LoadingScreen } from '@/shared/ui/layout/LoadingScreen';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import type { IconComponent } from '@/shared/ui/Icon';

const ExclamationIcon: IconComponent = (props) => (
  // Adapt heroicon to IconComponent signature
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  <ExclamationTriangleIcon {...(props as any)} />
);
import { WorkspacePlaceholderState } from '@/shared/ui/layout/WorkspacePlaceholderState';
import './index.css';
import { i18n, initI18n } from '@/shared/i18n';
import { initializeAccentColor } from '@/shared/utils/accentColors';
import { consumePostAuthConversationContext } from '@/shared/utils/anonymousIdentity';
import { isWidgetRuntimeContext as _isWidgetRuntimeContext, setWidgetRuntimeContext } from '@/shared/utils/widgetAuth';
import { useTheme } from '@/shared/hooks/useTheme';
import { normalizePracticeDetailsResponse, setActivePractice } from '@/shared/lib/apiClient';
import { setPracticeDetailsEntry } from '@/shared/stores/practiceDetailsStore';
import type { WidgetPreviewConfig, WidgetPreviewMessage, WidgetPreviewScenario } from '@/shared/types/widgetPreview';
import { lazy } from 'preact/compat';
const PracticeMatterCreatePage = lazy(() => import('@/features/matters/pages/PracticeMatterCreatePage').then((m) => ({ default: m.PracticeMatterCreatePage })));
const PracticeContactEditorPage = lazy(() => import('@/features/clients/pages/PracticeContactEditorPage').then((m) => ({ default: m.PracticeContactEditorPage })));
const PracticeInvoiceCreatePage = lazy(() => import('@/features/invoices/pages/PracticeInvoiceCreatePage').then((m) => ({ default: m.PracticeInvoiceCreatePage })));
const PracticeInvoiceEditPage = lazy(() => import('@/features/invoices/pages/PracticeInvoiceEditPage').then((m) => ({ default: m.PracticeInvoiceEditPage })));

const reloadPage = () => {
  if (typeof window !== 'undefined') {
    window.location.reload();
  }
};

const buildRetryAction = () => ({
  label: 'Retry',
  onClick: reloadPage,
});

const renderWorkspaceFailureState = (title: string, description: string) => (
  <WorkspacePlaceholderState
    icon={ExclamationIcon}
    title={title}
    description={description}
    primaryAction={buildRetryAction()}
  />
);

const resolveAuthenticatedHomePath = ({
  defaultWorkspace,
  fallbackSlug,
  hasPracticeMembership,
}: {
  defaultWorkspace: 'practice' | 'client' | 'public';
  fallbackSlug: string | null;
  hasPracticeMembership: boolean;
}): string | null => {
  if (!fallbackSlug) {
    return null;
  }

  return getWorkspaceHomePath(defaultWorkspace, fallbackSlug);
};

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
  const onboardingIncomplete =
    Boolean(session?.user) &&
    !session.user.is_anonymous &&
    session.user.onboarding_complete !== true;
  const shouldFetchWorkspacePractices =
    !location.path.startsWith('/public/') &&
    !location.path.startsWith('/auth') &&
    !location.path.startsWith('/pricing') &&
    // Pre-subscription users on the onboarding flow have no org yet — fetching
    // practices would produce a guaranteed 403. AppShell redirects back here
    // until `onboarding_complete` is true, so this guard is safe.
    !(location.path.startsWith('/onboarding') && onboardingIncomplete);
  const { defaultWorkspace, currentPractice, practices } = useWorkspaceResolver({
    autoFetchPractices: shouldFetchWorkspacePractices
  });
  const hasPracticeMembership = practices.length > 0 || Boolean(currentPractice?.id);
  const authenticatedHomePath = useMemo(() => {
    const fallbackSlug = currentPractice?.slug ?? practices[0]?.slug ?? null;
    return resolveAuthenticatedHomePath({
      defaultWorkspace,
      fallbackSlug,
      hasPracticeMembership,
    });
  }, [currentPractice?.slug, defaultWorkspace, hasPracticeMembership, practices]);

  useEffect(() => {
    if (sessionPending) return;
    if (session?.user && !session.user.is_anonymous) {
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
      !user?.is_anonymous &&
      user?.onboarding_complete !== true &&
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
      if (!authenticatedHomePath) {
        return;
      }
      navigate(authenticatedHomePath, true);
    }
  }, [
    authenticatedHomePath,
    location.path,
    location.url,
    navigate,
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
          <Route path="/client/:practiceSlug/settings/practice/team" component={ClientPracticeRoute} workspaceView="settings" settingsView="practice-team" />
          <Route path="/client/:practiceSlug/settings/apps" component={ClientPracticeRoute} workspaceView="settings" settingsView="apps" />
          <Route path="/client/:practiceSlug/settings/apps/:appId" component={ClientPracticeRoute} workspaceView="settings" settingsView="app-detail" />
          <Route path="/client/:practiceSlug/settings/security" component={ClientPracticeRoute} workspaceView="settings" settingsView="security" />
          <Route path="/client/:practiceSlug/settings/help" component={ClientPracticeRoute} workspaceView="settings" settingsView="help" />
          <Route path="/practice" component={App404} />
          <Route path="/practice/:practiceSlug" component={PracticeAppRoute} workspaceView="home" />
          <Route path="/practice/:practiceSlug/setup" component={PracticeAppRoute} workspaceView="setup" />
          <Route path="/practice/:practiceSlug/conversations" component={PracticeAppRoute} workspaceView="list" />
          <Route path="/practice/:practiceSlug/conversations/:conversationId" component={PracticeAppRoute} workspaceView="conversation" />
          <Route path="/practice/:practiceSlug/contacts" component={PracticeAppRoute} workspaceView="contacts" />
          <Route path="/practice/:practiceSlug/contacts/*" component={PracticeAppRoute} workspaceView="contacts" />
          <Route path="/practice/:practiceSlug/matters" component={PracticeAppRoute} workspaceView="matters" />
          <Route path="/practice/:practiceSlug/matters/*" component={PracticeAppRoute} workspaceView="matters" />
          <Route path="/practice/:practiceSlug/intakes" component={PracticeAppRoute} workspaceView="intakes" />
          <Route path="/practice/:practiceSlug/intakes/new" component={PracticeAppRoute} workspaceView="intakes" />
          <Route path="/practice/:practiceSlug/intakes/responses" component={PracticeAppRoute} workspaceView="intakes" />
          <Route path="/practice/:practiceSlug/intakes/responses/:intakeId" component={PracticeAppRoute} workspaceView="intakes" />
          <Route path="/practice/:practiceSlug/intakes/:templateSlug/edit" component={PracticeAppRoute} workspaceView="intakes" />
          <Route path="/practice/:practiceSlug/intakes/:templateSlug" component={PracticeAppRoute} workspaceView="intakes" />
          <Route path="/practice/:practiceSlug/engagements" component={PracticeAppRoute} workspaceView="engagements" />
          <Route path="/practice/:practiceSlug/engagements/:engagementId" component={PracticeAppRoute} workspaceView="engagements" />
          <Route path="/practice/:practiceSlug/reports" component={PracticeAppRoute} workspaceView="reports" />
          <Route path="/practice/:practiceSlug/reports/*" component={PracticeAppRoute} workspaceView="reports" />
          <Route path="/practice/:practiceSlug/invoices" component={PracticeAppRoute} workspaceView="invoices" />
          <Route path="/practice/:practiceSlug/invoices/new" component={PracticeAppRoute} workspaceView="invoices" />
          <Route path="/practice/:practiceSlug/invoices/:invoiceId/edit" component={PracticeAppRoute} workspaceView="invoiceDetail" />
          <Route path="/practice/:practiceSlug/invoices/:invoiceId" component={PracticeAppRoute} workspaceView="invoiceDetail" />
          <Route path="/practice/:practiceSlug/settings" component={PracticeAppRoute} workspaceView="settings" settingsView="general" />
          <Route path="/practice/:practiceSlug/settings/general" component={PracticeAppRoute} workspaceView="settings" settingsView="general" />
          <Route path="/practice/:practiceSlug/settings/notifications" component={PracticeAppRoute} workspaceView="settings" settingsView="notifications" />
          <Route path="/practice/:practiceSlug/settings/account" component={PracticeAppRoute} workspaceView="settings" settingsView="account" />
          <Route path="/practice/:practiceSlug/settings/practice" component={PracticeAppRoute} workspaceView="settings" settingsView="practice" />
          <Route path="/practice/:practiceSlug/settings/practice/payouts" component={PracticeAppRoute} workspaceView="settings" settingsView="practice-payouts" />
          <Route path="/practice/:practiceSlug/settings/practice/team" component={PracticeAppRoute} workspaceView="settings" settingsView="practice-team" />
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
  const location = useLocation();
  const { session, isPending } = useSessionContext();
  const { refetch: refetchPractices } = usePracticeManagement({ autoFetchPractices: false });
  const {
    defaultWorkspace,
    practicesLoading,
    currentPractice,
    practices,
    hasPracticeMembership,
  } = useWorkspaceResolver();
  const { navigate } = useNavigation();
  const isMountedRef = useRef(true);
  const subscriptionSyncHandledRef = useRef(false);
  const [subscriptionSyncPending, setSubscriptionSyncPending] = useState(false);
  const isSubscriptionSuccessReturn = location.query.subscription === 'success';
  const authenticatedHomePath = useMemo(() => {
    const fallbackSlug = currentPractice?.slug ?? practices[0]?.slug ?? null;
    return resolveAuthenticatedHomePath({
      defaultWorkspace,
      fallbackSlug,
      hasPracticeMembership,
    });
  }, [currentPractice?.slug, defaultWorkspace, hasPracticeMembership, practices]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isSubscriptionSuccessReturn) {
      subscriptionSyncHandledRef.current = false;
      return;
    }
    if (subscriptionSyncHandledRef.current) return;

    subscriptionSyncHandledRef.current = true;
    setSubscriptionSyncPending(true);

    void getSession()
      .then(() => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('auth:session-updated'));
        }
      })
      .catch((error) => {
        console.warn('[RootRoute] Failed to refresh session after Stripe checkout', error);
      })
      .then(() => refetchPractices())
      .catch((error) => {
        console.warn('[RootRoute] Failed to refresh practices after Stripe checkout', error);
      })
      .finally(() => {
        if (typeof window !== 'undefined') {
          const newUrl = new URL(window.location.href);
          newUrl.searchParams.delete('subscription');
          window.history.replaceState({}, '', `${newUrl.pathname}${newUrl.search}${newUrl.hash}`);
        }
        setSubscriptionSyncPending(false);
      });
  }, [isSubscriptionSuccessReturn, refetchPractices]);

  useEffect(() => {
    if (subscriptionSyncPending) return;
    if (isPending || practicesLoading) return;

    if (!session?.user) {
      navigate('/auth', true);
      return;
    }

    if (session.user.onboarding_complete !== true && !session.user.is_anonymous) {
      return;
    }

    if (isMountedRef.current && authenticatedHomePath) {
      navigate(authenticatedHomePath, true);
    }
  }, [
    authenticatedHomePath,
    subscriptionSyncPending,
    practicesLoading,
    isPending,
    navigate,
    session?.user,
  ]);

  if (
    !subscriptionSyncPending &&
    !isPending &&
    !practicesLoading &&
    session?.user &&
    !session.user.is_anonymous &&
    session.user.onboarding_complete === true &&
    !authenticatedHomePath
  ) {
    return renderWorkspaceFailureState(
      'Workspace routing failed',
      'Authenticated workspace routing could not be resolved because no practice slug was available.'
    );
  }

  if (subscriptionSyncPending) {
    return <LoadingScreen />;
  }

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
  workspaceView?: 'home' | 'setup' | 'list' | 'conversation' | 'intakes' | 'intakeDetail' | 'engagements' | 'matters' | 'contacts' | 'invoices' | 'invoiceDetail' | 'reports' | 'settings';
  settingsView?: 'general' | 'notifications' | 'account' | 'practice' | 'practice-payouts' | 'practice-team' | 'apps' | 'app-detail' | 'security' | 'help';
  practiceSlug?: string;
}) {
  const location = useLocation();
  const { session, isPending, activeMemberRole: _activeMemberRole } = useSessionContext();
  const normalizedPracticeSlug = (practiceSlug ?? '').trim();
  const hasPracticeSlug = normalizedPracticeSlug.length > 0;
  const {
    activeRole,
    canAccessPracticeWorkspace: canAccessPractice,
    rolePending,
    hasPracticeMembership,
    practicesLoading,
    currentPractice,
  } = useWorkspaceResolver({
    practiceSlug: practiceSlug ?? null,
  });
  const resolvedPracticeId = currentPractice?.id ?? '';
  const isMatterCreateRoute = workspaceView === 'matters' && location.path.endsWith('/matters/new');
  const isContactCreateRoute = workspaceView === 'contacts' && location.path.endsWith('/contacts/new');
  const isInvoiceCreateRoute = workspaceView === 'invoices' && location.path.endsWith('/invoices/new');
  const isInvoiceEditRoute = workspaceView === 'invoiceDetail' && location.path.endsWith('/edit');
  const practiceConfig = useMemo<UIPracticeConfig>(() => ({
    id: currentPractice?.id ?? '',
    slug: currentPractice?.slug ?? normalizedPracticeSlug,
    name: currentPractice?.name ?? '',
    profileImage: currentPractice?.logo ?? null,
    description: '',
    availableServices: [],
    serviceQuestions: {},
    domain: '',
    brandColor: '#000000',
    accentColor: currentPractice?.accentColor ?? 'gold',
    voice: {
      enabled: false,
      provider: 'cloudflare',
      voiceId: null,
      displayName: null,
      previewUrl: null,
    },
  }), [currentPractice, normalizedPracticeSlug]);
  const sessionRecord = session?.session as Record<string, unknown> | undefined;
  // Use backend canonical field `active_organization_id` only
  const backendActiveOrgId = typeof sessionRecord?.active_organization_id === 'string'
    ? sessionRecord.active_organization_id
    : null;

  useEffect(() => {
    if (isPending || !session?.user || !resolvedPracticeId) return;

    // If the backend session doesn't match the route-selected practice ID,
    // synchronize it to ensure correct permission/role resolution.
    if (resolvedPracticeId && backendActiveOrgId !== resolvedPracticeId) {
      let cancelled = false;

      void setActivePractice(resolvedPracticeId)
        .then(() => getSession())
        .then(() => {
          if (cancelled || typeof window === 'undefined') return;
          window.dispatchEvent(new CustomEvent('auth:session-updated'));
        })
        .catch((err) => {
          console.warn('[PracticeAppRoute] Failed to switch active practice context:', err);
        });

      return () => {
        cancelled = true;
      };
    }
  }, [resolvedPracticeId, session?.user, isPending, backendActiveOrgId]);

  // Only block on loading if we have no practice data yet. If currentPractice
  // is already available (from the module cache), proceed immediately —
  // don't hang on stale loading flags from other hook instances.
  // Note: We MUST wait for rolePending, otherwise canAccessPractice will be false!
  const stillLoading = isPending || (practicesLoading && !currentPractice) || rolePending;
  
  if (stillLoading) {
    return <LoadingScreen />;
  }

  // If the user is a client and cannot access practice workspaces, show
  // the access-denied UI after initial loading guards so we don't incorrectly
  // render access-denied while required data is still loading.
  if (activeRole === 'client' && !canAccessPractice) {
    return renderWorkspaceFailureState(
      'Practice access denied',
      'Practice routes are unavailable to client members.'
    );
  }

  if (!hasPracticeSlug) {
    return <App404 />;
  }

  if (!session?.user) {
    return <AuthPage />;
  }

  if (!canAccessPractice) {
    if (!hasPracticeMembership) {
      return <App404 />;
    }
    return renderWorkspaceFailureState(
      'Practice access denied',
      'This account cannot open the requested practice workspace route.'
    );
  }
  if (!currentPractice) {
    return <App404 />;
  }
  if (!resolvedPracticeId) return <LoadingScreen />;

  if (isMatterCreateRoute) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <PracticeMatterCreatePage
          practiceId={resolvedPracticeId}
          practiceSlug={normalizedPracticeSlug || null}
        />
      </Suspense>
    );
  }

  if (isContactCreateRoute) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <PracticeContactEditorPage
          practiceId={resolvedPracticeId}
          practiceSlug={normalizedPracticeSlug || null}
        />
      </Suspense>
    );
  }

  if (isInvoiceCreateRoute) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <PracticeInvoiceCreatePage
          practiceId={resolvedPracticeId}
          practiceSlug={normalizedPracticeSlug || null}
        />
      </Suspense>
    );
  }

  if (isInvoiceEditRoute) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <PracticeInvoiceEditPage
          practiceId={resolvedPracticeId}
          practiceSlug={normalizedPracticeSlug || null}
          invoiceId={invoiceId ?? null}
        />
      </Suspense>
    );
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
  settingsView?: 'general' | 'notifications' | 'account' | 'practice' | 'practice-payouts' | 'practice-team' | 'apps' | 'app-detail' | 'security' | 'help';
}) {
  const location = useLocation();
  const { session, isPending: sessionIsPending } = useSessionContext();
  const {
    rolePending,
    canAccessClientWorkspace,
    practicesLoading,
    currentPractice,
  } = useWorkspaceResolver({
    practiceSlug: practiceSlug ?? null,
  });
  const { navigate } = useNavigation();

  const slug = (practiceSlug ?? '').trim();
  const resolvedPracticeId = currentPractice?.id ?? '';
  const practiceConfig = useMemo<UIPracticeConfig>(() => ({
    id: currentPractice?.id ?? '',
    slug: currentPractice?.slug ?? slug,
    name: currentPractice?.name ?? '',
    profileImage: currentPractice?.logo ?? null,
    description: '',
    availableServices: [],
    serviceQuestions: {},
    domain: '',
    brandColor: '#000000',
    accentColor: currentPractice?.accentColor ?? 'gold',
    voice: {
      enabled: false,
      provider: 'cloudflare',
      voiceId: null,
      displayName: null,
      previewUrl: null,
    },
  }), [currentPractice, slug]);

  const accessFailureMessage = useMemo(() => {
    if (sessionIsPending || practicesLoading || rolePending) return null;
    if (!session?.user || canAccessClientWorkspace) return null;

    return 'This account cannot open the client workspace for the current route.';
  }, [
    canAccessClientWorkspace,
    practicesLoading,
    rolePending,
    session?.user,
    sessionIsPending,
  ]);

  useEffect(() => {
    if (!slug || sessionIsPending) return;
    if (!canAccessClientWorkspace) return;
    if (workspaceView === 'home') {
      navigate(`/client/${encodeURIComponent(slug)}/conversations`, true);
    }
  }, [canAccessClientWorkspace, workspaceView, slug, navigate, sessionIsPending]);

  if (sessionIsPending || practicesLoading || rolePending) {
    return <LoadingScreen />;
  }

  if (!slug) {
    return <App404 />;
  }

  if (!session?.user) {
    return <AuthPage />;
  }

  if (!canAccessClientWorkspace) {
    if (accessFailureMessage) {
      return renderWorkspaceFailureState('Practice access denied', accessFailureMessage);
    }
    return <LoadingScreen />;
  }

  if (!currentPractice) {
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
  workspaceView: _workspaceView = 'home'
}: {
  practiceSlug?: string;
  conversationId?: string;
  workspaceView?: 'home' | 'list' | 'conversation' | 'matters';
}) {
  const location = useLocation();
  const { session: _session, isPending: _sessionIsPending, activeMemberRole: _activeMemberRole } = useSessionContext();
  const { navigate: _navigate } = useNavigation();
  const _handlePracticeError = useCallback((error: string) => {
    console.error('Practice config error:', error);
  }, []);

  const slug = (practiceSlug ?? '').trim();
  const isWidget = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('v') === 'widget'
    : (location.query?.v === 'widget'
      || /(?:^|[?&])v=widget(?:[&#]|$)/.test(location.url ?? ''));

  // --- Widget bootstrap and preview state ---
  const { data, isLoading, error } = useWidgetBootstrap(slug, isWidget);
  
  // isPreview should ONLY be true if we are in widget mode AND the preview flag is explicitly set.
  // The WidgetPreviewFrame in settings passes preview=1.
  const isPreview = isWidget && (
    (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('preview') === '1') ||
    location.query?.preview === '1'
  );

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
      profileImage: resolveString(pd.logo) ?? undefined,
      description: description ?? '',
      availableServices: [],
      serviceQuestions: {},
      domain: '',
      brandColor: '#000000',
      accentColor: accentColor ?? 'gold',
      voice: {
        enabled: false,
        provider: 'cloudflare',
        voiceId: undefined,
        displayName: undefined,
        previewUrl: undefined,
      },
      consultationFee: (resolveNumber(pd.consultation_fee) ?? resolveNumber(detailsRecord?.consultationFee)) as MinorAmount | undefined,
      paymentUrl: resolveString(pd.payment_url) ?? resolveString(detailsRecord?.paymentUrl),
      calendlyUrl: resolveString(pd.calendly_url) ?? resolveString(detailsRecord?.calendlyUrl),
      isPublic: resolveBoolean(pd.is_public) ?? resolveBoolean(detailsRecord?.isPublic),
      billingIncrementMinutes: resolveNumber(pd.billing_increment_minutes) ?? resolveNumber(detailsRecord?.billingIncrementMinutes) ?? undefined,
      introMessage: resolveString(pd.introMessage)
        ?? resolveString(pd.intro_message)
        ?? resolveString(detailsRecord?.introMessage)
        ?? resolveString(detailsRecord?.intro_message)
        ?? resolveString(nestedDetailsRecord?.introMessage)
        ?? resolveString(nestedDetailsRecord?.intro_message),
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
      profileImage: previewConfig.profileImage !== undefined ? (previewConfig.profileImage ?? undefined) : basePracticeConfig.profileImage,
      accentColor: previewConfig.accentColor ?? basePracticeConfig.accentColor,
      introMessage: previewConfig.introMessage !== undefined ? (previewConfig.introMessage ?? undefined) : basePracticeConfig.introMessage,
      legalDisclaimer: previewConfig.legalDisclaimer !== undefined ? (previewConfig.legalDisclaimer ?? undefined) : basePracticeConfig.legalDisclaimer,
      consultationFee: (previewConfig.consultationFee !== undefined ? (previewConfig.consultationFee ?? undefined) : basePracticeConfig.consultationFee) as MinorAmount | undefined,
      billingIncrementMinutes: previewConfig.billingIncrementMinutes !== undefined ? (previewConfig.billingIncrementMinutes ?? undefined) : basePracticeConfig.billingIncrementMinutes,
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
          intakeTemplate={data.intakeTemplate ?? null}
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
      {
        const mountEl = document.getElementById('app');
        if (mountEl) hydrate(<AppWithProviders />, mountEl);
      }
    })
    .catch((_error) => {
      console.error('Failed to initialize i18n:', _error);
      {
        const mountEl = document.getElementById('app');
        if (mountEl) hydrate(<AppWithProviders />, mountEl);
      }
    });
}

if (typeof window !== 'undefined') {
  mountClientApp();
}

export async function prerender() {
  await initI18n();
  return await ssr(<AppWithProviders />);
}
