import type { ComponentChildren } from 'preact';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { Input } from '@/shared/ui/input';
import { cn } from '@/shared/utils/cn';

export interface CollectionToolbarProps {
  title?: ComponentChildren;
  description?: ComponentChildren;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  searchLabel?: string;
  resultSummary?: ComponentChildren;
  filters?: ComponentChildren;
  actions?: ComponentChildren;
  className?: string;
  compact?: boolean;
}

export const CollectionToolbar = ({
  title,
  description,
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search',
  searchLabel = 'Search',
  resultSummary,
  filters,
  actions,
  className,
  compact = false,
}: CollectionToolbarProps) => {
  const hasSearch = typeof searchValue === 'string' && Boolean(onSearchChange);

  return (
    <section
      className={cn(
        'rounded-2xl border border-line-glass/30 bg-surface-panel/70 backdrop-blur-xl',
        compact ? 'p-3' : 'p-4 sm:p-5',
        className
      )}
    >
      {(title || description || actions) ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          {(title || description) ? (
            <div className="min-w-0">
              {title ? <div className="text-sm font-semibold text-input-text sm:text-base">{title}</div> : null}
              {description ? <div className="mt-1 text-sm text-input-placeholder">{description}</div> : null}
            </div>
          ) : null}
          {actions ? <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div> : null}
        </div>
      ) : null}

      {(hasSearch || filters || resultSummary) ? (
        <div className={cn('grid gap-3', title || description || actions ? 'mt-4' : '')}>
          {(hasSearch || filters) ? (
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr),minmax(0,2fr)]">
              {hasSearch ? (
                <Input
                  type="search"
                  label={searchLabel}
                  value={searchValue}
                  onChange={onSearchChange}
                  placeholder={searchPlaceholder}
                  icon={MagnifyingGlassIcon}
                />
              ) : null}
              {filters ? (
                <div className={cn(hasSearch ? 'self-end' : '')}>
                  {filters}
                </div>
              ) : null}
            </div>
          ) : null}
          {resultSummary ? (
            <div className="text-xs font-medium uppercase tracking-[0.08em] text-input-placeholder">
              {resultSummary}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};

export default CollectionToolbar;

