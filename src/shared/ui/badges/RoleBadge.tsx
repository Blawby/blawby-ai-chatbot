import type { ComponentChildren } from 'preact';
import type { Role } from '@/shared/hooks/usePracticeManagement';
import { getPracticeRoleLabel } from '@/shared/utils/practiceRoles';
import { cn } from '@/shared/utils/cn';

const ROLE_STYLES: Record<Role, string> = {
  owner: 'status-success',
  admin: 'status-info',
  attorney: 'status-info',
  paralegal: 'status-info',
  member: 'status-info',
  client: 'status-warning'
};

interface RoleBadgeProps {
  roleType: Role;
  children?: ComponentChildren;
  className?: string;
}

export const RoleBadge = ({ roleType, children, className }: RoleBadgeProps) => {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-1 text-xs font-medium rounded-full',
        ROLE_STYLES[roleType] ?? 'status-info',
        className
      )}
    >
      {children || getPracticeRoleLabel(roleType)}
    </span>
  );
};
