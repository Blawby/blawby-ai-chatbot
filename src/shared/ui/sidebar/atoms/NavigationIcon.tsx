/**
 * NavigationIcon - Atom Component
 * 
 * Pure navigation icon wrapper. No interactions, no state.
 * Just renders an icon with consistent sizing and styling.
 */

import { Icon, type IconComponent } from '@/shared/ui/Icon';

interface NavigationIconProps {
  icon: IconComponent;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const NavigationIcon = ({ 
  icon, 
  size = 'md',
  className = ''
}: NavigationIconProps) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6'
  };

  return (
    <span className={`flex-shrink-0 ${className}`}>
      <Icon icon={icon} className={sizeClasses[size]} />
    </span>
  );
};
