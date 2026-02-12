/**
 * ProfileDropdown - Molecule Component
 * 
 * Complete dropdown menu with all profile menu items.
 * Handles the dropdown layout and positioning.
 */

import { ProfileMenuItem } from './ProfileMenuItem';
import {
  SparklesIcon,
  Cog6ToothIcon,
  QuestionMarkCircleIcon,
  ArrowRightOnRectangleIcon
} from '@heroicons/react/24/outline';
import { useTranslation } from '@/shared/i18n/hooks';
import { type SubscriptionTier } from '@/shared/types/user';

interface ProfileDropdownProps {
  tier: SubscriptionTier;
  onUpgrade: () => void;
  onSettings: () => void;
  onHelp: () => void;
  onLogout: () => void;
  signOutError?: string | null;
  className?: string;
}

export const ProfileDropdown = ({ 
  tier, 
  onUpgrade, 
  onSettings, 
  onHelp, 
  onLogout,
  signOutError,
  className = ''
}: ProfileDropdownProps) => {
  const { t } = useTranslation(['profile', 'common']);

  return (
    <div 
      role="menu"
      aria-orientation="vertical"
      aria-label="Profile menu"
      className={`absolute bottom-full right-0 mb-2 w-full max-w-xs bg-surface-glass/80 backdrop-blur-xl rounded-lg shadow-glass border border-line-glass/30 py-2 z-50 ${className}`}
    >
      {/* Upgrade Plan - only for free tier */}
      {tier === 'free' && (
        <ProfileMenuItem
          icon={<SparklesIcon />}
          label={t('profile:menu.upgrade')}
          onClick={onUpgrade}
        />
      )}
      
      {/* Settings */}
      <ProfileMenuItem
        icon={<Cog6ToothIcon />}
        label={t('profile:menu.settings')}
        onClick={onSettings}
      />

      {/* Separator */}
      <div className="border-t border-line-glass/30 my-1" />
      
      {/* Help */}
      <ProfileMenuItem
        icon={<QuestionMarkCircleIcon />}
        label={t('profile:menu.help')}
        onClick={onHelp}
      />
      
      {/* Log out */}
      <ProfileMenuItem
        icon={<ArrowRightOnRectangleIcon />}
        label={t('profile:menu.signOut')}
        onClick={onLogout}
      />
      
      {/* Error message display */}
      {signOutError && (
        <>
          <div className="border-t border-line-glass/30 my-1" />
          <div className="px-3 py-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-l-2 border-red-200 dark:border-red-800">
            {signOutError}
          </div>
        </>
      )}
    </div>
  );
};
