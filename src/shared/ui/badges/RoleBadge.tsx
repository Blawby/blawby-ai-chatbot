import type { ComponentChildren } from 'preact';
import type { Role } from '@/shared/hooks/usePracticeManagement';

const ROLE_STYLES = {
  owner: 'bg-accent-500 text-gray-900',
  admin: 'bg-primary-500 text-white',
  attorney: 'bg-blue-500 text-white',
  paralegal: 'bg-green-500 text-white'
};

interface RoleBadgeProps {
  roleType: Role;
  children?: ComponentChildren;
  className?: string;
}

export const RoleBadge = ({ roleType, children, className }: RoleBadgeProps) => {
  const roleStyles = ROLE_STYLES[roleType] || '';
  const baseClasses = 'px-2 py-1 text-xs font-medium rounded';
  const combinedClasses = className ? `${baseClasses} ${roleStyles} ${className}` : `${baseClasses} ${roleStyles}`;
  
  return (
    <span className={combinedClasses}>
      {children || roleType.charAt(0).toUpperCase() + roleType.slice(1)}
    </span>
  );
};
