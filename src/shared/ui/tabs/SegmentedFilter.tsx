import { cn } from '@/shared/utils/cn';

export type SegmentItem = { id: string; label: string };

interface SegmentedFilterProps {
  items: SegmentItem[];
  activeId: string;
  onChange?: (id: string) => void;
  className?: string;
}

export const SegmentedFilter = ({ items, activeId, onChange, className }: SegmentedFilterProps) => (
  <div className={cn('inline-flex gap-1 rounded-lg bg-surface-elevated p-1', className)} role="tablist">
    {items.map((item) => {
      const isActive = item.id === activeId;
      return (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={isActive}
          onClick={() => onChange?.(item.id)}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            isActive
              ? 'bg-card text-input-text shadow-sm'
              : 'text-input-placeholder hover:text-input-text'
          )}
        >
          {item.label}
        </button>
      );
    })}
  </div>
);
