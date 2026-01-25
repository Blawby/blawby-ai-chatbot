import type { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ComponentChildren;
  className?: string;
}

export const PageHeader = ({ title, subtitle, actions, className = '' }: PageHeaderProps) => (
  <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between', className)}>
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">{title}</h1>
      {subtitle && <p className="text-sm text-gray-600 dark:text-gray-400">{subtitle}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
);
