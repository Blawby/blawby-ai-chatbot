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
  className?: string;
}

export const ProfileMenuItem = ({ 
  icon, 
  label, 
  onClick,
  className = ''
}: ProfileMenuItemProps) => {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-indigo-500 dark:focus:ring-offset-gray-800 flex items-center gap-2 ${className}`}
    >
      <ProfileIcon icon={icon} />
      {label}
    </button>
  );
};
