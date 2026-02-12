import type { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

export type TabItem = {
  id: string;
  label: string;
  count?: number;
};

interface TabsProps {
  items: TabItem[];
  activeId: string;
  onChange?: (id: string) => void;
  className?: string;
  actions?: ComponentChildren;
}

export const Tabs = ({ items, activeId, onChange, className = '', actions }: TabsProps) => (
  <div className={cn('flex flex-col gap-3', className)}>
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex flex-wrap items-center gap-4 border-b border-line-default" role="tablist">
        {items.map((item) => {
          const isActive = item.id === activeId;
          return (
            <button
              key={item.id}
              id={`tab-${item.id}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange?.(item.id)}
              className={cn(
                'pb-2 text-sm font-medium transition-colors',
                isActive
                  ? 'text-input-text border-b-2 border-input-text'
                  : 'text-gray-500 hover:text-input-text'
              )}
            >
              {item.label}
              {typeof item.count === 'number' && (
                <span className="ml-2 text-xs text-gray-400">{item.count}</span>
              )}
            </button>
          );
        })}
      </div>
      {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </div>
  </div>
);
