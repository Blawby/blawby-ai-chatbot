import type { ComponentChildren } from 'preact';
import type { Role } from '@/shared/hooks/usePracticeManagement';
import { getPracticeRoleLabel } from '@/shared/utils/practiceRoles';

const ROLE_STYLES = {
  owner: 'bg-accent-500/10 text-[rgb(var(--accent-foreground))] border border-accent-500/20 backdrop-blur-sm',
  admin: 'bg-primary-500/10 text-primary-600 dark:text-primary-400 border border-primary-500/20 backdrop-blur-sm',
  attorney: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 backdrop-blur-sm',
  paralegal: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 backdrop-blur-sm',
  member: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 backdrop-blur-sm',
  client: 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border border-gray-500/20 backdrop-blur-sm'
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
      {children || getPracticeRoleLabel(roleType)}
    </span>
  );
};
