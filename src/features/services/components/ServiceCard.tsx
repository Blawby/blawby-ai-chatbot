import { CheckIcon } from '@heroicons/react/24/outline';
import type { ComponentChildren, ComponentType, JSX } from 'preact';
import { cn } from '@/shared/utils/cn';

interface ServiceCardProps {
  title: string;
  description?: string;
  icon?: ComponentType<JSX.SVGAttributes<SVGSVGElement>>;
  selected?: boolean;
  onSelect?: () => void;
  actions?: ComponentChildren;
  headerActions?: ComponentChildren;
  className?: string;
}

export function ServiceCard({
  title,
  description,
  icon,
  selected = false,
  onSelect,
  actions,
  headerActions,
  className = ''
}: ServiceCardProps) {
  const Icon = icon;
  const rightContent = headerActions ? (
    <div className="flex items-center gap-2">
      {headerActions}
      {selected && <CheckIcon className="h-4 w-4 text-accent-600 dark:text-accent-400" />}
    </div>
  ) : (
    selected && <CheckIcon className="h-4 w-4 text-accent-600 dark:text-accent-400" />
  );
  const content = (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        {Icon && (
          <span className={cn(
            'mt-0.5 transition-colors',
            selected ? 'text-accent-500' : 'text-input-text/70'
          )}>
            <Icon className="h-5 w-5" />
          </span>
        )}
        <div>
          <p className="text-sm font-semibold text-input-text">{title}</p>
          {description && (
            <p className="mt-1 text-xs text-input-text/70">{description}</p>
          )}
        </div>
      </div>
      {rightContent}
    </div>
  );

  return (
    <div
      className={cn(
        'rounded-3xl border border-line-glass/40 bg-transparent p-4 transition',
        onSelect ? 'cursor-pointer focus-within:ring-2 focus-within:ring-accent-500/50' : '',
        selected
          ? 'ring-1 ring-accent-500/60 border-line-glass/60 bg-transparent'
          : 'hover:bg-surface-glass/30',
        className
      )}
    >
      {onSelect ? (
        <button
          type="button"
          onClick={onSelect}
          className="w-full text-left focus:outline-none"
          aria-pressed={selected}
        >
          {content}
        </button>
      ) : (
        content
      )}
      {actions && (
        <div className="mt-3 flex flex-wrap gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}
