import { useLocation } from 'preact-iso';
import { useEffect, useState, useCallback } from 'preact/hooks';
import { AnimatePresence, motion } from 'framer-motion';
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
import WorkspaceNav, { type WorkspaceNavItem } from '@/features/chat/views/WorkspaceNav';
import { 
  UserIcon, 
  ShieldCheckIcon, 
  Cog6ToothIcon,
  XMarkIcon,
  BellIcon,
  ArrowRightOnRectangleIcon,
  QuestionMarkCircleIcon,
  ArrowLeftIcon,
  BuildingOfficeIcon,
  PuzzlePieceIcon
} from '@heroicons/react/24/outline';
import { Button } from '@/shared/ui/Button';
import { useNavigation } from '@/shared/utils/navigation';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { cn } from '@/shared/utils/cn';
import { useTranslation } from '@/shared/i18n/hooks';
import { signOut } from '@/shared/utils/auth';
import { buildSettingsPath, resolveSettingsBasePath } from '@/shared/utils/workspace';
import { mockApps, type App } from './appsData';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { useWorkspace } from '@/shared/hooks/useWorkspace';
import { AppShell, Page, Panel, SplitView } from '@/shared/ui/layout';


export interface SettingsPageProps {
  isMobile?: boolean;
  onClose?: () => void;
  className?: string;
}

