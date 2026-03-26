import type { ComponentChildren } from 'preact';
import { ChevronLeftIcon } from '@heroicons/react/24/outline';
import { Button } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { cn } from '@/shared/utils/cn';

export interface WorkspaceListHeaderProps {
  leftControls?: ComponentChildren;
  onBack?: () => void;
  showBackButton?: boolean;
  title?: ComponentChildren;
  centerTitle?: boolean;
  controls?: ComponentChildren;
  isLoading?: boolean;
  className?: string;
  backAriaLabel?: string;
}

export const WorkspaceListHeader = ({
  leftControls,
  onBack,
  showBackButton = true,
  title,
  centerTitle = false,
  controls,
  isLoading = false,
  className,
  backAriaLabel = 'Back'
}: WorkspaceListHeaderProps) => {
  const showBack = !leftControls && showBackButton && Boolean(onBack);
  const showHeaderRow = Boolean(leftControls || showBack || title || controls || isLoading);

  if (!showHeaderRow) {
    return null;
  }

  return (
    <div className={cn('workspace-header', className)}>
      {leftControls ? (
        <div className="workspace-header__icon">{leftControls}</div>
      ) : null}
      {showBack ? (
      <Button
        type="button"
        variant="icon"
        size="icon-sm"
        onClick={onBack}
        className="workspace-header__icon"
        aria-label={backAriaLabel}
      >
        <Icon icon={ChevronLeftIcon} className="h-5 w-5" aria-hidden="true" />
      </Button>
      ) : null}
      {title ? (
        <div className={cn('workspace-header__identity', centerTitle && 'absolute left-1/2 -translate-x-1/2 text-center')}>
          {title}
        </div>
      ) : null}
      {controls ? (
        <div className={cn('workspace-header__right', !title && 'ml-0 flex w-full max-w-none justify-center')}>
          {controls}
        </div>
      ) : null}
      {isLoading ? <div className="workspace-header__loading" aria-hidden="true" /> : null}
    </div>
  );
};

export default WorkspaceListHeader;
