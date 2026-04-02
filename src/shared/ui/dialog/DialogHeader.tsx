import type { ComponentChildren, FunctionComponent } from 'preact';
import { useId } from 'preact/hooks';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { Button } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { cn } from '@/shared/utils/cn';
import { DialogDescription } from './DialogDescription';
import { DialogTitle } from './DialogTitle';

export interface DialogHeaderProps {
  children?: ComponentChildren;
  title?: ComponentChildren;
  description?: ComponentChildren;
  titleId?: string;
  descriptionId?: string;
  onClose?: () => void;
  showCloseButton?: boolean;
  className?: string;
}

export const DialogHeader: FunctionComponent<DialogHeaderProps> = ({
  children,
  title,
  description,
  titleId,
  descriptionId,
  onClose,
  showCloseButton = true,
  className,
}) => {
  const fallbackTitleId = `dialog-header-title-${useId()}`;
  const resolvedTitleId = titleId ?? fallbackTitleId;

  if (!children && !title && !description && !(showCloseButton && onClose)) return null;

  return (
    <div
      className={cn(
        'px-5 pt-5 pb-0',
        className
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-1">
          {children ?? (
            <>
              {title ? <DialogTitle id={resolvedTitleId}>{title}</DialogTitle> : null}
              {description ? <DialogDescription id={descriptionId}>{description}</DialogDescription> : null}
            </>
          )}
        </div>
      {showCloseButton && onClose && (
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onClose}
          aria-label="Close"
          className="mt-0.5 shrink-0 rounded-full text-input-placeholder hover:bg-surface-hover hover:text-input-text"
          icon={<Icon icon={XMarkIcon} className="h-4 w-4" />}
        />
      )}
      </div>
    </div>
  );
};