export const SettingsPage = ({
  isMobile = false,
  onClose,
  className = ''
}: SettingsPageProps) => {
  const { showSuccess, showError } = useToastContext();
  const { navigate } = useNavigation();
  const location = useLocation();
  const { t } = useTranslation(['settings', 'common']);
  const [apps, setApps] = useState<App[]>(mockApps);
  const { isPending: sessionPending } = useSessionContext();
  const { canAccessPractice } = useWorkspace();
  const canShowPracticeSettings = canAccessPractice;
  const settingsBasePath = resolveSettingsBasePath(location.path);
  const toSettingsPath = useCallback((subPath?: string) => buildSettingsPath(settingsBasePath, subPath), [settingsBasePath]);
  
  // Get current page from URL path
  const getCurrentPage = () => {
    const segments = location.path.split('/').filter(Boolean);
    const settingsIndex = segments.indexOf('settings');
    if (settingsIndex === -1) {
      return 'navigation'; // Show main navigation on mobile
    }
    return segments[settingsIndex + 1] || 'navigation';
  };
  
  const getPracticeSubPage = () => {
    const segments = location.path.split('/').filter(Boolean);
    const settingsIndex = segments.indexOf('settings');
    if (settingsIndex === -1) return '';
    return segments[settingsIndex + 2] || '';
  };

  const getAccountSubPage = () => {
    const segments = location.path.split('/').filter(Boolean);
    const settingsIndex = segments.indexOf('settings');
    if (settingsIndex === -1) return '';
    return segments[settingsIndex + 2] || '';
  };

  const getCurrentAppId = () => {
    const segments = location.path.split('/').filter(Boolean);
    const settingsIndex = segments.indexOf('settings');
    if (settingsIndex === -1) return undefined;
    return segments[settingsIndex + 2];
  };

  const currentAppId = getCurrentAppId();
  const practiceSubPage = getPracticeSubPage();
  const accountSubPage = getAccountSubPage();
  const currentPage = getCurrentPage();
  const shouldHideSettings = currentPage === 'organization';

  // Redirect legacy 'organization' URLs to 'practice'
  useEffect(() => {
    if (currentPage === 'organization') {
      navigate(toSettingsPath('practice'), true);
    }
  }, [currentPage, navigate, toSettingsPath]);
  
  useEffect(() => {
    if (sessionPending) {
      return;
    }
    if (!canShowPracticeSettings && (currentPage === 'practice' || currentPage === 'apps')) {
      navigate(toSettingsPath(), true);
    }
  }, [canShowPracticeSettings, currentPage, navigate, sessionPending, toSettingsPath]);

  const handleNavigation = (page: string) => {
    navigate(toSettingsPath(page));
  };

  const handleBack = () => {
    if (onClose) {
      onClose();
    }
  };

  const handleSignOut = async () => {
    try {
      // Use centralized sign out utility
      await signOut({
        onSuccess: () => {
          showSuccess(t('settings:navigation.signOut.toastTitle'), t('settings:navigation.signOut.toastBody'));
          if (onClose) {
            onClose();
          }
        },
        navigate
      });
		} catch (_error) {
      showError(t('settings:navigation.signOut.errorTitle'), t('settings:navigation.signOut.errorBody'));
    }
  };

  // Define navigation items with ChatGPT-like structure
  const navigationItems: WorkspaceNavItem[] = [
    { id: 'general', label: t('settings:navigation.items.general'), icon: Cog6ToothIcon },
    { id: 'notifications', label: t('settings:navigation.items.notifications'), icon: BellIcon },
    { id: 'account', label: t('settings:navigation.items.account'), icon: UserIcon },
    ...(canShowPracticeSettings ? [
      { id: 'practice', label: t('settings:navigation.items.practice'), icon: BuildingOfficeIcon },
      { id: 'apps', label: t('settings:navigation.items.apps'), icon: PuzzlePieceIcon },
    ] : []),
    { id: 'security', label: t('settings:navigation.items.security'), icon: ShieldCheckIcon },
    { id: 'help', label: t('settings:navigation.items.help'), icon: QuestionMarkCircleIcon },
    { id: 'signout', label: t('settings:navigation.items.signOut'), icon: ArrowRightOnRectangleIcon, isAction: true, onClick: handleSignOut, variant: 'danger' }
  ];

  const mobileTitle = (() => {
    if (currentPage === 'practice' && practiceSubPage === 'services') {
      return t('settings:practice.services');
    }
    if (currentPage === 'practice' && practiceSubPage === 'team') {
      return t('settings:practice.team');
    }
    if (currentPage === 'practice' && practiceSubPage === 'pricing') {
      return t('settings:practice.pricingTitle');
    }
    if (currentPage === 'account' && accountSubPage === 'payouts') {
      return t('settings:account.payouts.title');
    }
    return navigationItems.find(item => item.id === currentPage)?.label || t('settings:navigation.title');
  })();

  const activeNavigationId = currentPage === 'navigation' ? undefined : currentPage;

  const handleAppUpdate = (appId: string, updates: Partial<App>) => {
    setApps((prev) => prev.map((app) => app.id === appId ? { ...app, ...updates } : app));
  };

  // Setup navigation logic moved to home page

  // Render content based on current page
  const renderContent = () => {
    switch (currentPage) {
      case 'general':
        return <GeneralPage isMobile={isMobile} onClose={onClose} className="h-full" />;
      case 'notifications':
        return <NotificationsPage className="h-full" />;
      case 'account':
        if (accountSubPage === 'payouts') {
          return <PayoutsPage className="h-full" />;
        }
        return <AccountPage isMobile={isMobile} onClose={onClose} className="h-full" />;
      case 'practice':
        if (practiceSubPage === 'services') {
          return <PracticeServicesPage />;
        }
        if (practiceSubPage === 'team') {
          return <PracticeTeamPage />;
        }
        if (practiceSubPage === 'pricing') {
          return <PracticePricingPage />;
        }
        return <PracticePage className="h-full" />;
      case 'apps': {
        const currentApp = apps.find(app => app.id === currentAppId);
        if (currentAppId && currentApp) {
          return (
              <AppDetailPage
                app={currentApp}
                onBack={() => navigate(toSettingsPath('apps'))}
                onUpdate={handleAppUpdate}
              />
            );
          }

          return (
            <AppsPage
              apps={apps}
              onSelect={(appId) => navigate(toSettingsPath(`apps/${appId}`))}
              className="h-full"
            />
          );
      }
      case 'security':
        return <SecurityPage isMobile={isMobile} onClose={onClose} className="h-full" />;
      case 'help':
        return <HelpPage className="h-full" />;
      // case 'mfa-enrollment':
      //   return <MFAEnrollmentPage className="h-full" />;
      default:
        return <GeneralPage isMobile={isMobile} onClose={onClose} className="h-full" />;
    }
  };

  // For MFA enrollment, render as full page without sidebar
  if (currentPage === 'mfa-enrollment') {
    return (
      <div className={cn('h-full', className)}>
        {renderContent()}
      </div>
    );
  }

  if (shouldHideSettings) {
    return null;
  }

  const desktopNavigation = (
    <div className="flex min-h-0 flex-col">
      <div className="flex-1 overflow-y-auto">
        <WorkspaceNav
          variant="sidebar"
          activeTab="settings"
          onSelectTab={() => undefined}
          items={navigationItems}
          activeItemId={activeNavigationId}
          onSelectItem={handleNavigation}
        />
      </div>
    </div>
  );

  const setupBanner = null;

  const contentPanel = (
    <Page className="h-full min-h-0">
      <Panel className="h-full min-h-0 overflow-hidden">
        {setupBanner}
        {renderContent()}
      </Panel>
    </Page>
  );

  const mobileHeader = currentPage === 'navigation' ? (
    <div className="flex items-center justify-between px-4 py-3 border-b border-line-glass/30 bg-transparent">
      <div className="flex-1" />
      <h1 className="text-lg font-semibold text-input-text">{t('settings:navigation.title')}</h1>
      <div className="flex-1 flex justify-end">
        <Button
          variant="icon"
          size="icon"
          onClick={handleBack}
          aria-label={t('settings:navigation.close')}
          icon={<XMarkIcon className="w-5 h-5" />}
        />
      </div>
    </div>
  ) : (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-line-glass/30 bg-transparent">
      <Button
        variant="icon"
        size="icon"
        onClick={() => {
          if (currentPage === 'apps' && currentAppId) {
            navigate(toSettingsPath('apps'));
            return;
          }
          if (currentPage === 'practice' && (practiceSubPage === 'services' || practiceSubPage === 'team' || practiceSubPage === 'pricing')) {
            navigate(toSettingsPath('practice'));
            return;
          }
          navigate(toSettingsPath());
        }}
        aria-label={t('settings:navigation.backToSettings')}
        icon={<ArrowLeftIcon className="w-5 h-5" />}
      />
      <div className="flex-1 flex justify-center">
        <h1 className="text-lg font-semibold text-input-text">
          {mobileTitle}
        </h1>
      </div>
      <div className="w-9" />
    </div>
  );

  const desktopTitle = currentPage === 'navigation' ? t('settings:navigation.title') : mobileTitle;
  const desktopHeader = (
    <div className="flex items-center justify-between px-6 py-3 border-b border-line-glass/30 bg-transparent">
      <h1 className="text-lg font-semibold text-input-text">{desktopTitle}</h1>
      <Button
        variant="icon"
        size="icon"
        onClick={handleBack}
        aria-label={t('settings:navigation.close')}
        icon={<XMarkIcon className="w-5 h-5" />}
      />
    </div>
  );

  const mobileContent = currentPage === 'navigation'
    ? (
      <div className="flex-1 overflow-y-auto bg-transparent">
        <div className="px-4 py-2">
          <WorkspaceNav
            variant="sidebar"
            activeTab="settings"
            onSelectTab={() => undefined}
            items={navigationItems}
            activeItemId={activeNavigationId}
            onSelectItem={handleNavigation}
          />
        </div>
      </div>
    )
    : (
      <div className="flex-1 min-h-0 relative overflow-hidden">
        <div className="relative">{contentPanel}</div>
      </div>
    );

  const desktopContent = (
    <div className="h-full min-h-0 relative">
      <div className="relative h-full min-h-0">
        <SplitView
          className="h-full min-h-0"
          primary={desktopNavigation}
          secondary={contentPanel}
          primaryClassName="min-h-0 bg-transparent"
          secondaryClassName="min-h-0"
        />
      </div>
    </div>
  );

  const shellKey = isMobile ? 'settings-mobile-shell' : 'settings-desktop-shell';
  const shellMotion = isMobile
    ? {
      initial: { y: '100%' },
      animate: { y: 0 },
      exit: { y: '100%' }
    }
    : {
      initial: { opacity: 0, y: 24 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: 24 }
    };

  return (
    <AppShell
      className={cn('bg-transparent', className)}
      accentBackdropVariant="settings"
      header={isMobile ? mobileHeader : desktopHeader}
      main={(
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={shellKey}
            className="h-full min-h-0"
            initial={shellMotion.initial}
            animate={shellMotion.animate}
            exit={shellMotion.exit}
            transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            {isMobile ? mobileContent : desktopContent}
          </motion.div>
        </AnimatePresence>
      )}
      mainClassName="min-h-0"
    />
  );
};
