/**
 * ProfileMenuItem - Molecule Component
 * 
 * Individual dropdown menu item combining icon and label.
 * Handles click interaction and hover styling.
 */

import { ProfileIcon } from '../atoms/ProfileIcon';
import type { ComponentChildren } from 'preact';

interface ProfileMenuItemProps {
  icon: ComponentChildren;
  label: string;
  onClick: () => void;
  isActive?: boolean;
  className?: string;
}

export const ProfileMenuItem = ({ 
  icon, 
  label, 
  onClick,
  isActive = false,
  className = ''
}: ProfileMenuItemProps) => {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      aria-current={isActive ? 'page' : undefined}
      className={`w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-bg focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-accent-500 dark:focus:ring-offset-dark-bg flex items-center gap-2 ${isActive ? 'font-semibold text-gray-900 dark:text-white' : ''} ${className}`}
    >
      <ProfileIcon icon={icon} />
      {label}
    </button>
  );
};
