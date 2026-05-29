import { hydrate, prerender as ssr, Router, Route, useLocation, LocationProvider } from 'preact-iso';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Suspense } from 'preact/compat';
import { I18nextProvider } from 'react-i18next';
import { SEOHead } from '@/app/SEOHead';
import { ToastProvider } from '@/shared/contexts/ToastContext';
import { CommandPaletteProvider } from '@/features/search/contexts/CommandPaletteContext';
import { SessionProvider, useSessionContext } from '@/shared/contexts/SessionContext';
import { authClient } from '@/shared/lib/authClient';
import type { WorkspaceView } from '@/shared/utils/workspaceShell';
import type { SettingsView } from '@/features/settings/pages/SettingsContent';
import { PublicWorkspaceRoute } from '@/app/PublicWorkspaceRoute';
import { useNavigation } from '@/shared/utils/navigation';
import { usePracticeConfig } from '@/shared/hooks/usePracticeConfig';
import type { UIPracticeConfig } from '@/shared/hooks/usePracticeConfig';
import { handleError as _handleError } from '@/shared/utils/errorHandler';
import { useWorkspaceResolver } from '@/shared/hooks/useWorkspaceResolver';
import {
  getWorkspaceHomePath,
} from '@/shared/utils/workspace';
import { AlertTriangle } from 'lucide-preact';
import { AppGuard } from '@/app/AppGuard';
import { AuthBootGate } from '@/app/AuthBootGate';
import { App404 } from '@/features/practice/components/404';
// `normalizePracticeRole` is not needed in this module; remove import.
import { LoadingScreen } from '@/shared/ui/layout/LoadingScreen';

import type { IconComponent } from '@/shared/ui/Icon';

const ExclamationIcon: IconComponent = (props) => (
  // Adapt heroicon to IconComponent signature
  // Heroicons types are incompatible with our IconComponent; forced cast is required
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  <AlertTriangle {...(props as any)} />
);
import { WorkspacePlaceholderState } from '@/shared/ui/layout/WorkspacePlaceholderState';
import { ErrorBoundary } from '@/app/ErrorBoundary';
import { ChunkLoadFallback } from '@/shared/ui/layout/LazyRouteBoundary';
import './index.css';
import { i18n, initI18n } from '@/shared/i18n';
import { registerSWWithUpdatePrompt } from '@/shared/lib/swUpdate';
import { UpdateAvailableToast } from '@/shared/ui/UpdateAvailableToast';
import { consumePostAuthConversationContext } from '@/shared/utils/anonymousIdentity';
import { isWidgetRuntimeContext as _isWidgetRuntimeContext } from '@/shared/utils/widgetAuth';
import { useTheme } from '@/shared/hooks/useTheme';
import { lazy } from 'preact/compat';
// Top-level pages are lazy so they don't bloat the entry chunk. Each page
// loads its own bundle on demand the first time the matching route renders.
const AuthPage = lazy(() => import('@/pages/AuthPage'));
const AcceptInvitationPage = lazy(() => import('@/pages/AcceptInvitationPage'));
const PracticeHomePage = lazy(() => import('@/pages/PracticeHomePage'));
const OnboardingPage = lazy(() => import('@/pages/OnboardingPage'));
const PricingPage = lazy(() => import('@/pages/PricingPage'));
const PaymentResultPage = lazy(() => import('@/pages/PaymentResultPage'));
const OAuthConsentPage = lazy(() => import('@/pages/OAuthConsentPage'));
const ApproveActionPage = lazy(() => import('@/pages/ApproveActionPage'));
// Debug pages — never used in real flows but were eating into the entry
// chunk because of the static imports. Lazy is the cheapest way to keep
// them mounted-by-route while excluding their code from first-load.
const DebugStylesPage = lazy(() => import('@/pages/DebugStylesPage'));
const DebugDialogsPage = lazy(() => import('@/pages/DebugDialogsPage'));
const DebugChatPage = lazy(() => import('@/pages/DebugChatPage'));
const DebugConversationsPage = lazy(() => import('@/pages/DebugConversationsPage'));
const DebugMatterPage = lazy(() => import('@/pages/DebugMatterPage'));
const ClientEngagementReviewPage = lazy(() => import('@/features/engagements/pages/ClientEngagementReviewPage').then((m) => ({ default: m.ClientEngagementReviewPage })));
// MainApp is the workspace shell — it carries the chat composer, file
// upload pipeline, presence provider, etc. Lazy so the browser only loads
// it once the user lands on a route that mounts a workspace.
const MainApp = lazy(() => import('@/app/MainApp').then((m) => ({ default: m.MainApp })));
const AdminIntakeInspectorPage = lazy(() => import('@/pages/AdminIntakeInspectorPage'));
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

