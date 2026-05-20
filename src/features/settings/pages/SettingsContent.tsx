import { useMemo, useState, useEffect, useCallback } from 'preact/hooks';
import { useNavigation } from '@/shared/utils/navigation';
import { cn } from '@/shared/utils/cn';
import { type App, mockApps } from './appsData';
import { useSessionContext, useMemberRoleContext } from '@/shared/contexts/SessionContext';
import { useWorkspace } from '@/shared/hooks/useWorkspace';
import { normalizePracticeRole } from '@/shared/utils/practiceRoles';
import { GeneralPage } from './GeneralPage';
import { NotificationsPage } from './NotificationsPage';
import { AccountProfilePage } from './AccountProfilePage';
import { PracticeBillingPage } from './PracticeBillingPage';
import { PayoutsPage } from './PayoutsPage';
import { SecurityPage } from './SecurityPage';
import { HelpPage } from './HelpPage';
import { MFAEnrollmentPage } from './MFAEnrollmentPage';
import { PracticeGeneralPage } from './PracticeGeneralPage';
import { PracticeContactPage } from './PracticeContactPage';
import { PracticeTeamPage } from './PracticeTeamPage';
import { AppsPage } from './AppsPage';
import { AppDetailPage } from './AppDetailPage';
import { PracticeCoveragePage } from './PracticeCoveragePage';
import { MembershipsPage } from './MembershipsPage';
import { EditorShell } from '@/shared/ui/layout';
import { getSettingsNavConfig, type SettingsScopeNav } from '@/shared/config/navConfig';
import { useTranslation } from '@/shared/i18n/hooks';
import {
  SettingsScopeTabs,
  SettingsSectionNav,
  type SettingsScope,
} from '@/features/settings/components';

export type SettingsView =
  | 'account/profile'
  | 'account/appearance'
  | 'account/notifications'
  | 'account/security'
  | 'account/security/mfa-enrollment'
  | 'account/memberships'
  | 'practice/general'
  | 'practice/contact'
  | 'practice/coverage'
  | 'practice/team'
  | 'practice/billing'
  | 'practice/payouts'
  | 'practice/apps'
  | 'practice/app-detail'
  | 'help';

const assertNever = (value: never): never => {
  throw new Error(`Unhandled settings view: ${String(value)}`);
};

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

const scopeOfView = (view: SettingsView): SettingsScope => {
  if (view === 'help') return 'help';
  if (view.startsWith('practice/')) return 'practice';
  return 'account';
};

const SettingsRouter = ({
  view,
  appId,
  apps,
  handleAppUpdate,
  toSettingsPath,
  viewLabel,
}: {
  view: SettingsView;
  appId?: string;
  apps: App[];
  handleAppUpdate: (targetAppId: string, updates: Partial<App>) => void;
  toSettingsPath: (subPath?: string) => string;
  viewLabel: string;
}) => {
  const { navigate } = useNavigation();

  const renderViewContent = () => {
    switch (view) {
      case 'account/appearance':
        return <GeneralPage />;
      case 'account/notifications':
        return <NotificationsPage />;
      case 'account/profile':
        return <AccountProfilePage />;
      case 'account/security':
        return <SecurityPage />;
      case 'account/security/mfa-enrollment':
        return <MFAEnrollmentPage onBack={() => navigate(toSettingsPath('account/security'))} />;
      case 'account/memberships':
        return <MembershipsPage />;
      case 'practice/general':
        return <PracticeGeneralPage onBack={() => navigate(toSettingsPath('account/profile'))} />;
      case 'practice/contact':
        return <PracticeContactPage onBack={() => navigate(toSettingsPath('practice/general'))} />;
      case 'practice/coverage':
        return <PracticeCoveragePage onBack={() => navigate(toSettingsPath('practice/general'))} />;
      case 'practice/team':
        return <PracticeTeamPage onBack={() => navigate(toSettingsPath('practice/general'))} />;
      case 'practice/billing':
        return <PracticeBillingPage />;
      case 'practice/payouts':
        return <PayoutsPage onBack={() => navigate(toSettingsPath('practice/general'))} />;
      case 'practice/apps':
        return (
          <AppsPage
            apps={apps}
            onSelect={(selectedAppId) => navigate(toSettingsPath(`practice/apps/${selectedAppId}`))}
          />
        );
      case 'practice/app-detail': {
        const currentApp = appId ? apps.find((app) => app.id === appId) : undefined;
        if (!currentApp) {
          return (
            <EditorShell title="Apps" showBack onBack={() => navigate(toSettingsPath('practice/apps'))} contentMaxWidth={null}>
              <AppsPage apps={apps} onSelect={(id) => navigate(toSettingsPath(`practice/apps/${id}`))} />
            </EditorShell>
          );
        }
        return (
          <AppDetailPage
            app={currentApp}
            onBack={() => navigate(toSettingsPath('practice/apps'))}
            onUpdate={handleAppUpdate}
          />
        );
      }
      case 'help':
        return <HelpPage />;
      default:
        return assertNever(view);
    }
  };

  const isSelfWrappedView = view === 'practice/app-detail'
    || view === 'practice/general'
    || view === 'practice/contact'
    || view === 'practice/coverage'
    || view === 'practice/payouts'
    || view === 'practice/team'
    || view === 'account/security/mfa-enrollment';

  if (isSelfWrappedView) {
    return renderViewContent();
  }

  return (
    <EditorShell title={viewLabel} contentMaxWidth={null}>
      {renderViewContent()}
    </EditorShell>
  );
};

