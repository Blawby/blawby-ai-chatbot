import type { ComponentChildren } from 'preact';
import { ChevronLeft, MoreVertical } from 'lucide-preact';

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
  /** Optional badge rendered inline next to the title (e.g. "Unread" pill). */
  titleBadge?: ComponentChildren;
  /** Optional second row rendered below the main header row, sharing the bottom border.
   *  Used by Pencil to surface the contact info strip (email · phone · linked matter). */
  secondaryRow?: ComponentChildren;
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
  titleBadge,
  secondaryRow,
}: DetailHeaderProps) => {
  const resolvedTitle = typeof title === 'string' ? title : '';
  const resolvedSubtitle = typeof subtitle === 'string' ? subtitle : undefined;

  const headerRow = (
    <header
      className={cn(
        'workspace-header',
        secondaryRow ? '!border-b-0 !min-h-0 !pb-1.5' : null,
        secondaryRow ? null : className
      )}
    >
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
              icon={ChevronLeft} iconClassName="h-5 w-5"
            />
          ) : null}
        </div>
      ) : null}
      <div className="workspace-header__identity">
        {titleBadge ? (
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="workspace-header__title">{resolvedTitle}</h1>
            {titleBadge}
          </div>
        ) : (
          <h1 className="workspace-header__title">{resolvedTitle}</h1>
        )}
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
              icon={MoreVertical} iconClassName="h-5 w-5"
            />
          ) : null}
        </div>
      ) : null}
    </header>
  );

  if (!secondaryRow) return headerRow;

  return (
    <div className={cn('flex flex-col border-b border-card-border bg-transparent', className)}>
      {headerRow}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-4 pb-2 text-xs text-input-placeholder">
        {secondaryRow}
      </div>
    </div>
  );
};

export default DetailHeader;