const describeError = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown runtime error';
};

const resolveAuthenticatedHomePath = ({
  fallbackSlug,
  hasPracticeMembership,
}: {
  fallbackSlug: string | null;
  hasPracticeMembership: boolean;
}): string | null => {
  if (!hasPracticeMembership || !fallbackSlug) {
    return null;
  }

  return getWorkspaceHomePath('practice', fallbackSlug);
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


// Chunk-load failure recovery. Dynamic imports can fail after a deploy when
// the SW has cached an HTML 404 response for a hashed JS asset (the CDN edge
// returned HTML during the brief propagation window). These errors surface as
// unhandled rejections before Preact mounts, so ErrorBoundary can't catch them.
// We delete the bad SW cache entry for the specific URL, then reload once.
// sessionStorage guards against an infinite reload loop.
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    const msg = String((event.reason as Error | null)?.message ?? event.reason ?? '');
    if (!msg.includes('dynamically imported module')) return;
    event.preventDefault();

    const reloadKey = 'chunk-error-reloaded-at';
    try {
      const lastAt = Number(sessionStorage.getItem(reloadKey) ?? 0);
      if (Date.now() - lastAt < 30_000) return;
      sessionStorage.setItem(reloadKey, String(Date.now()));
    } catch {
      // sessionStorage unavailable — reload unconditionally
    }

    const urlMatch = msg.match(/https?:\/\/\S+\.js/);
    const badUrl = urlMatch?.[0];
    const doReload = () => window.location.reload();

    if (badUrl && typeof caches !== 'undefined') {
      void caches.keys()
        .then((keys) => Promise.all(keys.map((k) => caches.open(k).then((c) => c.delete(badUrl)))))
        .finally(doReload);
    } else {
      doReload();
    }
  });
}

