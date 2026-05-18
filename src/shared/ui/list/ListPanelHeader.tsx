import type { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

export interface ListPanelHeaderProps {
  title: string;
  count: number;
  leftControl?: ComponentChildren;
  action?: ComponentChildren;
  className?: string;
}

export const ListPanelHeader = ({
  title,
  count,
  leftControl,
  action,
  className
}: ListPanelHeaderProps) => {
  return (
    <header className={cn('workspace-header', className)}>
      {leftControl ? <div className="workspace-header__icon">{leftControl}</div> : null}
      <div className="workspace-header__identity">
        <h2 className="workspace-header__title">{title}</h2>
        <p className="workspace-header__subtitle">{count} showing</p>
      </div>
      {action ? <div className="workspace-header__right">{action}</div> : null}
    </header>
  );
};

export default ListPanelHeader;
