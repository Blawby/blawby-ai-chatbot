import { useLocation } from 'preact-iso';
import { GeneralPage } from './pages/GeneralPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { AccountPage } from './pages/AccountPage';
import { SecurityPage } from './pages/SecurityPage';
import { MFAEnrollmentPage } from './pages/MFAEnrollmentPage';
import { HelpPage } from './pages/HelpPage';
import { PracticePage } from './pages/PracticePage';
import { SidebarNavigation, SidebarNavigationItem } from '../ui/SidebarNavigation';
import { 
  UserIcon, 
  ShieldCheckIcon, 
  Cog6ToothIcon,
  XMarkIcon,
  BellIcon,
  ArrowRightOnRectangleIcon,
  QuestionMarkCircleIcon,
  ArrowLeftIcon,
  BuildingOfficeIcon
} from '@heroicons/react/24/outline';
import { useNavigation } from '../../utils/navigation';
import { useToastContext } from '../../contexts/ToastContext';
import { cn } from '../../utils/cn';
import { useTranslation } from '@/i18n/hooks';
import { signOut } from '../../utils/auth';


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
  
  // Get current page from URL path
  const getCurrentPage = () => {
    const path = location.path;
    if (path === '/settings' || path === '/settings/') {
      return 'navigation'; // Show main navigation on mobile
    }
    const segments = path.split('/').filter(Boolean);
    return segments[1] || 'navigation'; // Get the page from /settings/page
  };
  
  const currentPage = getCurrentPage();

  // Redirect legacy 'organization' URLs to 'practice'
  if (currentPage === 'organization') {
    navigate('/settings/practice');
    return null;
  }

  const handleNavigation = (page: string) => {
    navigate(`/settings/${page}`);
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
        }
      });
		} catch (_error) {
      showError(t('settings:navigation.signOut.errorTitle'), t('settings:navigation.signOut.errorBody'));
    }
  };

  // Define navigation items with ChatGPT-like structure
  // Note: Icons are now properly typed to accept SVG props like className, aria-hidden, strokeWidth, etc.
  const navigationItems: SidebarNavigationItem[] = [
    { id: 'general', label: t('settings:navigation.items.general'), icon: Cog6ToothIcon },
    { id: 'notifications', label: t('settings:navigation.items.notifications'), icon: BellIcon },
    { id: 'account', label: t('settings:navigation.items.account'), icon: UserIcon },
    { id: 'practice', label: t('settings:navigation.items.practice'), icon: BuildingOfficeIcon },
    { id: 'security', label: t('settings:navigation.items.security'), icon: ShieldCheckIcon },
    { id: 'help', label: t('settings:navigation.items.help'), icon: QuestionMarkCircleIcon },
    { id: 'signout', label: t('settings:navigation.items.signOut'), icon: ArrowRightOnRectangleIcon, isAction: true, onClick: handleSignOut, variant: 'danger' }
  ];


  // Render content based on current page
  const renderContent = () => {
    switch (currentPage) {
      case 'general':
        return <GeneralPage isMobile={isMobile} onClose={onClose} className="h-full" />;
      case 'notifications':
        return <NotificationsPage className="h-full" />;
      case 'account':
        return <AccountPage isMobile={isMobile} onClose={onClose} className="h-full" />;
      case 'practice':
        return <PracticePage className="h-full" />;
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

  // Mobile layout - show navigation or content based on current page
  if (isMobile) {
    return (
      <div className={cn('h-full flex flex-col', className)}>
        {currentPage === 'navigation' ? (
          // Main settings page (navigation)
          <>
            {/* Mobile Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg">
              <div className="flex-1" />
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Settings</h1>
              <div className="flex-1 flex justify-end">
                <button
                  onClick={handleBack}
                  className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  aria-label={t('settings:navigation.close')}
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Mobile Content - Show sidebar navigation as main content */}
            <div className="flex-1 overflow-y-auto bg-white dark:bg-dark-bg">
              <div className="px-4 py-2">
                <SidebarNavigation
                  items={navigationItems}
                  activeItem={currentPage}
                  onItemClick={handleNavigation}
                  mobile={true}
                />
              </div>
            </div>
          </>
        ) : (
          // Specific settings page
          <>
            {/* Mobile Header with Back Button */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg">
              <button
                onClick={() => navigate('/settings')}
                className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label={t('settings:navigation.backToSettings')}
              >
                <ArrowLeftIcon className="w-5 h-5" />
              </button>
              <div className="flex-1 flex justify-center">
                <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {navigationItems.find(item => item.id === currentPage)?.label || 'Settings'}
                </h1>
              </div>
              <div className="w-9" /> {/* Spacer to center the title */}
            </div>

            {/* Mobile Content - Show specific settings page */}
            <div className="flex-1 overflow-y-auto bg-white dark:bg-dark-bg">
              {renderContent()}
            </div>
          </>
        )}
      </div>
    );
  }

  // Desktop layout - two panel
  return (
    <div className={cn('h-full flex', className)}>
      {/* Left Navigation Panel */}
      <div className="w-64 bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-dark-border flex flex-col">
        {/* Close Button - Top of Sidebar */}
        <button
          onClick={handleBack}
          onTouchEnd={(e) => {
            e.preventDefault();
            handleBack();
          }}
          className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors rounded-lg text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700 touch-manipulation"
          aria-label={t('settings:navigation.close')}
        >
          <XMarkIcon className="w-5 h-5 flex-shrink-0" />
        </button>
        
        {/* Navigation Items */}
        <div>
          <SidebarNavigation
            items={navigationItems}
            activeItem={currentPage}
            onItemClick={handleNavigation}
          />
        </div>
      </div>

      {/* Right Content Panel */}
      <div className="flex-1 bg-white dark:bg-dark-bg">
        {renderContent()}
      </div>
    </div>
  );
};
