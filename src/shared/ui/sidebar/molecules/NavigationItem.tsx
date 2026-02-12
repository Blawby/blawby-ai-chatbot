/**
 * NavigationItem - Molecule Component
 * 
 * Complete navigation item combining icon, label, and optional status dot.
 * Handles active state styling and click interactions.
 */

import { NavigationIcon } from '../atoms/NavigationIcon';
import { StatusDot } from '../atoms/StatusDot';
import { NotificationDot } from '../atoms/NotificationDot';
import { MatterStatus } from '@/shared/types/matter';
import type { ComponentChildren } from 'preact';

/**
 * Translates matter status to user-friendly screen reader text
 */
const translateMatterStatus = (status: MatterStatus | null | undefined): string => {
  if (!status) return '';
  
  switch (status) {
    case 'ready':
      return 'status: ready';
    case 'incomplete':
      return 'status: incomplete';
    case 'empty':
      return 'status: empty';
    default:
      return `status: ${status}`;
  }
};

interface NavigationItemProps {
  icon: ComponentChildren;
  label: string;
  isActive: boolean;
  onClick: () => void;
  isCollapsed: boolean;
  matterStatus?: MatterStatus;
  hasUnread?: boolean;
  showUnreadDot?: boolean;
  className?: string;
}

export const NavigationItem = ({ 
  icon, 
  label, 
  isActive, 
  onClick, 
  isCollapsed,
  matterStatus,
  hasUnread = false,
  showUnreadDot = false,
  className = ''
}: NavigationItemProps) => {
  const baseClasses = 'flex items-center w-full rounded-lg text-left transition-colors';
  const collapsedClasses = isCollapsed ? 'justify-center py-2' : 'gap-2 px-2 py-2';
  const activeClasses = isActive
    ? 'bg-surface-glass/60 text-input-text'
    : 'text-input-text hover:bg-surface-glass/50';
  const labelClasses = hasUnread ? 'font-semibold' : 'font-medium';

  return (
    <div className="relative">
      <button
            type="button"
        onClick={onClick}
        className={`${baseClasses} ${collapsedClasses} ${activeClasses} ${className}`}
        aria-current={isActive ? 'page' : undefined}
        aria-label={`${label}${matterStatus ? `, ${translateMatterStatus(matterStatus)}` : ''}`}
        title={isCollapsed ? label : undefined}
      >
        <NavigationIcon icon={icon} size="md" />
        {!isCollapsed && <span className={`text-sm ${labelClasses}`}>{label}</span>}
      </button>
      {/* Status dot for matter status */}
      <StatusDot status={matterStatus} />
      <NotificationDot show={showUnreadDot} className={hasUnread ? 'bg-accent-500' : 'bg-accent-400/70'} />
    </div>
  );
};