/**
 * Controller for all settings views. Renders the scope tabs (Account /
 * Practice / Help) + section nav strip, then the view content.
 */
export const SettingsContent = (props: SettingsContentProps) => {
  const {
    className = '',
    workspace = 'practice',
    practiceSlug = 'workspace',
    view = 'account/profile',
    appId,
    apps: initialApps,
  } = props;

  const { navigate } = useNavigation();
  const { t } = useTranslation(['settings']);
  const [appUpdates, setAppUpdates] = useState<Record<string, Partial<App>>>({});

  const { isPending: sessionPending } = useSessionContext();
  const { activeMemberRole } = useMemberRoleContext();
  const { canAccessPractice } = useWorkspace();

  const settingsBasePath = `/${workspace}/${encodeURIComponent(practiceSlug)}/settings`;
  const toSettingsPath = useCallback(
    (subPath?: string) => {
      if (!subPath) return settingsBasePath;
      return `${settingsBasePath}/${subPath.replace(/^\/+/, '')}`;
    },
    [settingsBasePath],
  );

  const isPracticeScopedView = view.startsWith('practice/');

  useEffect(() => {
    if (sessionPending) return;
    if (isPracticeScopedView && !canAccessPractice) {
      navigate(`${settingsBasePath}/account/profile`, true);
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

  const scope = scopeOfView(view);
  const scopeNav: SettingsScopeNav | null = scope === 'account'
    ? navConfig.scopes.account
    : scope === 'practice'
      ? navConfig.scopes.practice ?? null
      : navConfig.scopes.help;

  const sectionNavItems = useMemo(() => scopeNav?.items ?? [], [scopeNav]);
  const currentSectionId = view;

  const viewLabel = useMemo(() => {
    if (view === 'practice/app-detail' && currentApp) return currentApp.name;
    const match = sectionNavItems.find((item) => item.id === view);
    if (match) return match.label;
    return '';
  }, [currentApp, sectionNavItems, view]);

  return (
    <div className={cn('h-full min-h-0 overflow-auto', className)}>
      <div className="px-4 sm:px-6 lg:px-8">
        <SettingsScopeTabs
          scope={scope}
          basePath={settingsBasePath}
          canAccessPractice={canAccessPractice}
          accountLabel={t('settings:scope.account', { defaultValue: 'Account' })}
          practiceLabel={t('settings:scope.practice', { defaultValue: 'Practice' })}
          helpLabel={t('settings:scope.help', { defaultValue: 'Help' })}
        />
        {sectionNavItems.length > 0 ? (
          <SettingsSectionNav items={sectionNavItems} currentId={currentSectionId} />
        ) : null}
      </div>
      <SettingsRouter
        view={view}
        appId={appId}
        apps={apps}
        handleAppUpdate={handleAppUpdate}
        toSettingsPath={toSettingsPath}
        viewLabel={viewLabel}
      />
    </div>
  );
};

export default SettingsContent;
