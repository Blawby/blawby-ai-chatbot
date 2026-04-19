import { useMemo, useState, useEffect } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { useNavigation } from '@/shared/utils/navigation';
import { cn } from '@/shared/utils/cn';
import { type App, mockApps } from './appsData';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { useWorkspace } from '@/shared/hooks/useWorkspace';
import { normalizePracticeRole } from '@/shared/utils/practiceRoles';
import { GeneralPage } from './GeneralPage';
import { NotificationsPage } from './NotificationsPage';
import { AccountPage } from './AccountPage';
import { PayoutsPage } from './PayoutsPage';
import { SecurityPage } from './SecurityPage';
import { HelpPage } from './HelpPage';
import { PracticeOverviewPage } from './PracticePage';
import { MFAEnrollmentPage } from './MFAEnrollmentPage';
import AppBlawbyMessengerSettingsPage from './AppBlawbyMessengerSettingsPage';
import IntakeTemplatesPage from './IntakeTemplatesPage';
import { PracticeCoveragePage } from './PracticeCoveragePage';
import { PracticeContactPage } from './PracticeContactPage';
import { PracticeTeamPage } from './PracticeTeamPage';
import { PracticePricingPage } from './PracticePricingPage';
import { AppsPage } from './AppsPage';
import { AppDetailPage } from './AppDetailPage';
import { SettingsPage } from '@/shared/ui/layout/SettingsPage';
import { getSettingsNavConfig } from '@/shared/config/navConfig';
import { useTranslation } from '@/shared/i18n/hooks';
import { getValidatedSettingsReturnPath } from '@/shared/utils/workspace';

export type SettingsView =
  | 'general'
  | 'notifications'
  | 'account'
  | 'practice'
  | 'blawby-messenger-settings'
  | 'practice-payouts'
  | 'practice-coverage'
  | 'practice-contact'
  | 'practice-team'
  | 'practice-pricing'
  | 'intake-templates'
  | 'apps'
  | 'app-detail'
  | 'security'
  | 'help'
  | 'mfa-enrollment'
  ;

export interface SettingsContentProps {
  isMobile?: boolean;
  onClose?: () => void;
  className?: string;
  workspace?: 'client' | 'practice';
  practiceSlug?: string;
  view?: SettingsView;
  appId?: string;
  apps?: App[];
}

const SettingsRouter = ({
  view,
  appId,
  apps,
  handleAppUpdate,
  toSettingsPath,
  viewLabel,
  messengerReturnPath,
}: {
  view: SettingsView;
  appId?: string;
  apps: App[];
  handleAppUpdate: (targetAppId: string, updates: Partial<App>) => void;
  toSettingsPath: (subPath?: string) => string;
  viewLabel: string;
  messengerReturnPath: string | null;
}) => {
  const { navigate } = useNavigation();

  const renderViewContent = () => {
    switch (view) {
      case 'general':
        return <GeneralPage />;
      case 'notifications':
        return <NotificationsPage />;
      case 'account':
        return <AccountPage />;
      case 'practice':
        return <PracticeOverviewPage />;
      case 'blawby-messenger-settings':
        return (
          <AppBlawbyMessengerSettingsPage
            onBack={() => navigate(messengerReturnPath ?? toSettingsPath('apps/blawby-messenger'))}
          />
        );
      case 'practice-payouts':
        return <PayoutsPage onBack={() => navigate(toSettingsPath('practice'))} />;
      case 'practice-coverage':
        return <PracticeCoveragePage onBack={() => navigate(toSettingsPath('practice'))} />;
      case 'practice-contact':
        return <PracticeContactPage onBack={() => navigate(toSettingsPath('practice'))} />;
      case 'practice-team':
        return <PracticeTeamPage onBack={() => navigate(toSettingsPath('practice'))} />;
      case 'practice-pricing':
        return <PracticePricingPage onBack={() => navigate(toSettingsPath('practice'))} />;
      case 'intake-templates':
        return <IntakeTemplatesPage onBack={() => navigate(toSettingsPath('practice'))} />;
      case 'apps':
        return (
          <AppsPage
            apps={apps}
            onSelect={(selectedAppId) => navigate(toSettingsPath(`apps/${selectedAppId}`))}
          />
        );
      case 'app-detail': {
        if (!appId) {
          return (
            <SettingsPage title="Apps" showBack onBack={() => navigate(toSettingsPath('apps'))} contentMaxWidth={null}>
              <AppsPage apps={apps} onSelect={(id) => navigate(toSettingsPath(`apps/${id}`))} />
            </SettingsPage>
          );
        }
        const currentApp = apps.find((app) => app.id === appId);
        if (!currentApp) {
          return (
            <SettingsPage title="Apps" showBack onBack={() => navigate(toSettingsPath('apps'))} contentMaxWidth={null}>
              <AppsPage apps={apps} onSelect={(id) => navigate(toSettingsPath(`apps/${id}`))} />
            </SettingsPage>
          );
        }
        return (
          <AppDetailPage
            app={currentApp}
            onBack={() => navigate(toSettingsPath('apps'))}
            onUpdate={handleAppUpdate}
          />
        );
      }
      case 'security':
        return <SecurityPage />;
      case 'mfa-enrollment':
        return <MFAEnrollmentPage onBack={() => navigate(toSettingsPath('security'))} />;
      case 'help':
        return <HelpPage />;
      default:
        return <GeneralPage />;
    }
  };

  const isSelfWrappedView = view === 'app-detail'
    || view === 'blawby-messenger-settings'
    || view === 'practice-payouts'
    || view === 'practice-coverage'
    || view === 'practice-contact'
    || view === 'practice-team'
    || view === 'practice-pricing'
    || view === 'intake-templates'
    || view === 'mfa-enrollment'

  if (isSelfWrappedView) {
    return renderViewContent();
  }

  return (
    <SettingsPage
      title={viewLabel}
      contentMaxWidth={null}
    >
      {renderViewContent()}
    </SettingsPage>
  );
};

