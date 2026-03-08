/**
 * ProfileIcon - Atom Component
 * 
 * Pure icon wrapper for profile menu items.
 * No interactions, no state. Just renders an icon with consistent sizing.
 */

import { Icon, type IconComponent } from '@/shared/ui/Icon';

interface ProfileIconProps {
  icon: IconComponent;
  className?: string;
}

export const ProfileIcon = ({ 
  icon, 
  className = ''
}: ProfileIconProps) => {
  return (
    <span className={`flex-shrink-0 ${className}`}>
      <Icon icon={icon} className="w-4 h-4" aria-hidden="true" />
    </span>
  );
};
