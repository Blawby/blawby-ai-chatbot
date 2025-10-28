/**
 * ProfileIcon - Atom Component
 * 
 * Pure icon wrapper for profile menu items.
 * No interactions, no state. Just renders an icon with consistent sizing.
 */

import type { ComponentChildren } from 'preact';

interface ProfileIconProps {
  icon: ComponentChildren;
  className?: string;
}

export const ProfileIcon = ({ 
  icon, 
  className = ''
}: ProfileIconProps) => {
  return (
    <span className={`w-4 h-4 flex-shrink-0 ${className}`}>
      {icon}
    </span>
  );
};
