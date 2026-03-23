import type { ComponentChildren } from 'preact';
import { ChevronLeftIcon, InformationCircleIcon } from '@heroicons/react/24/outline';
import { Button } from '@/shared/ui/Button';
import { cn } from '@/shared/utils/cn';

export type DetailHeaderProps = {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  leadingAction?: ComponentChildren;
  actions?: ComponentChildren;
  onInspector?: () => void;
  inspectorOpen?: boolean;
  className?: string;
};

export const DetailHeader = ({
  title,
  subtitle,
  showBack = false,
  onBack,
  leadingAction,
  actions,
  onInspector,
  inspectorOpen = false,
  className,
}: DetailHeaderProps) => {
  const resolvedTitle = typeof title === 'string' ? title : '';
  const resolvedSubtitle = typeof subtitle === 'string' ? subtitle : undefined;

  return (
    <header className={cn('workspace-header', className)}>
      {(leadingAction || showBack) ? (
        <div className="workspace-header__icon flex items-center gap-2">
          {leadingAction}
          {showBack ? (
            <Button
              type="button"
              variant="icon"
              size="icon-sm"
              onClick={onBack}
              aria-label="Back"
              icon={ChevronLeftIcon} iconClassName="h-5 w-5"
            />
          ) : null}
        </div>
      ) : null}
      <div className="workspace-header__identity">
        <h1 className="workspace-header__title">{resolvedTitle}</h1>
        {resolvedSubtitle ? <p className="workspace-header__subtitle">{resolvedSubtitle}</p> : null}
      </div>
      {(actions || onInspector) ? (
        <div className="workspace-header__right">
          {actions}
          {onInspector ? (
            <Button
              type="button"
              variant={inspectorOpen ? 'secondary' : 'icon'}
              size="icon-sm"
              onClick={onInspector}
              aria-label={inspectorOpen ? 'Close inspector' : 'Open inspector'}
              icon={InformationCircleIcon} iconClassName="h-5 w-5"
            />
          ) : null}
        </div>
      ) : null}
    </header>
  );
};

export default DetailHeader;
