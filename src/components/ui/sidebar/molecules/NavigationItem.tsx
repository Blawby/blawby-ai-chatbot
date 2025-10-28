/**
 * NavigationItem - Molecule Component
 * 
 * Complete navigation item combining icon, label, and optional status dot.
 * Handles active state styling and click interactions.
 */

import { NavigationIcon } from '../atoms/NavigationIcon';
import { StatusDot } from '../atoms/StatusDot';
import { MatterStatus } from '../../../../types/matter';
import type { ComponentChildren } from 'preact';

interface NavigationItemProps {
  icon: ComponentChildren;
  label: string;
  isActive: boolean;
  onClick: () => void;
  isCollapsed: boolean;
  matterStatus?: MatterStatus;
  className?: string;
}

export const NavigationItem = ({ 
  icon, 
  label, 
  isActive, 
  onClick, 
  isCollapsed,
  matterStatus,
  className = ''
}: NavigationItemProps) => {
  const baseClasses = 'flex items-center w-full rounded-lg text-left transition-colors';
  const collapsedClasses = isCollapsed ? 'justify-center py-2' : 'gap-2 px-2 py-2';
  const activeClasses = isActive 
    ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white' 
    : 'text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-dark-hover';

  return (
    <div className="relative">
      <button
        onClick={onClick}
        className={`${baseClasses} ${collapsedClasses} ${activeClasses} ${className}`}
        aria-current={isActive ? 'page' : undefined}
        aria-label={`${label}${matterStatus ? `, ${matterStatus}` : ''}`}
        title={isCollapsed ? label : undefined}
      >
        <NavigationIcon icon={icon} size="md" />
        {!isCollapsed && <span className="text-sm font-medium">{label}</span>}
      </button>
      {/* Status dot for matter status */}
      <StatusDot status={matterStatus} />
    </div>
  );
};
