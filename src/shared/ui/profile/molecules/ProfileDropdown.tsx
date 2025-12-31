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
  ArrowRightOnRectangleIcon,
  UserIcon,
  BuildingOfficeIcon
} from '@heroicons/react/24/outline';
import { useTranslation } from '@/shared/i18n/hooks';
import { type SubscriptionTier } from '@/shared/types/user';

interface ProfileDropdownProps {
  tier: SubscriptionTier;
  onUpgrade: () => void;
  onSettings: () => void;
  onHelp: () => void;
  onLogout: () => void;
  onSwitchToClient?: () => void;
  onSwitchToPractice?: () => void;
  workspace?: 'client' | 'practice';
  hasPractice?: boolean;
  practiceLabel?: string | null;
  signOutError?: string | null;
  className?: string;
}

export const ProfileDropdown = ({ 
  tier, 
  onUpgrade, 
  onSettings, 
  onHelp, 
  onLogout,
  onSwitchToClient,
  onSwitchToPractice,
  workspace,
  hasPractice = false,
  practiceLabel,
  signOutError,
  className = ''
}: ProfileDropdownProps) => {
  const { t } = useTranslation(['profile', 'common']);
  const showWorkspaceSwitcher = Boolean(onSwitchToClient && onSwitchToPractice);
  const practiceLabelText = hasPractice
    ? (practiceLabel ? t('profile:practiceViewWithName', { practiceLabel }) : t('profile:practiceView'))
    : t('profile:createPractice');

  return (
    <div 
      role="menu"
      aria-orientation="vertical"
      aria-label="Profile menu"
      className={`absolute bottom-full right-0 mb-2 w-full max-w-xs bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-2 z-50 ${className}`}
    >
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

      {showWorkspaceSwitcher && (
        <>
          {/* Separator */}
          <div className="border-t border-gray-200 dark:border-gray-700 my-1" />

          <div className="px-3 py-1 text-[11px] uppercase tracking-wide text-gray-400">
            {t('profile:workspace')}
          </div>
          <ProfileMenuItem
            icon={<UserIcon />}
            label={t('profile:clientView')}
            onClick={onSwitchToClient ?? (() => {})}
            isActive={workspace === 'client'}
          />
          <ProfileMenuItem
            icon={<BuildingOfficeIcon />}
            label={practiceLabelText}
            onClick={onSwitchToPractice ?? (() => {})}
            isActive={workspace === 'practice'}
          />
        </>
      )}
      
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
      
      {/* Error message display */}
      {signOutError && (
        <>
          <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
          <div className="px-3 py-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-l-2 border-red-200 dark:border-red-800">
            {signOutError}
          </div>
        </>
      )}
    </div>
  );
};
