import { useMemo, useState, useEffect } from 'preact/hooks';
import { useNavigation } from '@/shared/utils/navigation';
import { cn } from '@/shared/utils/cn';
import { type App } from './appsData';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { useWorkspace } from '@/shared/hooks/useWorkspace';
import { GeneralPage } from './GeneralPage';
import { NotificationsPage } from './NotificationsPage';
import { AccountPage } from './AccountPage';
import { PayoutsPage } from './PayoutsPage';
import { SecurityPage } from './SecurityPage';
import { HelpPage } from './HelpPage';
import { PracticePage } from './PracticePage';
import { PracticeServicesPage } from './PracticeServicesPage';
import { PracticeTeamPage } from './PracticeTeamPage';
import { PracticePricingPage } from './PracticePricingPage';
import { AppsPage } from './AppsPage';
import { AppDetailPage } from './AppDetailPage';

export type SettingsView =
  | 'general'
  | 'notifications'
  | 'account'
  | 'account-payouts'
  | 'practice'
  | 'practice-services'
  | 'practice-team'
  | 'practice-pricing'
  | 'apps'
  | 'app-detail'
  | 'security'
  | 'help';

export interface SettingsContentProps {
  // Legacy compatibility props (unused in content-only mode)
  isMobile?: boolean;
  onClose?: () => void;
  className?: string;
  workspace?: 'client' | 'practice';
  practiceSlug?: string;
  view?: SettingsView;
  appId?: string;
  apps?: App[];
}

export const SettingsContent = ({
  isMobile: _isMobile = false,
  onClose: _onClose,
  className = '',
  workspace = 'practice',
  practiceSlug = 'workspace',
  view = 'general',
  appId,
  apps: initialApps,
}: SettingsContentProps) => {
  const { navigate } = useNavigation();
  const [apps, setApps] = useState<App[]>(initialApps ?? []);
  const { isPending: sessionPending } = useSessionContext();
  const { canAccessPractice } = useWorkspace();

  const settingsBasePath = `/${workspace}/${encodeURIComponent(practiceSlug)}/settings`;
  const toSettingsPath = (subPath?: string) => {
    if (!subPath) return settingsBasePath;
    return `${settingsBasePath}/${subPath.replace(/^\/+/, '')}`;
  };

  const isPracticeScopedView = view === 'practice'
    || view === 'practice-services'
    || view === 'practice-team'
    || view === 'practice-pricing'
    || view === 'apps'
    || view === 'app-detail';

  useEffect(() => {
    if (sessionPending) return;
    if (isPracticeScopedView && !canAccessPractice) {
      navigate(`${settingsBasePath}/general`, true);
    }
  }, [canAccessPractice, isPracticeScopedView, navigate, sessionPending, settingsBasePath]);

  const handleAppUpdate = (targetAppId: string, updates: Partial<App>) => {
    setApps((prev) => prev.map((app) => app.id === targetAppId ? { ...app, ...updates } : app));
  };

  const currentApp = useMemo(() => apps.find((item) => item.id === appId), [appId, apps]);

  const renderContent = () => {
    switch (view) {
      case 'general':
        return <GeneralPage className="h-full" />;
      case 'notifications':
        return <NotificationsPage className="h-full" />;
      case 'account':
        return <AccountPage className="h-full" />;
      case 'account-payouts':
        return <PayoutsPage className="h-full" />;
      case 'practice':
        return <PracticePage className="h-full" />;
      case 'practice-services':
        return <PracticeServicesPage className="h-full" />;
      case 'practice-team':
        return <PracticeTeamPage className="h-full" />;
      case 'practice-pricing':
        return <PracticePricingPage className="h-full" />;
      case 'apps':
        return (
          <AppsPage
            apps={apps}
            onSelect={(selectedAppId) => navigate(toSettingsPath(`apps/${selectedAppId}`))}
            className="h-full"
          />
        );
      case 'app-detail':
        if (!currentApp) {
          return (
            <AppsPage
              apps={apps}
              onSelect={(selectedAppId) => navigate(toSettingsPath(`apps/${selectedAppId}`))}
              className="h-full"
            />
          );
        }
        return (
          <AppDetailPage
            app={currentApp}
            onBack={() => navigate(toSettingsPath('apps'))}
            onUpdate={handleAppUpdate}
          />
        );
      case 'security':
        return <SecurityPage className="h-full" />;
      case 'help':
        return <HelpPage className="h-full" />;
      default:
        return <GeneralPage className="h-full" />;
    }
  };

  return (
    <div className={cn('h-full min-h-0 overflow-hidden', className)}>
      {renderContent()}
    </div>
  );
};

export default SettingsContent;
