import type { ComponentChildren } from 'preact';
import { Button } from '@/shared/ui/Button';
import { cn } from '@/shared/utils/cn';

export interface CollectionFiltersProps {
  children: ComponentChildren;
  onReset?: () => void;
  resetLabel?: string;
  activeFilterCount?: number;
  className?: string;
}

export const CollectionFilters = ({
  children,
  onReset,
  resetLabel = 'Reset filters',
  activeFilterCount = 0,
  className,
}: CollectionFiltersProps) => (
  <div className={cn('grid gap-3 md:grid-cols-[minmax(0,1fr),auto]', className)}>
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {children}
    </div>
    {onReset ? (
      <div className="flex items-end">
        <Button variant="secondary" className="w-full md:w-auto" onClick={onReset}>
          {resetLabel}
          {activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
        </Button>
      </div>
    ) : null}
  </div>
);

export default CollectionFilters;

