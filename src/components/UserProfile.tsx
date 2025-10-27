import { useState, useEffect, useRef } from 'preact/hooks';
import { UserIcon, Cog6ToothIcon, SparklesIcon, QuestionMarkCircleIcon, ArrowRightOnRectangleIcon } from '@heroicons/react/24/outline';
import { useSession } from '../contexts/AuthContext';
import { signOut } from '../utils/auth';
import { sanitizeUserImageUrl } from '../utils/urlValidation';
import { useNavigation } from '../utils/navigation';
import { type SubscriptionTier } from '../types/user';
import { getTierDisplayName } from '../utils/stripe-products';
import { debounce } from '../utils/debounce';
import { useTranslation } from '@/i18n/hooks';
import { useOrganizationManagement } from '../hooks/useOrganizationManagement';
// import type { User } from '../types/backend';

interface _User {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  organizationId?: string | null;
  role?: string | null;
  phone?: string | null;
  subscriptionTier?: SubscriptionTier;
}

interface UserProfileProps {
  isCollapsed?: boolean;
  isMobile?: boolean;
}

const UserProfile = ({ isCollapsed = false }: UserProfileProps) => {
  const { t } = useTranslation(['profile', 'common']);
  const { currentOrganization } = useOrganizationManagement();
  const session = useSession();
  const [showDropdown, setShowDropdown] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { navigateToAuth, navigate } = useNavigation();

  // Extract session data from new backend API structure
  const sessionData = session?.data;
  const isPending = session?.isPending || false;
  const error = sessionData?.error ?? null;
  
  if (import.meta.env.DEV) {
    // Minimal, non‑PII diagnostics
    // console.debug('UserProfile session pending:', isPending, 'hasError:', Boolean(error));
  }

  // Handle session fetch errors
  useEffect(() => {
    if (error) {
      console.error('Failed to load session:', error);
    }
  }, [error]);

  // Derive user data from session and organization
  const user = sessionData?.user ? {
    id: sessionData.user.id,
    name: (() => {
      // Check for stored display name from onboarding first
      try {
        const storedDisplayName = localStorage.getItem('userDisplayName');
        if (storedDisplayName) {
          return storedDisplayName;
        }
      } catch (error) {
        // localStorage might not be available
        console.warn('Failed to access localStorage for user display name:', error);
      }
      
      // Fall back to backend user name or email
      return sessionData.user.name || sessionData.user.email || 'User';
    })(),
    email: sessionData.user.email,
    image: null, // Backend API doesn't provide image yet
    organizationId: sessionData.session?.activeOrganizationId || currentOrganization?.id || null,
    role: 'user', // Default role
    phone: null,
    subscriptionTier: (currentOrganization?.subscriptionTier || 'free') as SubscriptionTier
  } : null;

  const loading = isPending;

  // Mobile detection with debouncing
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    
    checkMobile();
    
    // Create debounced resize handler for performance
    const debouncedResizeHandler = debounce(checkMobile, 100);
    window.addEventListener('resize', debouncedResizeHandler);
    
    return () => {
      window.removeEventListener('resize', debouncedResizeHandler);
      debouncedResizeHandler.cancel();
    };
  }, []);

  // Handle dropdown close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDropdown]);



  const handleSignIn = () => {
    // Navigate to auth page (no actual auth required)
    navigateToAuth('signin');
  };


  const handleUpgrade = () => {
    window.location.hash = '#pricing';
  };

  const handleProfileClick = () => {
    if (isMobile) {
      // On mobile, directly navigate to settings (skip dropdown)
      navigate('/app/settings');
    } else {
      // On desktop, show dropdown
      setShowDropdown(!showDropdown);
    }
  };

  const handleSettingsClick = () => {
    setShowDropdown(false);
    navigate('/app/settings');
  };

  const handleUpgradeClick = () => {
    setShowDropdown(false);
    window.location.hash = '#pricing';
  };

  const handleHelpClick = () => {
    setShowDropdown(false);
    navigate('/app/settings/help');
  };

  const handleLogoutClick = async () => {
    setShowDropdown(false);
    
    try {
      // Use centralized sign out utility
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };


  const tierDisplay = (tier: SubscriptionTier) => getTierDisplayName(tier);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const renderAvatar = () => {
    const sanitizedImageUrl = sanitizeUserImageUrl(user.image);
    return sanitizedImageUrl ? (
      <img 
        src={sanitizedImageUrl} 
        alt={user.name}
        className="w-full h-full rounded-full object-cover"
      />
    ) : (
      <span className="text-white text-sm font-medium">
        {getInitials(user.name)}
      </span>
    );
  };

  const renderDropdown = () => {
    if (!showDropdown || isMobile) return null;
    
    return (
      <div className="absolute bottom-full right-0 mb-2 w-full max-w-xs bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-2 z-50">
        {/* Upgrade Plan - unified for all non-enterprise tiers */}
        {user.subscriptionTier !== 'enterprise' && (
          <button
            onClick={handleUpgradeClick}
            className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
          >
            <SparklesIcon className="w-4 h-4" />
            {t('profile:menu.upgrade')}
          </button>
        )}
        
        {/* Settings */}
        <button
          onClick={handleSettingsClick}
          className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
        >
          <Cog6ToothIcon className="w-4 h-4" />
          {t('profile:menu.settings')}
        </button>
        
        {/* Separator */}
        <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
        
        {/* Help */}
        <button
          onClick={handleHelpClick}
          className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
        >
          <QuestionMarkCircleIcon className="w-4 h-4" />
          {t('profile:menu.help')}
        </button>
        
        {/* Log out */}
        <button
          onClick={handleLogoutClick}
          className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
          data-testid="user-signout-button"
        >
          <ArrowRightOnRectangleIcon className="w-4 h-4" />
          {t('profile:menu.signOut')}
        </button>
      </div>
    );
  };

  if (loading) {
    return (
      <div className={`flex items-center ${isCollapsed ? 'justify-center py-2' : 'gap-3 px-3 py-2'}`}>
        <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
        {!isCollapsed && <div className="w-20 h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />}
      </div>
    );
  }

  // Handle session fetch errors
  if (error) {
    return (
      <div className={`p-2 border-t border-gray-200 dark:border-dark-border`}>
        <div className={`flex items-center ${isCollapsed ? 'justify-center py-2' : 'gap-3 px-3 py-2'}`}>
          <div className="w-8 h-8 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center flex-shrink-0">
            <UserIcon className="w-4 h-4 text-red-600 dark:text-red-400" />
          </div>
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-red-600 dark:text-red-400">
                Failed to load session
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Please try refreshing the page
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className={`p-2 border-t border-gray-200 dark:border-dark-border`}>
        <button
          onClick={handleSignIn}
          className={`flex items-center w-full rounded-lg text-left transition-colors text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-hover ${
            isCollapsed 
              ? 'justify-center py-2' 
              : 'gap-3 px-3 py-2'
          }`}
          title={isCollapsed ? t('profile:menu.signIn') : undefined}
          aria-label={t('profile:aria.signInButton')}
        >
          <UserIcon className="w-5 h-5 flex-shrink-0" />
          {!isCollapsed && <span className="text-sm font-medium">{t('profile:menu.signIn')}</span>}
        </button>
      </div>
    );
  }

  return (
    <div className={`p-2 border-t border-gray-200 dark:border-dark-border`}>
      {isCollapsed ? (
        // Collapsed state - just show avatar with dropdown
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={handleProfileClick}
            className="w-8 h-8 rounded-full bg-gray-600 dark:bg-gray-700 flex items-center justify-center flex-shrink-0 mx-auto"
            title={user.name}
            aria-label={`User profile for ${user.name}`}
            data-testid="user-profile-button"
          >
            {renderAvatar()}
          </button>
          
          {/* Dropdown - only show on desktop */}
          {renderDropdown()}
        </div>
      ) : (
        // Expanded state - show full profile with tier and upgrade button
        <div className="space-y-3">
          {/* Profile Section */}
          <div className="relative flex items-center gap-2 min-w-0" ref={dropdownRef}>
            <button
              onClick={handleProfileClick}
              className="flex items-center gap-3 flex-1 text-left hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg p-2 transition-colors"
              aria-label={t('profile:aria.userProfile', { name: user.name })}
              data-testid="user-profile-button"
            >
              <div className="w-8 h-8 rounded-full bg-gray-600 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                {renderAvatar()}
              </div>
              <div className="flex-1 min-w-0 overflow-hidden">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate" title={user.name}>{user.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-300 truncate" title={tierDisplay(user.subscriptionTier || 'free')}>
                  {tierDisplay(user.subscriptionTier || 'free')}
                </p>
              </div>
            </button>
            
            {/* Upgrade Button - unified for all non-enterprise tiers */}
            {user.subscriptionTier !== 'enterprise' && (
              <button
                onClick={handleUpgrade}
                className="px-2 py-1 text-xs font-medium text-gray-900 dark:text-white bg-transparent border border-gray-300 dark:border-gray-600 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex-shrink-0"
                title="Upgrade your plan"
              >
                {t('profile:menu.upgradeShort')}
              </button>
            )}
            
            {/* Enterprise Badge - non-clickable for max tier users */}
            {user.subscriptionTier === 'enterprise' && (
              <span className="px-2 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-full flex-shrink-0">
                Enterprise
              </span>
            )}
            
            {/* Dropdown - only show on desktop */}
            {renderDropdown()}
          </div>
        </div>
      )}
    </div>
  );
};

export default UserProfile;
