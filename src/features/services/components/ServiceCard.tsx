import { CheckIcon } from '@heroicons/react/24/outline';
import type { ComponentChildren, ComponentType, JSX } from 'preact';

interface ServiceCardProps {
  title: string;
  description?: string;
  icon?: ComponentType<JSX.SVGAttributes<SVGSVGElement>>;
  selected?: boolean;
  onSelect?: () => void;
  actions?: ComponentChildren;
  className?: string;
}

export function ServiceCard({
  title,
  description,
  icon,
  selected = false,
  onSelect,
  actions,
  className = ''
}: ServiceCardProps) {
  const Icon = icon;
  const content = (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        {Icon && (
          <span className={`mt-0.5 ${selected ? 'text-accent-600 dark:text-accent-400' : 'text-gray-400 dark:text-gray-500'}`}>
            <Icon className="h-5 w-5" />
          </span>
        )}
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</p>
          {description && (
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{description}</p>
          )}
        </div>
      </div>
      {selected && (
        <CheckIcon className="h-4 w-4 text-accent-600 dark:text-accent-400" />
      )}
    </div>
  );

  return (
    <div
      className={`border rounded-lg p-4 transition ${
        onSelect ? 'cursor-pointer focus-within:ring-2 focus-within:ring-accent-500' : ''
      } ${selected
        ? 'border-accent-500 bg-accent-50 dark:bg-accent-900/20'
        : 'border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card-bg'
      } ${className}`}
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
