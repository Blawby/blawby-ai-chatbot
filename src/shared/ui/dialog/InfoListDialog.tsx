import type { ComponentChildren, ComponentType, FunctionComponent, JSX } from 'preact';
import { useId } from 'preact/hooks';
import { Dialog } from './Dialog';
import { DialogBody } from './DialogBody';
import { DialogFooter } from './DialogFooter';
import { DialogHeader } from './DialogHeader';
import { DialogDescription } from './DialogDescription';
import { DialogTitle } from './DialogTitle';
import { Icon } from '@/shared/ui/Icon';
import { Button } from '@/shared/ui/Button';
import { SectionDivider } from '@/shared/ui/layout';

type IconComponent = ComponentType<JSX.SVGAttributes<SVGSVGElement>>;

export type InfoListDialogItem = {
  id: string;
  icon: IconComponent;
  title: ComponentChildren;
  description: ComponentChildren;
  iconClassName?: string;
};

export interface InfoListDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: ComponentChildren;
  description?: ComponentChildren;
  headerIcon?: IconComponent;
  headerIconClassName?: string;
  items: InfoListDialogItem[];
  actionLabel: ComponentChildren;
  onAction: () => void;
  actionDisabled?: boolean;
  actionSize?: 'sm' | 'md' | 'lg';
  actionFullWidth?: boolean;
  contentClassName?: string;
}

export const InfoListDialog: FunctionComponent<InfoListDialogProps> = ({
  isOpen,
  onClose,
  title,
  description,
  headerIcon,
  headerIconClassName,
  items,
  actionLabel,
  onAction,
  actionDisabled = false,
  actionSize = 'lg',
  actionFullWidth = true,
  contentClassName = 'max-w-md',
}) => {
  const HeaderIcon = headerIcon;
  const titleId = `info-list-dialog-title-${useId()}`;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      showCloseButton={false}
      contentClassName={contentClassName}
      ariaLabelledBy={titleId}
    >
      <DialogHeader onClose={onClose} showCloseButton className="pb-2">
        <div className="flex items-start gap-3">
          {HeaderIcon ? (
            <div className="glass-input mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl">
              <Icon icon={HeaderIcon} className={headerIconClassName ?? 'h-5 w-5 text-input-text'} aria-hidden="true" />
            </div>
          ) : null}
          <div className="min-w-0 space-y-1">
            <DialogTitle id={titleId}>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </div>
        </div>
      </DialogHeader>

      <DialogBody className="space-y-2">
        {items.map((item, index) => (
          <div key={item.id}>
            <div className="flex items-start gap-3 py-1">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white/5">
                <Icon icon={item.icon} className={item.iconClassName ?? 'h-5 w-5 text-input-text'} aria-hidden="true" />
              </div>
              <div className="min-w-0 space-y-1">
                <div className="text-sm font-semibold text-input-text">
                  {item.title}
                </div>
                <div className="text-sm text-input-placeholder">
                  {item.description}
                </div>
              </div>
            </div>
            {index < items.length - 1 ? <SectionDivider /> : null}
          </div>
        ))}
      </DialogBody>

      <DialogFooter>
        <Button
          variant="primary"
          size={actionSize}
          onClick={onAction}
          disabled={actionDisabled}
          className={actionFullWidth ? 'w-full' : undefined}
        >
          {actionLabel}
        </Button>
      </DialogFooter>
    </Dialog>
  );
};