/**
 * Controller for all settings views.
 *
 * Provides settings routing while keeping list pages and detail/editor pages explicit.
 * Top-level views are wrapped here. Detail/editor views render their own SettingsPage
 * so header actions, back behavior, and previews stay local to the editor state.
 */
export const SettingsContent = (props: SettingsContentProps) => {
  const {
    className = '',
    workspace = 'practice',
    practiceSlug = 'workspace',
    view = 'general',
    appId,
    apps: initialApps,
  } = props;

  const location = useLocation();
  const { navigate } = useNavigation();
  const { t } = useTranslation(['settings']);
  const [appUpdates, setAppUpdates] = useState<Record<string, Partial<App>>>({});

  const { isPending: sessionPending, activeMemberRole } = useSessionContext();
  const { canAccessPractice } = useWorkspace();

  const settingsBasePath = `/${workspace}/${encodeURIComponent(practiceSlug)}/settings`;
  const messengerReturnPath = useMemo(() => {
    const rawReturnTo = typeof location.query?.returnTo === 'string' ? location.query.returnTo : null;
    return getValidatedSettingsReturnPath(rawReturnTo, workspace, practiceSlug);
  }, [location.query?.returnTo, practiceSlug, workspace]);
  const toSettingsPath = (subPath?: string) => {
    if (!subPath) return settingsBasePath;
    return `${settingsBasePath}/${subPath.replace(/^\/+/, '')}`;
  };

  const isPracticeScopedView = view === 'practice'
    || view === 'practice-payouts'
    || view === 'practice-coverage'
    || view === 'practice-team'
    || view === 'practice-pricing'
    || view === 'practice-contact'
    || view === 'intake-templates'
    || view === 'apps'
    || view === 'app-detail'
    || view === 'blawby-messenger-settings'

  useEffect(() => {
    if (sessionPending) return;
    if (isPracticeScopedView && !canAccessPractice) {
      navigate(`${settingsBasePath}/general`, true);
    }
  }, [canAccessPractice, isPracticeScopedView, navigate, sessionPending, settingsBasePath]);

  useEffect(() => {
    if (initialApps) {
      setAppUpdates({});
    }
  }, [initialApps]);

  const apps = useMemo(() => {
    const sourceApps = initialApps ?? mockApps;
    return sourceApps.map((app) => ({ ...app, ...appUpdates[app.id] }));
  }, [appUpdates, initialApps]);

  const handleAppUpdate = (targetAppId: string, updates: Partial<App>) => {
    setAppUpdates((prev) => ({
      ...prev,
      [targetAppId]: {
        ...prev[targetAppId],
        ...updates,
      },
    }));
  };

  const currentApp = useMemo(() => apps.find((item) => item.id === appId), [appId, apps]);

  const navConfig = useMemo(() => {
    return getSettingsNavConfig({
      practiceSlug,
      role: normalizePracticeRole(activeMemberRole) ?? null,
      canAccessPractice,
    });
  }, [activeMemberRole, canAccessPractice, practiceSlug]);

  const viewLabel = useMemo(() => {
    if (view === 'app-detail' && currentApp) return currentApp.name;
    for (const section of navConfig.secondary ?? []) {
      const item = section.items.find((i) => i.id === view);
      if (item) return item.label;
    }
    if (view === 'blawby-messenger-settings') return t('settings:apps.messenger.title');
    if (view === 'practice-coverage') return 'Coverage';
    if (view === 'practice-contact') return 'Contact';
    if (view === 'mfa-enrollment') return t('settings:mfa.title');
    return t(`settings:${view}.title`);
  }, [currentApp, navConfig.secondary, t, view]);

  return (
    <div className={cn('h-full min-h-0 overflow-hidden', className)}>
      <SettingsRouter
        view={view}
        appId={appId}
        apps={apps}
        handleAppUpdate={handleAppUpdate}
        toSettingsPath={toSettingsPath}
        viewLabel={viewLabel}
        messengerReturnPath={messengerReturnPath}
      />
    </div>
  );
};

export default SettingsContent;
