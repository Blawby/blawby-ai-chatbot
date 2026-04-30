import type { ComponentChildren } from 'preact';
import { VList } from 'virtua';
import { cn } from '@/shared/utils/cn';
import { LoadingBlock } from '@/shared/ui/layout/LoadingBlock';
import { LoadingSpinner } from '@/shared/ui/layout/LoadingSpinner';
import { SELECTED_ACCENT_SURFACE_CLASS } from '@/shared/ui/layout/selectionStyles';

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
  /** Callback fired when the user scrolls near the end of the list. */
  onLoadMore?: () => void;
  /** Legacy IntersectionObserver sentinel; pass either this OR `onLoadMore`. */
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
  onLoadMore,
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
    return <div className={cn('p-4 text-sm text-red-400', className)}>{errorMessage}</div>;
  }

  if (items.length === 0) {
    return (
      <div className={cn('p-4', className)}>
        {emptyState ?? <div className="text-sm text-input-placeholder">No items found.</div>}
      </div>
    );
  }

  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
      <VList
        style={{ flex: 1, minHeight: 0 }}
        className="pt-1"
        onScrollEnd={onLoadMore}
      >
        {items.map((item) => {
          const isSelected = selectedId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={cn(
                'w-full text-left transition-colors duration-150 border-b border-line-glass/[0.04]',
                isSelected ? SELECTED_ACCENT_SURFACE_CLASS : 'hover:bg-surface-utility/40',
                onSelect && 'cursor-pointer'
              )}
              onClick={onSelect ? () => onSelect(item) : undefined}
            >
              {renderItem(item, isSelected)}
            </button>
          );
        })}
      </VList>
      {isLoadingMore ? (
        <div className="flex flex-shrink-0 justify-center px-4 py-3">
          <LoadingSpinner size="sm" ariaLabel="Loading more items" className="text-input-placeholder" />
        </div>
      ) : null}
      {loadMoreRef ? <div ref={loadMoreRef} className="h-6 flex-shrink-0" /> : null}
    </div>
  );
}

export default EntityList;
