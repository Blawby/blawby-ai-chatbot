import type { IconComponent } from '@/shared/ui/Icon';
import { Button } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { cn } from '@/shared/utils/cn';

export type WorkspacePlaceholderAction = {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
  icon?: IconComponent;
  iconClassName?: string;
};

type WorkspacePlaceholderStateProps = {
  icon?: IconComponent;
  title: string;
  description: string;
  caption?: string;
  primaryAction?: WorkspacePlaceholderAction;
  secondaryAction?: WorkspacePlaceholderAction;
  className?: string;
};

const renderActionButton = (action: WorkspacePlaceholderAction) => (
  <Button
    key={action.label}
    size="sm"
    variant={action.variant ?? 'primary'}
    icon={action.icon}
    iconClassName={action.iconClassName ?? 'h-4 w-4'}
    onClick={action.onClick}
    disabled={action.disabled}
  >
    {action.label}
  </Button>
);

export const WorkspacePlaceholderState = ({
  icon,
  title,
  description,
  caption,
  primaryAction,
  secondaryAction,
  className,
}: WorkspacePlaceholderStateProps) => (
  <div className={cn('flex h-full items-center justify-center p-6', className)}>
    <div className="panel w-full max-w-lg rounded-[28px] border border-line-subtle px-8 py-8 text-center shadow-[0_24px_80px_rgba(0,0,0,0.18)] backdrop-blur-xl">
      {icon ? (
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-line-subtle bg-paper-2/10">
          <Icon icon={icon} className="h-6 w-6 text-dim-2" aria-hidden="true" />
        </div>
      ) : null}
      <h3 className="mt-4 text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-2 text-sm text-dim-2">{description}</p>
      {caption ? <p className="mt-2 text-xs text-dim-2">{caption}</p> : null}
      {primaryAction || secondaryAction ? (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {primaryAction ? renderActionButton(primaryAction) : null}
          {secondaryAction ? renderActionButton(secondaryAction) : null}
        </div>
      ) : null}
    </div>
  </div>
);

export default WorkspacePlaceholderState;
