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
      className={`w-full px-3 py-2 text-left text-sm text-input-text hover:bg-white/[0.04] focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-accent-500 flex items-center gap-2 ${isActive ? 'font-semibold text-input-text' : ''} ${className}`}
    >
      <ProfileIcon icon={icon} />
      {label}
    </button>
  );
};
