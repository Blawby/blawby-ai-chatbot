/**
 * ProfileDropdown - Molecule Component
 * 
 * Complete dropdown menu with all profile menu items.
 * Handles the dropdown layout and positioning.
 */

import { ProfileMenuItem } from './ProfileMenuItem';
import { SparklesIcon, Cog6ToothIcon, QuestionMarkCircleIcon, ArrowRightOnRectangleIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n/hooks';
import { type SubscriptionTier } from '../../../../types/user';

interface ProfileDropdownProps {
  tier: SubscriptionTier;
  onUpgrade: () => void;
  onSettings: () => void;
  onHelp: () => void;
  onLogout: () => void;
  className?: string;
}

export const ProfileDropdown = ({ 
  tier, 
  onUpgrade, 
  onSettings, 
  onHelp, 
  onLogout,
  className = ''
}: ProfileDropdownProps) => {
  const { t } = useTranslation(['profile', 'common']);

  return (
    <div className={`absolute bottom-full right-0 mb-2 w-full max-w-xs bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-2 z-50 ${className}`}>
      {/* Upgrade Plan - unified for all non-enterprise tiers */}
      {tier !== 'enterprise' && (
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
      <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
      
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
    </div>
  );
};
