import type { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';
import { LoadingBlock } from '@/shared/ui/layout/LoadingBlock';
import { LoadingSpinner } from '@/shared/ui/layout/LoadingSpinner';

type RefObject<T> = { current: T | null };

export type EntityListProps<T extends { id: string }> = {
  items: T[];
  renderItem: (item: T, isSelected: boolean) => ComponentChildren;
  onSelect: (item: T) => void;
  selectedId?: string;
  isLoading?: boolean;
  isLoadingMore?: boolean;
  error?: unknown;
  emptyState?: ComponentChildren;
  loadMoreRef?: RefObject<HTMLDivElement>;
  className?: string;
};

export function EntityList<T extends { id: string }>({
  items,
  renderItem,
  onSelect,
  selectedId,
  isLoading = false,
  isLoadingMore = false,
  error = null,
  emptyState,
  loadMoreRef,
  className,
}: EntityListProps<T>) {
  const errorMessage = typeof error === 'string'
    ? error
    : error instanceof Error
      ? error.message
      : error != null
        ? 'Failed to load data.'
        : null;
  if (isLoading) {
    return <LoadingBlock className={cn('p-4 text-sm', className)} />;
  }

  if (errorMessage) {
    return (
      <div className={cn('p-4 text-sm text-[rgb(var(--error-foreground))]', className)}>
        {errorMessage}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className={cn('p-4', className)}>
        {emptyState ?? <div className="text-sm text-input-placeholder">No items found.</div>}
      </div>
    );
  }

  return (
    <div className={cn('min-h-0 overflow-y-auto', className)}>
      <div className="pt-1 divide-y divide-line-glass/[0.04]">
        {items.map((item) => {
          const isSelected = selectedId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={cn(
                'w-full text-left transition-colors duration-150',
                isSelected ? 'bg-surface-utility/60' : 'hover:bg-surface-utility/40',
                onSelect && 'cursor-pointer'
              )}
              onClick={onSelect ? () => onSelect(item) : undefined}
            >
              {renderItem(item, isSelected)}
            </button>
          );
        })}
      </div>
      {isLoadingMore ? (
        <div className="flex justify-center px-4 py-3">
          <LoadingSpinner size="sm" ariaLabel="Loading more items" className="text-input-placeholder" />
        </div>
      ) : null}
      {loadMoreRef ? <div ref={loadMoreRef} className="h-6" /> : null}
    </div>
  );
}

export default EntityList;
