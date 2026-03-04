import type { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

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
  void onSelect;
  const errorMessage = typeof error === 'string'
    ? error
    : error instanceof Error
      ? error.message
      : error != null
        ? 'Failed to load data.'
        : null;
  if (isLoading) {
    return (
      <div className={cn('p-4 text-sm text-input-placeholder', className)}>
        Loading...
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className={cn('p-4 text-sm text-red-400', className)}>
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
            <div key={item.id} className={cn(isSelected ? 'bg-white/10' : undefined)}>
              {renderItem(item, isSelected)}
            </div>
          );
        })}
      </div>
      {isLoadingMore ? (
        <div className="px-4 py-3 text-sm text-input-placeholder">Loading more...</div>
      ) : null}
      {loadMoreRef ? <div ref={loadMoreRef} className="h-6" /> : null}
    </div>
  );
}

export default EntityList;
