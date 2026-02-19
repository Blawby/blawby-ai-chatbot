/**
 * UserProfileDisplay - Organism Component
 * 
 * Orchestrates collapsed/expanded states and dropdown for user profile.
 * Handles state management and user interactions.
 */

import { useState, useEffect, useRef } from 'preact/hooks';
import { UserIcon } from '@heroicons/react/24/outline';
import { ProfileButton } from '../molecules/ProfileButton';
import { ProfileDropdown } from '../molecules/ProfileDropdown';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { signOut } from '@/shared/utils/auth';
import { useNavigation } from '@/shared/utils/navigation';
import { useMobileDetection } from '@/shared/hooks/useMobileDetection';
import { useTranslation } from '@/shared/i18n/hooks';

interface UserProfileDisplayProps {
  isCollapsed?: boolean;
}

export const UserProfileDisplay = ({ 
  isCollapsed = false
}: UserProfileDisplayProps) => {
  const { t } = useTranslation(['profile', 'common']);
  const { session, isPending, error } = useSessionContext();
  const { showError } = useToastContext();
  const [showDropdown, setShowDropdown] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { navigateToAuth, navigate } = useNavigation();
  const isMobile = useMobileDetection();

  // Derive user data from session and practice
  const user = session?.user ? {
    id: session.user.id,
    name: session.user.name || session.user.email || 'User',
    email: session.user.email,
    image: session.user.image
  } : null;


  const loading = isPending;

  // Handle dropdown close when clicking outside or pressing Escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showDropdown]);

  const handleSignIn = () => {
    navigateToAuth('signin');
  };

  const handleProfileClick = () => {
    if (isMobile) {
      // On mobile, directly navigate to settings
      if (window.location.pathname.startsWith('/settings')) {
        return;
      }
      navigate('/settings');
    } else {
      // On desktop, show dropdown
      setShowDropdown(!showDropdown);
    }
  };

  const handleSettingsClick = () => {
    setShowDropdown(false);
    if (window.location.pathname.startsWith('/settings')) {
      return;
    }
    navigate('/settings');
  };

  const handleHelpClick = () => {
    setShowDropdown(false);
    navigate('/settings/help');
  };


  const handleLogoutClick = async () => {
    setShowDropdown(false);
    setSignOutError(null); // Clear any previous errors
    
    try {
      await signOut({ navigate });
    } catch (error) {
      console.error('Error signing out:', error);
      
      // Show user-friendly error message via toast
      const errorMessage = error instanceof Error && error.message
        ? error.message
        : t('profile:errors.signOutFailed');
      
      showError(
        t('profile:errors.signOutFailedTitle'),
        errorMessage
      );
      
      // Also set local error state for inline display as fallback
      setSignOutError(errorMessage);
    }
  };

  if (loading) {
    return (
      <div className={`flex items-center ${isCollapsed ? 'justify-center py-2' : 'gap-3 px-3 py-2'}`}>
        <div className="w-8 h-8 bg-surface-glass/60 rounded-full animate-pulse" />
        {!isCollapsed && <div className="w-20 h-4 bg-surface-glass/60 rounded animate-pulse" />}
      </div>
    );
  }

  // Handle session fetch errors
  if (error) {
    return (
      <div className={`p-2 border-t border-line-glass/30`}>
        <div className={`flex items-center ${isCollapsed ? 'justify-center py-2' : 'gap-3 px-3 py-2'}`}>
          <div className="w-8 h-8 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center flex-shrink-0">
            <UserIcon className="w-4 h-4 text-red-600 dark:text-red-400" />
          </div>
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-red-600 dark:text-red-400">
                Failed to load session
              </p>
              <p className="text-xs text-input-placeholder">
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
      <div className={`p-2 border-t border-line-glass/30`}>
        <button
          onClick={handleSignIn}
          className={`flex items-center w-full rounded-lg text-left transition-colors text-input-text hover:bg-surface-glass/50 ${
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
    <div className={`p-2 border-t border-line-glass/30 w-full overflow-visible`}>
      <div className="relative w-full max-w-full" ref={dropdownRef}>
        <ProfileButton
          name={user.name}
          image={user.image}
          secondaryText={user.email ?? null}
          isCollapsed={isCollapsed}
          onClick={handleProfileClick}
        />
        
        {/* Dropdown - only show on desktop */}
        {showDropdown && !isMobile && (
          <ProfileDropdown
            onSettings={handleSettingsClick}
            onHelp={handleHelpClick}
            onLogout={handleLogoutClick}
            signOutError={signOutError}
          />
        )}
      </div>
    </div>
  );
};
