
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
    </div>
  ) : null;
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
        'rounded-3xl border transition-all duration-300 p-4',
        onSelect ? 'cursor-pointer' : '',
        selected
          ? 'bg-accent-500/10 border-accent-500/40 shadow-lg shadow-accent-500/5'
          : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20',
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