// Dev Cache Trap Breaker (Development Only)
//
// PWA is disabled in dev (vite.config.ts → devOptions.enabled: false), but a
// service worker registered during a prior production session — or a leftover
// CacheStorage entry from one — aggressively intercepts requests and serves
// stale assets, breaking HMR and forcing hard refreshes.
//
// On dev boot we:
//   1. Await unregister() for every active registration (the previous version
//      fired-and-forgot, racing the reload below).
//   2. Delete every CacheStorage key — unregistering the SW does NOT clear
//      caches, and any remaining cache could still answer fetches from a
//      leftover client.
//   3. Reload only if we actually cleared something, so we don't loop.
if (import.meta.env.DEV && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  void (async () => {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      const cacheKeys = typeof caches !== 'undefined' ? await caches.keys() : [];
      if (registrations.length === 0 && cacheKeys.length === 0) return;

      await Promise.all(registrations.map((r) => r.unregister()));
      await Promise.all(cacheKeys.map((k) => caches.delete(k)));

      if (registrations.length > 0) {
        console.warn(`⚠️ Unregistered ${registrations.length} rogue dev service worker(s).`);
      }
      if (cacheKeys.length > 0) {
        console.warn(`🧹 Cleared ${cacheKeys.length} CacheStorage entry/entries.`);
      }
      console.warn('🔄 Reloading to escape the cache trap...');
      window.location.reload();
    } catch (error) {
      console.warn('[dev cache breaker] failed to clear SW / caches', error);
    }
  })();
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
        <AuthBootGate>
          <AppGuard>
            <AppShell />
          </AppGuard>
        </AuthBootGate>
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
    !session?.user?.is_anonymous &&
    session?.user?.onboarding_complete !== true;
  const isPublicRoute = location.path.startsWith('/public/');
  const isAuthRoute = location.path.startsWith('/auth');
  const isPricingRoute = location.path.startsWith('/pricing');
  const isClientRoute = location.path.startsWith('/client/');
  const shouldFetchWorkspacePractices =
    !isPublicRoute &&
    !isAuthRoute &&
    !isPricingRoute &&
    (!onboardingIncomplete || isClientRoute);
  const {
    currentPractice,
    hasPracticeMembership,
    practicesLoading,
    practicesError,
  } = useWorkspaceResolver({
    autoFetchPractices: shouldFetchWorkspacePractices
  });


  const authenticatedHomePath = useMemo(() => {
    const fallbackSlug = currentPractice?.slug ?? null;
    return resolveAuthenticatedHomePath({
      fallbackSlug,
      hasPracticeMembership,
    });
  }, [currentPractice?.slug, hasPracticeMembership]);

  useEffect(() => {
    if (sessionPending) return;
    if (practicesLoading) return;
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
    practicesLoading,
    session?.user,
    sessionPending
  ]);

  const paletteWorkspace: 'practice' | 'client' | 'public' =
    location.path.startsWith('/practice/')
      ? 'practice'
      : location.path.startsWith('/client/')
        ? 'client'
        : 'public';
  const paletteSlug = currentPractice?.slug ?? null;
  const palettePracticeId = currentPractice?.id ?? null;
  const paletteEligible =
    Boolean(session?.user) &&
    !session?.user?.is_anonymous &&
    paletteWorkspace !== 'public' &&
    Boolean(palettePracticeId);

  if (practicesError) {
    return renderWorkspaceFailureState('Workspace failed to load', practicesError);
  }

  return (
    <ToastProvider>
      <UpdateAvailableToast />
      <CommandPaletteProvider
        practiceId={palettePracticeId}
        practiceSlug={paletteSlug}
        workspace={paletteWorkspace}
        enabled={paletteEligible}
      >
      <Suspense fallback={<LoadingScreen />}>
        <Router>
          <Route path="/auth" component={(props) => (
            <Suspense fallback={<LoadingScreen />}>
              <AuthPage {...props} />
            </Suspense>
          )} />
          <Route path="/auth/accept-invitation" component={(props) => (
            <Suspense fallback={<LoadingScreen />}>
              <AcceptInvitationPage {...props} />
            </Suspense>
          )} />
          <Route path="/pricing" component={(props) => (
            <Suspense fallback={<LoadingScreen />}>
              <PricingPage {...props} />
            </Suspense>
          )} />
          <Route path="/onboarding" component={(props) => (
            <Suspense fallback={<LoadingScreen />}>
              <OnboardingPage {...props} />
            </Suspense>
          )} />
          <Route path="/debug/styles" component={DevDebugStylesRoute} />
          <Route path="/debug/dialogs" component={DevDebugDialogsRoute} />
          <Route path="/debug/dialogs/:previewId" component={DevDebugDialogPreviewRoute} />
          <Route path="/debug/chat" component={DevDebugChatRoute} />
          <Route path="/debug/conversations" component={DevDebugConversationsRoute} />
          <Route path="/debug/matters" component={DevDebugMatterRoute} />
          <Route path="/pay" component={PayRedirect} />
          <Route path="/public/:practiceSlug/welcome" component={(props) => <PublicWorkspaceRoute {...props} shell="marketing" />} />
          <Route path="/public/:practiceSlug/intake/:templateSlug" component={PublicWorkspaceRoute} />
          <Route path="/public/:practiceSlug" component={PublicWorkspaceRoute} />
          <Route path="/public/:practiceSlug/conversations" component={PublicWorkspaceRoute} />
          <Route path="/public/:practiceSlug/conversations/:conversationId" component={PublicWorkspaceRoute} />
          <Route path="/public/:practiceSlug/matters" component={PublicWorkspaceRoute} />
          <Route path="/client" component={App404} />
          <Route path="/client/dashboard" component={App404} />
          <Route path="/client/:practiceSlug" component={ClientPracticeRoute} workspaceView="home" />
          <Route path="/client/:practiceSlug/conversations" component={ClientPracticeRoute} workspaceView="list" />
          <Route path="/client/:practiceSlug/conversations/:conversationId" component={ClientPracticeRoute} workspaceView="conversation" />
          <Route path="/client/:practiceSlug/matters" component={ClientPracticeRoute} workspaceView="matters" />
          <Route path="/client/:practiceSlug/matters/*" component={ClientPracticeRoute} workspaceView="matters" />
          <Route path="/client/:practiceSlug/engagements/:engagementId/review" component={ClientEngagementReviewRoute} />
          <Route path="/client/:practiceSlug/invoices" component={ClientPracticeRoute} workspaceView="invoices" />
          <Route path="/client/:practiceSlug/invoices/:invoiceId" component={ClientPracticeRoute} workspaceView="invoiceDetail" />
          <Route path="/client/:practiceSlug/intakes" component={ClientPracticeRoute} workspaceView="intakes" />
          <Route path="/client/:practiceSlug/intakes/:intakeId" component={ClientPracticeRoute} workspaceView="intakeDetail" />
          <Route path="/client/:practiceSlug/files" component={ClientPracticeRoute} workspaceView="files" />
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
          <Route path="/practice/:practiceSlug/assistant" component={PracticeAppRoute} workspaceView="assistant" />
          <Route path="/practice/:practiceSlug/assistant/:conversationId" component={PracticeAppRoute} workspaceView="assistant" />
          <Route path="/practice/:practiceSlug/conversations" component={PracticeAppRoute} workspaceView="list" />
          <Route path="/practice/:practiceSlug/conversations/:conversationId" component={PracticeAppRoute} workspaceView="conversation" />
          <Route path="/practice/:practiceSlug/contacts" component={PracticeAppRoute} workspaceView="contacts" />
          <Route path="/practice/:practiceSlug/contacts/*" component={PracticeAppRoute} workspaceView="contacts" />
          <Route path="/practice/:practiceSlug/matters" component={PracticeAppRoute} workspaceView="matters" />
          <Route path="/practice/:practiceSlug/matters/*" component={PracticeAppRoute} workspaceView="matters" />
          <Route path="/practice/:practiceSlug/intakes/responses" component={PracticeAppRoute} workspaceView="intakes" />
          <Route path="/practice/:practiceSlug/intakes/responses/:intakeId" component={PracticeAppRoute} workspaceView="intakes" />
          <Route path="/practice/:practiceSlug/intakes/forms" component={PracticeAppRoute} workspaceView="intakes" />
          <Route path="/practice/:practiceSlug/intakes/forms/new" component={PracticeAppRoute} workspaceView="intakes" />
          <Route path="/practice/:practiceSlug/intakes/forms/:templateSlug/edit" component={PracticeAppRoute} workspaceView="intakes" />
          <Route path="/practice/:practiceSlug/intakes/forms/:templateSlug" component={PracticeAppRoute} workspaceView="intakes" />
          <Route path="/practice/:practiceSlug/engagements" component={PracticeAppRoute} workspaceView="engagements" />
          <Route path="/practice/:practiceSlug/engagements/:engagementId" component={PracticeAppRoute} workspaceView="engagements" />
          <Route path="/practice/:practiceSlug/files" component={PracticeAppRoute} workspaceView="files" />
          <Route path="/practice/:practiceSlug/reports" component={PracticeAppRoute} workspaceView="reports" />
          <Route path="/practice/:practiceSlug/reports/deliveries/:reportDeliveryId" component={PracticeAppRoute} workspaceView="reports" />
          <Route path="/practice/:practiceSlug/reports/*" component={PracticeAppRoute} workspaceView="reports" />
          <Route path="/practice/:practiceSlug/invoices" component={PracticeAppRoute} workspaceView="invoices" />
          <Route path="/practice/:practiceSlug/invoices/new" component={PracticeAppRoute} workspaceView="invoices" />
          <Route path="/practice/:practiceSlug/invoices/:invoiceId/edit" component={PracticeAppRoute} workspaceView="invoiceDetail" />
          <Route path="/practice/:practiceSlug/invoices/:invoiceId" component={PracticeAppRoute} workspaceView="invoiceDetail" />
          <Route path="/practice/:practiceSlug/settings" component={PracticeAppRoute} workspaceView="settings" settingsView="general" />
          <Route path="/practice/:practiceSlug/settings/general" component={PracticeAppRoute} workspaceView="settings" settingsView="general" />
          <Route path="/practice/:practiceSlug/settings/notifications" component={PracticeAppRoute} workspaceView="settings" settingsView="notifications" />
          <Route path="/practice/:practiceSlug/settings/account" component={PracticeAppRoute} workspaceView="settings" settingsView="account" />
          <Route path="/practice/:practiceSlug/coverage" component={PracticeAppRoute} workspaceView="coverage" />
          <Route path="/practice/:practiceSlug/settings/practice" component={PracticeAppRoute} workspaceView="settings" settingsView="practice" />
          <Route path="/practice/:practiceSlug/settings/practice/payouts" component={PracticeAppRoute} workspaceView="settings" settingsView="practice-payouts" />
          <Route path="/practice/:practiceSlug/settings/practice/team" component={PracticeAppRoute} workspaceView="settings" settingsView="practice-team" />
          <Route path="/practice/:practiceSlug/settings/practice/engagement-templates" component={PracticeAppRoute} workspaceView="settings" settingsView="engagement-templates" />
          <Route path="/practice/:practiceSlug/settings/apps" component={PracticeAppRoute} workspaceView="settings" settingsView="apps" />
          <Route path="/practice/:practiceSlug/settings/apps/:appId" component={PracticeAppRoute} workspaceView="settings" settingsView="app-detail" />
          <Route path="/practice/:practiceSlug/settings/security" component={PracticeAppRoute} workspaceView="settings" settingsView="security" />
          <Route path="/practice/:practiceSlug/settings/help" component={PracticeAppRoute} workspaceView="settings" settingsView="help" />
          <Route path="/p/:practiceSlug" component={({ practiceSlug }: { practiceSlug?: string }) => <PaymentResultPage practiceSlug={practiceSlug} />} />
          {/* U10: engineer-only intake inspector. The worker route is gated by
              the engineer email allowlist; this page surfaces a friendly
              "not authorized" message when the API returns 403. */}
          <Route path="/admin/intake-inspector" component={() => (
            <Suspense fallback={<LoadingScreen />}>
              <AdminIntakeInspectorPage />
            </Suspense>
          )} />
          <Route path="/admin/intake-inspector/:conversationId" component={({ conversationId }: { conversationId?: string }) => (
            <Suspense fallback={<LoadingScreen />}>
              <AdminIntakeInspectorPage conversationId={conversationId} />
            </Suspense>
          )} />
          <Route path="/oauth/consent" component={(props) => (
            <Suspense fallback={<LoadingScreen />}>
              <OAuthConsentPage {...props} />
            </Suspense>
          )} />
          <Route path="/approve/:jwt" component={({ jwt }: { jwt?: string }) => (
            <Suspense fallback={<LoadingScreen />}>
              <ApproveActionPage jwt={jwt} />
            </Suspense>
          )} />
          <Route path="/" component={RootRoute} />
          <Route default component={App404} />
        </Router>
      </Suspense>
      </CommandPaletteProvider>
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
        icon={AlertTriangle}
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
  const completedOnboarding = Boolean(
    session?.user &&
    !session.user.is_anonymous &&
    session.user.onboarding_complete === true
  );
  const shouldFetchRootPractices = Boolean(completedOnboarding);
  const {
    practicesLoading,
    practicesError,
    currentPractice,
    practices,
    hasPracticeMembership,
  } = useWorkspaceResolver({
    autoFetchPractices: shouldFetchRootPractices,
  });
  const { navigate } = useNavigation();
  const isMountedRef = useRef(true);
  const subscriptionSyncHandledRef = useRef(false);
  const [subscriptionSyncPending, setSubscriptionSyncPending] = useState(false);
  const [subscriptionSyncError, setSubscriptionSyncError] = useState<unknown>(null);
  const isSubscriptionSuccessReturn = location.query.subscription === 'success';
  const subscriptionSuccessPracticeId =
    isSubscriptionSuccessReturn && typeof location.query.practiceId === 'string'
      ? location.query.practiceId.trim()
      : '';
  const authenticatedHomePath = useMemo(() => {
    if (!shouldFetchRootPractices) return null;
    // On subscription-success return, pin navigation to the org that just
    // subscribed (from the URL) so we don't race the practices refetch against
    // the restored active org and strand the user on the wrong workspace.
    const subscribedSlug = subscriptionSuccessPracticeId
      ? practices.find((practice) => practice.id === subscriptionSuccessPracticeId)?.slug ?? null
      : null;
    const fallbackSlug = subscribedSlug ?? currentPractice?.slug ?? null;
    return resolveAuthenticatedHomePath({
      fallbackSlug,
      hasPracticeMembership,
    });
  }, [currentPractice?.slug, hasPracticeMembership, practices, shouldFetchRootPractices, subscriptionSuccessPracticeId]);

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
    setSubscriptionSyncError(null);
    setSubscriptionSyncPending(true);

    void (async () => {
      try {
        // Restore the org that actually subscribed. buildSuccessUrl appends
        // practiceId to the Stripe return URL so the session can be aligned
        // before subscription-gated routes run.
        if (subscriptionSuccessPracticeId) {
          await authClient.organization.setActive({ organizationId: subscriptionSuccessPracticeId });
        }
      } catch (error) {
        if (isMountedRef.current) {
          setSubscriptionSyncError(error);
        }
      } finally {
        if (typeof window !== 'undefined') {
          const newUrl = new URL(window.location.href);
          newUrl.searchParams.delete('subscription');
          newUrl.searchParams.delete('practiceId');
          window.history.replaceState({}, '', `${newUrl.pathname}${newUrl.search}${newUrl.hash}`);
        }
        if (isMountedRef.current) {
          setSubscriptionSyncPending(false);
        }
      }
    })();
  }, [isSubscriptionSuccessReturn, subscriptionSuccessPracticeId]);

  useEffect(() => {
    if (subscriptionSyncPending) return;
    if (isPending || (shouldFetchRootPractices && practicesLoading)) return;

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
    shouldFetchRootPractices,
  ]);

  if (subscriptionSyncError || practicesError) {
    return renderWorkspaceFailureState(
      'Workspace session failed',
      subscriptionSyncError ? describeError(subscriptionSyncError) : (practicesError ?? 'Failed to load practices')
    );
  }

  if (
    !subscriptionSyncPending &&
    !isPending &&
    !practicesLoading &&
    session?.user &&
    !session.user.is_anonymous &&
    session.user.onboarding_complete === true &&
    shouldFetchRootPractices &&
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
  reportDeliveryId,
  appId,
  workspaceView = 'home',
  settingsView = 'general',
  practiceSlug
}: {
  conversationId?: string;
  invoiceId?: string;
  reportDeliveryId?: string;
  appId?: string;
  workspaceView?: WorkspaceView;
  settingsView?: SettingsView;
  practiceSlug?: string;
}) {
  const location = useLocation();
  const { session, isPending } = useSessionContext();
  const normalizedPracticeSlug = (practiceSlug ?? '').trim();
  const hasPracticeSlug = normalizedPracticeSlug.length > 0;
  const {
    activeRole,
    canAccessPracticeWorkspace: canAccessPractice,
    rolePending,
    hasPracticeMembership,
    practicesLoading,
    practicesError,
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
    profileImage: currentPractice?.logo || undefined,
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

    // Only sync when the resolver's currentPractice is for the URL we are on.
    // Without this gate, a stale practices snapshot (e.g. right after a new
    // org was created via the switcher) makes currentPractice fall back to a
    // *different* practice, and we'd set the active org to the OLD id —
    // reverting the switcher's intentional setActive call. See feat/org-switcher
    // bug investigation 2026-05-22.
    const resolverMatchesUrl =
      hasPracticeSlug && currentPractice?.slug === normalizedPracticeSlug;
    if (!resolverMatchesUrl) return;

    // During a switcher-driven route transition, this OLD route can still be
    // mounted while `session.active_organization_id` has already been flipped
    // to the destination org. Its effect would then revert backend to *this*
    // route's old practice id. Guard by re-checking the live URL against this
    // route's slug — if the user has already navigated away, do not revert.
    const liveUrlSegment = `/practice/${encodeURIComponent(normalizedPracticeSlug)}`;
    if (!location.path.startsWith(liveUrlSegment)) return;

    // If the backend session doesn't match the route-selected practice ID,
    // synchronize it to ensure correct permission/role resolution.
    if (resolvedPracticeId && backendActiveOrgId !== resolvedPracticeId) {
      let cancelled = false;

      void authClient.organization.setActive({ organizationId: resolvedPracticeId })
        .catch((err) => {
          if (cancelled) return;
          console.warn('[PracticeAppRoute] Failed to switch active practice context:', err);
        });

      return () => {
        cancelled = true;
      };
    }
  }, [
    resolvedPracticeId,
    session?.user,
    isPending,
    backendActiveOrgId,
    currentPractice?.slug,
    normalizedPracticeSlug,
    hasPracticeSlug,
    location.path,
  ]);

  // Only block on loading if we have no practice data yet. If currentPractice
  // is already available (from the module cache), proceed immediately —
  // don't hang on stale loading flags from other hook instances.
  // Note: We MUST wait for rolePending, otherwise canAccessPractice will be false!
  const stillLoading = isPending || (practicesLoading && !currentPractice) || rolePending;

  if (stillLoading) {
    return <LoadingScreen />;
  }

  if (practicesError) {
    return renderWorkspaceFailureState('Practice failed to load', practicesError);
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

  if (workspaceView === 'home') {
    // PracticeHomePage is lazy(); wrap in Suspense so its first-load suspension
    // is caught locally (matches the pattern used by the other workspace routes
    // below). Without this, the suspension bubbles all the way to App's outer
    // Suspense and that boundary fails to render its fallback cleanly.
    return (
      <Suspense fallback={<LoadingScreen />}>
        <PracticeHomePage />
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
    <>
      <ErrorBoundary fallback={<ChunkLoadFallback />}>
        <Suspense fallback={<LoadingScreen />}>
          <MainApp
            practiceId={resolvedPracticeId}
            practiceConfig={practiceConfig}
            isPracticeView={true}
            workspace="practice"
            routeConversationId={conversationId}
            routeInvoiceId={invoiceId}
            routeReportDeliveryId={reportDeliveryId}
            routeSettingsView={settingsView}
            routeSettingsAppId={appId}
            workspaceView={workspaceView}
            practiceSlug={normalizedPracticeSlug || undefined}
          />
        </Suspense>
      </ErrorBoundary>
      {isMatterCreateRoute ? (
        <Suspense fallback={null}>
          <PracticeMatterCreatePage
            practiceId={resolvedPracticeId}
            practiceSlug={normalizedPracticeSlug || null}
          />
        </Suspense>
      ) : null}
    </>
  );
}

function ClientPracticeRoute({
  practiceSlug,
  conversationId,
  invoiceId,
  intakeId,
  appId,
  workspaceView = 'home',
  settingsView = 'general',
}: {
  practiceSlug?: string;
  conversationId?: string;
  invoiceId?: string;
  intakeId?: string;
  appId?: string;
  workspaceView?: 'home' | 'list' | 'conversation' | 'matters' | 'invoices' | 'invoiceDetail' | 'intakes' | 'intakeDetail' | 'files' | 'settings';
  settingsView?: SettingsView;
}) {
  const location = useLocation();
  const { session, isPending: sessionIsPending } = useSessionContext();
  const {
    rolePending,
    canAccessClientWorkspace,
    practicesLoading,
    practicesError,
    currentPractice,
  } = useWorkspaceResolver({
    practiceSlug: practiceSlug ?? null,
  });

  const slug = (practiceSlug ?? '').trim();
  const resolvedPracticeId = currentPractice?.id ?? '';
  const practiceConfig = useMemo<UIPracticeConfig>(() => ({
    id: currentPractice?.id ?? '',
    slug: currentPractice?.slug ?? slug,
    name: currentPractice?.name ?? '',
    profileImage: currentPractice?.logo || undefined,
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

  // Home tab renders the client dashboard (src/features/client-dashboard).
  // Previously redirected to /conversations because no dashboard existed.

  if (sessionIsPending || practicesLoading || rolePending) {
    return <LoadingScreen />;
  }

  if (practicesError) {
    return renderWorkspaceFailureState('Client workspace failed to load', practicesError);
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
      <ErrorBoundary fallback={<ChunkLoadFallback />}>
        <Suspense fallback={<LoadingScreen />}>
          <MainApp
            practiceId={resolvedPracticeId}
            practiceConfig={practiceConfig}
            isPracticeView={true}
            workspace="client"
            clientPracticeSlug={slug || undefined}
            routeConversationId={conversationId}
            routeInvoiceId={invoiceId}
            routeIntakeId={intakeId}
            routeSettingsView={settingsView}
            routeSettingsAppId={appId}
            workspaceView={workspaceView}
          />
        </Suspense>
      </ErrorBoundary>
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
    document.documentElement.setAttribute('data-theme', 'midnight');
  }


  // Register the service worker with a controlled update flow. The new SW
  // waits in `installed` state until the user clicks Refresh in
  // UpdateAvailableToast, avoiding the "open tab on old code, new SW serving
  // new chunks" mismatch that broke lazy imports under autoUpdate.
  registerSWWithUpdatePrompt();

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
