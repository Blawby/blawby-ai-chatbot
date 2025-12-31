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
import { useSession, updateUser } from '@/shared/lib/authClient';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { signOut } from '@/shared/utils/auth';
import { useNavigation } from '@/shared/utils/navigation';
import { useMobileDetection } from '@/shared/hooks/useMobileDetection';
import { useTranslation } from '@/shared/i18n/hooks';
import { type SubscriptionTier } from '@/shared/types/user';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { useWorkspace } from '@/shared/hooks/useWorkspace';
import { setActivePractice } from '@/shared/lib/apiClient';

interface UserProfileDisplayProps {
  isCollapsed?: boolean;
  currentPractice?: {
    id: string;
    subscriptionTier?: string;
  } | null;
}

export const UserProfileDisplay = ({ 
  isCollapsed = false, 
  currentPractice 
}: UserProfileDisplayProps) => {
  const { t } = useTranslation(['profile', 'common']);
  const { data: session, isPending, error } = useSession();
  const { showError } = useToastContext();
  const { currentPractice: managedPractice, practices } = usePracticeManagement();
  const { workspaceFromPath, preferredWorkspace, preferredPracticeId, hasPractice } = useWorkspace();
  const [showDropdown, setShowDropdown] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { navigateToAuth, navigate } = useNavigation();
  const isMobile = useMobileDetection();
  const practiceForTier = currentPractice ?? managedPractice ?? null;

  // Derive user data from session and practice
  const user = session?.user ? {
    id: session.user.id,
    name: session.user.name || session.user.email || 'User',
    email: session.user.email,
    image: session.user.image,
    practiceId: practiceForTier?.id || null,
    role: 'user',
    phone: null,
    subscriptionTier: (practiceForTier?.subscriptionTier || 'free') as SubscriptionTier
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

  const handleUpgrade = () => {
    window.location.hash = '#pricing';
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

  const handleUpgradeClick = () => {
    setShowDropdown(false);
    window.location.hash = '#pricing';
  };

  const handleHelpClick = () => {
    setShowDropdown(false);
    navigate('/settings/help');
  };

  const resolvedPracticeId = preferredPracticeId ?? practiceForTier?.id ?? practices[0]?.id ?? null;
  const practiceLabel = managedPractice?.name ?? practices[0]?.name ?? null;
  const currentWorkspace = (workspaceFromPath === 'client' || workspaceFromPath === 'practice')
    ? workspaceFromPath
    : (preferredWorkspace ?? (hasPractice ? 'practice' : 'client'));

  const handleSwitchToClient = async () => {
    setShowDropdown(false);
    try {
      await updateUser({ primaryWorkspace: 'client', preferredPracticeId: null } as Parameters<typeof updateUser>[0]);
      navigate('/app', true);
    } catch (_error) {
      showError('Workspace switch failed', 'We could not switch to the client view.');
    }
  };

  const handleSwitchToPractice = async () => {
    setShowDropdown(false);
    const previousPreferredPracticeId = preferredPracticeId ?? practiceForTier?.id ?? null;
    try {
      if (resolvedPracticeId) {
        await setActivePractice(resolvedPracticeId);
      }
      await updateUser({
        primaryWorkspace: 'practice',
        preferredPracticeId: resolvedPracticeId
      } as Parameters<typeof updateUser>[0]);
      navigate(resolvedPracticeId ? '/practice' : '/cart', true);
    } catch (_error) {
      console.error('[Profile] Failed to switch to practice workspace', {
        resolvedPracticeId,
        error: _error
      });
      if (previousPreferredPracticeId && previousPreferredPracticeId !== resolvedPracticeId) {
        try {
          await setActivePractice(previousPreferredPracticeId);
        } catch (rollbackError) {
          console.error('[Profile] Failed to restore previous practice selection', {
            previousPreferredPracticeId,
            error: rollbackError
          });
        }
      }
      showError('Workspace switch failed', 'We could not switch to the practice view.');
    }
  };

  const handleLogoutClick = async () => {
    setShowDropdown(false);
    setSignOutError(null); // Clear any previous errors
    
    try {
      await signOut();
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
    <div className={`p-2 border-t border-gray-200 dark:border-dark-border w-full overflow-visible`}>
      <div className="relative w-full max-w-full" ref={dropdownRef}>
        <ProfileButton
          name={user.name}
          image={user.image}
          tier={user.subscriptionTier}
          isCollapsed={isCollapsed}
          onClick={handleProfileClick}
          onUpgrade={handleUpgrade}
        />
        
        {/* Dropdown - only show on desktop */}
        {showDropdown && !isMobile && (
          <ProfileDropdown
            tier={user.subscriptionTier}
            onUpgrade={handleUpgradeClick}
            onSettings={handleSettingsClick}
            onHelp={handleHelpClick}
            onLogout={handleLogoutClick}
            onSwitchToClient={handleSwitchToClient}
            onSwitchToPractice={handleSwitchToPractice}
            workspace={currentWorkspace}
            hasPractice={hasPractice}
            practiceLabel={practiceLabel}
            signOutError={signOutError}
          />
        )}
      </div>
    </div>
  );
};
