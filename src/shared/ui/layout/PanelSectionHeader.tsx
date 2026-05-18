import type { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

interface PanelSectionHeaderProps {
  title: string;
  subtitle?: string | number;
  subtitleSuffix?: string;
  actions?: ComponentChildren;
  className?: string;
}

/**
 * Standard header for Matter detail sub-panels (Notes, Expenses, etc.)
 */
export const PanelSectionHeader = ({
  title,
  subtitle,
  subtitleSuffix = '',
  actions,
  className
}: PanelSectionHeaderProps) => (
  <header className={cn('flex flex-wrap items-center justify-between gap-3 border-b border-line-glass/30 px-6 py-4', className)}>
    <div>
      <h3 className="text-sm font-semibold text-input-text">{title}</h3>
      {(subtitle !== undefined) && (
        <p className="text-xs text-input-placeholder">
          {subtitle} {subtitleSuffix}
        </p>
      )}
    </div>
    {actions && (
      <div className="flex items-center gap-2">
        {actions}
      </div>
    )}
  </header>
);
