import type { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

export interface PageHeaderProps {
  /**
   * Optional crumb rendered above the title in mono uppercase small caps.
   * Use to anchor the page within its parent surface (e.g. "Practice / Matters").
   */
  crumb?: ComponentChildren;
  title: string;
  /** Lede paragraph beneath the title. Source serif body, max 56ch, color ink-2. */
  subtitle?: string;
  actions?: ComponentChildren;
  className?: string;
}

/**
 * DS within-page heading (NOT a topbar): mono crumb + Source Serif H1 + lede +
 * 1px rule. Used inside Page shells.
 */
export const PageHeader = ({ crumb, title, subtitle, actions, className = '' }: PageHeaderProps) => (
  <header className={cn('page-header', className)}>
    {crumb && <div className="page-header-crumb">{crumb}</div>}
    <h1 className="page-header-title">{title}</h1>
    {subtitle && <p className="page-header-lede">{subtitle}</p>}
    {actions && <div className="page-header-actions">{actions}</div>}
  </header>
);
