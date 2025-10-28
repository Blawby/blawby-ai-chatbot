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
      onClick={onClick}
      className={`w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 ${className}`}
    >
      <ProfileIcon icon={icon} />
      {label}
    </button>
  );
};
